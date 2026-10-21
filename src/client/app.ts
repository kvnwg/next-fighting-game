/** The client application: wires networking, input, simulation, rendering and UI together. */
import * as THREE from 'three';
import { CHARACTERS, CharacterId } from '../shared/characters';
import { MATCH } from '../shared/config';
import { MAPS, LOBBY_MAP, MapDef, inSafeZone } from '../shared/maps';
import { angleDiff, dist2D, forward, yawTo } from '../shared/math';
import { CombatEvent, PROTOCOL_VERSION, ProfileView, RosterEntry, ServerMsg } from '../shared/protocol';
import { rankOf } from '../shared/ranks';
import { audio, Sfx } from './audio';
import { CameraRig } from './camera';
import { buildBlockers, constrainCamera } from './cameraClip';
import { ClientFighter } from './entities';
import { Bind, Input } from './input';
import { LocalController } from './local';
import { Net } from './net';
import { CharacterModel } from './render/character';
import { Effects } from './render/effects';
import { PixelRenderer } from './render/renderer';
import { portraitURL } from './render/portrait';
import { MapView } from './render/world';
import { saveSettings, settings } from './settings';
import { TouchControls, isTouchDevice } from './touch';
import { CardData, Preview, UI } from './ui';

type MatchMsg = Extract<ServerMsg, { t: 'match' }>;

/** kanji numerals for countdowns and round titles */
const KANJI_NUM = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export function startApp(root: HTMLElement, offline = false): void {
  new App(root, offline);
}

class App {
  private renderer: PixelRenderer;
  private scene: THREE.Scene;
  private cam: CameraRig;
  private effects: Effects;
  private input: Input;
  private net = new Net();
  private ui: UI;
  private touch: TouchControls | null = null;
  private mapView: MapView | null = null;
  private map: MapDef = LOBBY_MAP;
  private fighters = new Map<string, ClientFighter>();
  private local: LocalController | null = null;
  private myId = '';
  private profile: ProfileView | null = null;
  private kind: 'lobby' | 'arena' | null = null;
  private match: MatchMsg | null = null;
  private lastCountdown = -1;
  private queue: { since: number; count: number } | null = null;
  private lock: ClientFighter | null = null;
  private online = 0;
  private last = performance.now();
  private dodgePressAt = 0;
  private lastHitTarget: { id: string; until: number } | null = null;
  private buffSeen = new Map<string, boolean>();
  private fps = { frames: 0, t: 0, value: 0 };
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private tmp3 = new THREE.Vector3();
  private titleTime = 0;

  constructor(
    root: HTMLElement,
    private readonly offline: boolean,
  ) {
    this.renderer = new PixelRenderer(root, settings.pixelSize, settings.artStyle);
    this.scene = this.renderer.scene;
    this.cam = new CameraRig(this.renderer.camera);
    this.effects = new Effects(this.scene);
    this.input = new Input(this.renderer.renderer.domElement);
    const touch = isTouchDevice();
    this.input.touchMode = touch;
    this.input.onBind = (b, p, t) => this.onBind(b, p, t);
    this.input.onWheel = (dy) => this.cam.zoom(dy);
    this.ui = new UI(root, {
      onEnter: (name) => void this.connect(name),
      onRanked: () => this.net.send({ t: 'queue', mode: 'ranked' }),
      onPractice: (diff) => this.net.send({ t: 'queue', mode: 'practice', diff }),
      onCancelQueue: () => this.net.send({ t: 'unqueue' }),
      onSelectChar: (id) => this.selectChar(id),
      onLeaderboard: () => this.net.send({ t: 'leaderboard' }),
      onChat: (text) => this.net.send({ t: 'chat', text }),
      onChallengeReply: (from, accept) => this.net.send({ t: 'challengeReply', from, accept }),
      onForfeit: () => this.net.send({ t: 'forfeit' }),
      onSettingsChanged: () => {
        this.renderer.setPixelSize(settings.pixelSize);
        this.renderer.setStyle(settings.artStyle);
        audio.setVolume(settings.volume);
        saveSettings();
      },
      onModalChange: (open) => {
        this.input.suspended = open || this.ui.chatOpen;
        if (open) {
          this.input.exitLock();
          this.touch?.cancel();
          this.ui.setTouchMenu(false);
        }
      },
      onPrompt: () => this.sendChallenge(),
      createPreview: (el) => createPreview(el),
      portrait: (id) => portraitURL(this.renderer.renderer, id),
    }, offline, touch);
    if (touch) {
      this.touch = new TouchControls(this.ui.hud, this.input, {
        onMenu: () => this.ui.setTouchMenu(),
        onChat: () => {
          this.touch?.cancel();
          this.onBind('chat', true, performance.now());
        },
      });
    }
    this.loadMap(LOBBY_MAP);
    this.bindNet();
    requestAnimationFrame((t) => this.frame(t));
    // dev builds: reach the app from the console / screenshot scripts
    if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = this;
  }

  // ------------------------------------------------------------------ connection

  private async connect(name: string): Promise<void> {
    audio.unlock();
    audio.play('click');
    if (name.length < 2) {
      this.ui.setTitleStatus('Pick a name (2-16 letters).', true);
      return;
    }
    settings.name = name;
    saveSettings();
    this.ui.setTitleStatus(this.offline ? 'Starting…' : 'Connecting…');
    try {
      if (this.offline) {
        const { connectOffline } = await import('./offline');
        await this.net.connect(connectOffline);
      } else {
        await this.net.connect(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      }
    } catch (e) {
      this.ui.setTitleStatus(`${(e as Error).message} Is the server running? (npm run dev)`, true);
      return;
    }
    this.net.send({ t: 'hello', v: PROTOCOL_VERSION, token: settings.token || undefined, name, char: settings.char });
  }

  private bindNet(): void {
    const n = this.net;
    n.onClose = (reason) => {
      this.ui.showTitle();
      this.ui.setTitleStatus(`Disconnected: ${reason}. Press Enter to reconnect.`, true);
      this.input.exitLock();
      this.clearFighters();
      this.local = null;
      this.kind = null;
      this.match = null;
      this.loadMap(LOBBY_MAP);
    };
    n.on('welcome', (m) => {
      this.myId = m.id;
      settings.token = m.token;
      saveSettings();
      this.profile = m.profile;
      this.online = m.online;
      this.ui.setProfile(m.profile);
      this.ui.showGame();
      this.input.requestLock();
    });
    n.on('enter', (m) => this.enterInstance(m));
    n.on('roster', (m) => {
      for (const r of m.add ?? []) this.addFighter(r);
      for (const id of m.remove ?? []) this.removeFighter(id);
    });
    n.on('snap', (m) => this.applySnaps(m.f, m.s, true));
    n.on('st', (m) => this.applySnaps(m.f, m.s, false));
    n.on('fx', (m) => m.e.forEach((e) => this.onFx(e)));
    n.on('tp', (m) => this.local?.onTeleport(m.x, m.z, m.yaw, m.epoch, m.reason));
    n.on('push', (m) => this.local?.onPush(m.dx, m.dz));
    n.on('reject', (m) => this.local?.onReject(m.a, m.q));
    n.on('queue', (m) => {
      this.queue = m.mode ? { since: m.since, count: m.searching } : null;
    });
    n.on('match', (m) => this.onMatch(m));
    n.on('result', (m) => {
      this.ui.showResult(m, this.profile);
      audio.play(m.won ? 'victory' : 'defeat');
    });
    n.on('profile', (m) => {
      this.profile = m.profile;
      this.ui.setProfile(m.profile);
    });
    n.on('leaderboard', (m) => {
      this.ui.showLeaderboard(m.entries, m.you, m.total, this.profile);
      this.mapView?.setLeaderboard(m.entries);
    });
    n.on('challenge', (m) => {
      this.ui.showChallenge(m.from, m.name, m.char);
      audio.play('matchFound');
    });
    n.on('notice', (m) => this.ui.toast(m.text, m.kind));
    n.on('chat', (m) => this.ui.chat(m.name, m.text, m.sys));
    n.on('feed', (m) => this.ui.killFeed(m.killer, m.victim, m.how));
    n.on('online', (m) => (this.online = m.n));
  }

  // ------------------------------------------------------------------ world

  private loadMap(map: MapDef): void {
    this.mapView?.dispose();
    this.map = map;
    this.mapView = new MapView(map, this.scene);
    this.renderer.sunDir.copy(this.mapView.sunDir);
    this.renderer.setRim(this.mapView.rimColor);
    const blockers = buildBlockers(map);
    this.cam.constrain = (from, to) => constrainCamera(map, blockers, from, to);
    this.effects.setWeather(map.theme.weather);
    if (this.local) this.local.map = map;
  }

  private clearFighters(): void {
    for (const f of this.fighters.values()) f.dispose();
    this.fighters.clear();
    this.ui.clearPlates();
    this.lock = null;
  }

  private enterInstance(m: Extract<ServerMsg, { t: 'enter' }>): void {
    this.clearFighters();
    const map = Object.prototype.hasOwnProperty.call(MAPS, m.map) ? MAPS[m.map] : LOBBY_MAP;
    this.loadMap(map);
    this.kind = m.kind;
    this.local = null;
    for (const r of m.roster) this.addFighter(r);
    this.applySnaps(m.snap, this.net.serverNow(), true);
    const me = this.fighters.get(this.myId);
    if (me) {
      this.local = new LocalController(me, this.net, map);
      this.local.onAction = (a, ok) => {
        if (!ok) return;
        if (a === 'jump') audio.play('jump', 0.6);
      };
      this.local.onTeleport(m.x, m.z, m.yaw, m.epoch, undefined);
      this.cam.snapBehind(m.yaw);
    }
    this.ui.setLobbyMode(m.kind === 'lobby');
    this.ui.setDeath(null);
    if (m.kind === 'lobby') {
      this.match = null;
      this.ui.setMatch(null, 0);
      this.net.send({ t: 'leaderboard' });
    } else {
      this.queue = null;
      if (this.local) this.local.frozen = true;
    }
  }

  private addFighter(r: RosterEntry): void {
    const existing = this.fighters.get(r.id);
    if (existing) {
      existing.setRoster(r);
      if (r.id === this.myId) {
        settings.char = r.char;
        saveSettings();
        this.ui.toast(`Now playing ${CHARACTERS[r.char].name}.`, 'good');
      }
      return;
    }
    const f = new ClientFighter(r, r.id === this.myId, this.scene);
    this.fighters.set(r.id, f);
  }

  private removeFighter(id: string): void {
    const f = this.fighters.get(id);
    if (!f) return;
    if (this.lock === f) this.lock = null;
    f.dispose();
    this.fighters.delete(id);
    this.ui.removePlate(id);
  }

  private applySnaps(list: ServerMsg extends never ? never : Extract<ServerMsg, { t: 'snap' }>['f'], serverTime: number, positional: boolean): void {
    for (const s of list) {
      const f = this.fighters.get(s.i);
      if (!f) continue;
      const first = positional && f.pos.lengthSq() === 0 && !f.isLocal;
      f.applySnap(s, serverTime, positional);
      if (first) f.teleportTo(s.x, s.y, s.z, s.r);
      if (s.i === this.myId) this.local?.onServerState(s);
    }
  }

  private selectChar(id: CharacterId): void {
    settings.char = id;
    saveSettings();
    if (this.net.connected) this.net.send({ t: 'char', id });
  }

  // ------------------------------------------------------------------ match flow

  private onMatch(m: MatchMsg): void {
    const prev = this.match;
    this.match = m;
    const changed = !prev || prev.phase !== m.phase || prev.round !== m.round;
    if (!changed) return;
    if (this.local) this.local.frozen = m.phase === 'intro' || m.phase === 'countdown';
    const oppId = m.players[m.you === 0 ? 1 : 0].id;
    switch (m.phase) {
      case 'intro':
        this.ui.matchIntro(m.mode, m.map, m.players, m.you);
        audio.play('matchFound');
        break;
      case 'countdown':
        this.lastCountdown = -1;
        this.lock = this.fighters.get(oppId) ?? null;
        break;
      case 'fight':
        this.ui.banner('Fight', '', 900, 'fight', '始め');
        audio.play('fight');
        this.lock = this.fighters.get(oppId) ?? null;
        break;
      case 'roundEnd': {
        const w = m.roundWinner;
        this.ui.banner(w === -1 ? 'Draw' : w === m.you ? 'Round won' : 'Round lost', `${m.scores[m.you]} - ${m.scores[m.you === 0 ? 1 : 0]}`, 2500, w === -1 ? 'draw' : w === m.you ? 'win' : 'lose', w === -1 ? '引分' : w === m.you ? '勝' : '敗');
        break;
      }
      case 'matchEnd':
        this.ui.hideBanner();
        break;
    }
  }

  // ------------------------------------------------------------------ input

  private onBind(b: Bind, pressed: boolean, time: number): void {
    const inGame = !!this.local;
    if (b === 'escape') {
      if (!pressed) return;
      if (this.ui.chatOpen) this.ui.closeChat();
      else if (this.ui.modalOpen) this.ui.closeModal();
      else this.input.exitLock();
      this.input.suspended = this.ui.chatOpen || !!this.ui.modalOpen;
      return;
    }
    if (!inGame) return;
    if (b === 'chat') {
      if (pressed && !this.ui.chatOpen && !this.ui.modalOpen) {
        this.input.releaseAll();
        this.ui.openChat();
        this.input.suspended = true;
        this.input.exitLock();
      }
      return;
    }
    if (pressed && (b === 'chars' || b === 'leaderboard' || b === 'help')) {
      if (this.ui.chatOpen) return;
      this.ui.toggleModal(b === 'chars' ? 'chars' : b === 'leaderboard' ? 'ladder' : 'help');
      return;
    }
    if (pressed && (b === 'ranked' || b === 'practice')) {
      if (this.ui.chatOpen || this.kind !== 'lobby') return;
      if (b === 'practice') this.net.send({ t: 'queue', mode: 'practice', diff: this.ui.practiceDifficulty() });
      else this.net.send(this.queue ? { t: 'unqueue' } : { t: 'queue', mode: 'ranked' });
      return;
    }
    if (pressed && (b === 'accept' || b === 'decline')) {
      this.ui.answerChallenge(b === 'accept');
      return;
    }
    if (this.input.suspended) return;
    if (b === 'lock') {
      if (pressed) this.toggleLock();
      return;
    }
    if (b === 'challenge') {
      if (pressed) this.sendChallenge();
      return;
    }
    if (b === 'dodge' && pressed) this.dodgePressAt = performance.now();
    if (b === 'forward' || b === 'back' || b === 'left' || b === 'right') return;
    this.local!.handleBind(b, pressed, time, { camYaw: this.cam.yaw, lock: this.lock });
  }

  private sendChallenge(): void {
    const t = this.challengeTarget();
    if (t) this.net.send({ t: 'challenge', target: t.id });
  }

  private toggleLock(): void {
    if (this.lock) {
      this.lock = null;
      return;
    }
    this.lock = this.bestLockTarget();
  }

  private bestLockTarget(): ClientFighter | null {
    const me = this.local?.cf;
    if (!me) return null;
    let best: ClientFighter | null = null;
    let bestScore = Infinity;
    for (const f of this.fighters.values()) {
      if (f === me || f.s === 'dead') continue;
      const d = dist2D(me.pos.x, me.pos.z, f.pos.x, f.pos.z);
      if (d > 25) continue;
      const ang = Math.abs(angleDiff(this.cam.yaw, yawTo(me.pos.x, me.pos.z, f.pos.x, f.pos.z)));
      if (ang > 1.4) continue;
      const score = d + ang * 8;
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    return best;
  }

  private challengeTarget(): ClientFighter | null {
    if (this.kind !== 'lobby' || !this.local) return null;
    const me = this.local.cf;
    let best: ClientFighter | null = null;
    let bestD = 7;
    for (const f of this.fighters.values()) {
      if (f === me || f.roster.bot || f.s === 'dead') continue;
      const d = dist2D(me.pos.x, me.pos.z, f.pos.x, f.pos.z);
      const ang = Math.abs(angleDiff(this.cam.yaw, yawTo(me.pos.x, me.pos.z, f.pos.x, f.pos.z)));
      if (d < bestD && ang < 0.7) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ combat feedback

  private volumeAt(x: number, z: number): number {
    const ref = this.local?.cf.pos ?? this.renderer.camera.position;
    return Math.max(0.12, 1 - dist2D(ref.x, ref.z, x, z) / 35);
  }

  private onFx(e: CombatEvent): void {
    const pos = new THREE.Vector3(e.x, e.y, e.z);
    const d = this.fighters.get(e.d);
    const a = e.a ? this.fighters.get(e.a) : undefined;
    const meD = e.d === this.myId;
    const meA = e.a === this.myId;
    const mine = meD || meA;
    const vol = this.volumeAt(e.x, e.z);
    const play = (s: Sfx, v = vol) => audio.play(s, v);
    const head = (f: ClientFighter | undefined) => (f ? new THREE.Vector3(f.pos.x, f.pos.y + 2.1 * f.model.scale, f.pos.z) : pos);
    // impact freeze on both fighters
    const stop = (ms: number) => {
      d?.hitstop(ms);
      a?.hitstop(ms);
    };
    if (mine && e.a && e.d) this.lastHitTarget = { id: meA ? e.d : e.a, until: performance.now() + 5000 };

    switch (e.k) {
      case 'deflect':
        this.effects.burst(pos, { count: 28, color: ['#fff6c0', '#ffd24a', '#ffffff'], speed: 11, life: 0.3, size: 0.05, gravity: 6, drag: 3, stretch: 0.08 });
        this.effects.flash(pos, '#fff1a0', 1.0, 0.16);
        play('deflect');
        d?.model.react('deflect');
        a?.model.react('blocked');
        stop(75);
        if (mine) this.cam.shake(0.12, 0.15);
        if (meD) {
          this.ui.floatText('DEFLECT', pos.x, pos.y + 0.4, pos.z, 'good big', '弾');
          this.local?.onDeflected();
        }
        else if (meA) this.ui.floatText('DEFLECTED', pos.x, pos.y + 0.4, pos.z, 'bad');
        break;
      case 'block':
        this.effects.burst(pos, { count: 12, color: ['#ffb04a', '#ff8a2a', '#ffe0a0'], speed: 5, life: 0.35, size: 0.06 });
        play('block');
        a?.model.react('blocked');
        stop(40);
        if (meD) this.cam.shake(0.06, 0.1);
        break;
      case 'guardBreak':
        this.effects.burst(pos, { count: 40, color: ['#ff9a2a', '#ffd24a', '#ff5a2a'], speed: 8, life: 0.6, size: 0.09 });
        this.effects.ring(d?.pos ?? pos, '#ff9a2a', 3);
        play('guardBreak');
        stop(90);
        this.ui.floatText('GUARD BROKEN', head(d).x, head(d).y, head(d).z, 'warn big', '破');
        if (mine) this.cam.shake(0.2, 0.25);
        break;
      case 'hit':
      case 'armor':
        // bright streaking sparks + an impact star, over a few darker chips
        this.effects.burst(pos, { count: 16, color: ['#ffffff', '#fee761', '#feae34'], speed: 9, life: 0.22, size: 0.05, gravity: 4, drag: 4, stretch: 0.09 });
        this.effects.burst(pos, { count: 10, color: ['#e43b44', '#a22633', '#3e2731'], speed: 4, life: 0.45, size: 0.07 });
        this.effects.flash(pos, '#ffffff', 0.75, 0.1);
        d?.model.flash('#ffffff', 1.2);
        d?.model.react('hit');
        stop(70);
        play('hit');
        if (e.dmg) this.ui.floatText(`-${e.dmg}`, pos.x, pos.y + 0.3, pos.z, meD ? 'dmg me' : 'dmg');
        if (e.k === 'armor') this.ui.floatText('ARMOR', head(d).x, head(d).y, head(d).z, 'warn');
        if (meD) {
          this.cam.shake(0.15, 0.18);
          this.renderer.flash = 0.07;
          this.renderer.flashColor.set('#ff2a2a');
        } else if (meA) this.cam.shake(0.07, 0.12);
        break;
      case 'deathblow':
        this.effects.burst(pos, { count: 60, color: ['#ff2a2a', '#ffffff', '#7a0a0a'], speed: 9, life: 0.8, size: 0.1 });
        this.effects.ring(d?.pos ?? pos, '#ff2a2a', 4.5, 0.6);
        this.effects.flash(pos, '#ff4a4a', 1.4, 0.22);
        d?.model.flash('#ff2a2a', 1.4);
        d?.model.react('hit');
        stop(150);
        play('deathblow', Math.min(1, vol * 1.3));
        this.ui.floatText('DEATHBLOW', head(d).x, head(d).y + 0.3, head(d).z, 'bad huge', '止め');
        if (mine) {
          this.cam.shake(0.35, 0.4);
          this.renderer.flash = 0.2;
          this.renderer.flashColor.set('#ff1a1a');
        }
        break;
      case 'mikiri':
        this.effects.burst(pos, { count: 30, color: ['#ffffff', '#c8e8ff'], speed: 7, life: 0.5 });
        play('mikiri');
        stop(100);
        this.ui.floatText('MIKIRI COUNTER', head(d).x, head(d).y, head(d).z, 'good big', '見切り');
        if (mine) this.cam.shake(0.2, 0.2);
        break;
      case 'evade':
        if (e.tags?.includes('blink')) {
          this.effects.burst(pos, { count: 26, color: ['#9b6bff', '#3a2a5a', '#d0b8ff'], speed: 3, life: 0.6, size: 0.12, gravity: -1, up: 1 });
          play('blink');
        } else if (mine) this.ui.floatText('EVADED', head(d).x, head(d).y, head(d).z, 'muted');
        break;
      case 'counter':
        this.effects.burst(pos, { count: 24, color: ['#ffd24a', '#ffffff'], speed: 6, life: 0.45 });
        play('deflect');
        play('hit');
        a?.model.react('hit');
        stop(90);
        this.ui.floatText('COUNTER!', head(d).x, head(d).y, head(d).z, 'good big', '返し');
        if (e.dmg) this.ui.floatText(`-${e.dmg}`, head(a).x, head(a).y - 0.5, head(a).z, meA ? 'dmg me' : 'dmg');
        break;
      case 'feint':
        if (d) this.ui.floatText('FEINT', head(d).x, head(d).y, head(d).z, 'warn small');
        play('feint', vol * 0.8);
        break;
      case 'lava':
        this.effects.burst(pos, { count: 8, color: ['#ffb030', '#ff5a10'], speed: 2, up: 3, life: 0.5, gravity: -2 });
        if (meD) {
          play('burn');
          if (e.dmg) this.ui.floatText(`-${e.dmg}`, pos.x, pos.y + 1.5, pos.z, 'dmg me');
        }
        break;
      case 'fall':
        this.ui.floatText('RING OUT', pos.x, 1.5, pos.z, 'bad big', '落');
        break;
      default:
        break;
    }
    if (e.tags?.includes('broken') && d) {
      this.ui.floatText('POSTURE BROKEN', head(d).x, head(d).y + 0.4, head(d).z, 'warn big', '崩し');
      this.effects.ring(d.pos, '#ffb02a', 3.2);
      if (e.k !== 'guardBreak') play('guardBreak');
    }
    if (e.tags?.includes('abroken') && a) {
      this.ui.floatText('POSTURE BROKEN', head(a).x, head(a).y + 0.4, head(a).z, 'warn big', '崩し');
      this.effects.ring(a.pos, '#ffb02a', 3.2);
      play('guardBreak');
    }
    if (e.tags?.includes('backstab')) this.ui.floatText('BACKSTAB', head(d).x, head(d).y + 0.2, head(d).z, 'warn');
    if (e.tags?.includes('tipper')) this.ui.floatText('TIPPER', head(d).x, head(d).y + 0.2, head(d).z, 'warn small');
    if (e.heal && meA) this.ui.floatText(`+${e.heal}`, head(a).x, head(a).y, head(a).z, 'heal');
    if (e.tags?.includes('kill')) play('death', vol);
  }

  /** Effects a move's choreography asks for: dust on a stomp, a shockwave under a slam, petals off an iai cut. */
  private moveFx(f: ClientFighter): void {
    if (!f.fxQueue.length) return;
    const me = this.local?.cf;
    const far = !!me && dist2D(me.pos.x, me.pos.z, f.pos.x, f.pos.z) > 32;
    for (const { cue, pos, dir } of f.fxQueue) {
      if (far) continue;
      const sc = cue.scale;
      const color = cue.color ?? f.model.animator.style.trail.heavy;
      const fx = this.effects;
      switch (cue.kind) {
        case 'dust':
          fx.dust(pos, sc);
          break;
        case 'stomp':
          fx.dust(pos, sc * 1.4);
          fx.ring(pos, '#c8b49a', 1.6 * sc, 0.4);
          this.shakeNear(f, 0.05 * sc, 0.1);
          break;
        case 'shockwave':
          fx.shockwave(pos, sc, color);
          this.shakeNear(f, 0.24 * sc, 0.32);
          break;
        case 'quake':
          fx.quake(pos, dir, sc);
          this.shakeNear(f, 0.06 * sc, 0.12);
          break;
        case 'sparkle':
          fx.sparkle(pos, color, sc);
          break;
        case 'flashline': {
          // a glint running down the blade and past its point
          const grip = f.anchor('main', this.tmp2);
          const end = this.tmp3.subVectors(pos, grip).multiplyScalar(0.7 * sc).add(pos);
          fx.beam(grip, end, color, 0.035 * sc, 0.2);
          fx.sparkle(pos, '#ffffff', 0.8 * sc);
          break;
        }
        case 'petals':
          fx.petals(pos, sc);
          break;
        case 'spiral':
          fx.spiral(pos, dir, color, 2.4 * sc, sc);
          break;
        case 'whirl':
          fx.whirl(pos, sc, color);
          break;
        case 'smoke':
          fx.smoke(pos, sc);
          break;
        case 'wisps':
          fx.wisps(pos, color, sc);
          break;
        case 'soulfire':
          fx.soulfire(pos, sc);
          break;
        case 'chi':
          fx.chi(pos, dir, color, sc);
          break;
        case 'holy':
          fx.holy(pos, sc);
          this.shakeNear(f, 0.1 * sc, 0.2);
          break;
        case 'roar':
          fx.roar(pos, sc);
          this.shakeNear(f, 0.14 * sc, 0.3);
          break;
        case 'shake':
          this.shakeNear(f, 0.1 * sc, 0.15);
          break;
      }
    }
    f.fxQueue.length = 0;
  }

  /** Shake the camera for an impact, fading with distance from the local player. */
  private shakeNear(f: ClientFighter, amount: number, time: number): void {
    const me = this.local?.cf;
    if (!me) return;
    const d = dist2D(me.pos.x, me.pos.z, f.pos.x, f.pos.z);
    const k = f === me ? 1 : Math.max(0, 1 - d / 12);
    if (k > 0.05) this.cam.shake(amount * k, time);
  }

  /** Sounds and cues driven by state changes (works the same for you, players and bots). */
  private stateCues(f: ClientFighter, now: number): void {
    const v = f.view(now);
    const start = f.sim ? f.sim.stateStart : f.ss;
    const key = `${v.state}|${v.serial}|${Math.round(start)}`;
    if (key !== f.lastStateKey) {
      f.lastStateKey = key;
      const vol = this.volumeAt(f.pos.x, f.pos.z);
      if (v.state === 'attack' && v.attack?.perilous && f.lastPerilousSerial !== v.serial) {
        f.lastPerilousSerial = v.serial;
        audio.play('perilous', vol);
        this.effects.flash(this.tmp.set(f.pos.x, f.pos.y + 2.4 * f.model.scale, f.pos.z), '#ff2a2a', 1.4, 0.3);
      }
      if (v.state === 'dodge' && v.elapsed < 200) audio.play('dodge', vol * 0.8);
    }
    if (v.state === 'attack' && v.attack && !v.attack.noHitbox) {
      if (v.elapsed >= v.windup - 30 && f.lastSwingSerial !== v.serial) {
        f.lastSwingSerial = v.serial;
        audio.play(v.key === 'h' || v.attack.perilous ? 'heavySwing' : 'swing', this.volumeAt(f.pos.x, f.pos.z));
      }
      if (settings.parryCue && !f.isLocal && f.lastCueSerial !== v.serial && v.elapsed >= v.windup - 160 && v.elapsed < v.windup) {
        f.lastCueSerial = v.serial;
        const me = this.local?.cf;
        if (me && dist2D(me.pos.x, me.pos.z, f.pos.x, f.pos.z) < 14) {
          const tip = f.weaponTip(new THREE.Vector3());
          this.effects.flash(tip, v.attack.perilous ? '#ff4a3a' : '#ffffff', 0.55, 0.14);
        }
      }
    }
    const buff = (f.flags & 1) === 1 || (!!f.sim && f.sim.buffActive(now));
    if (buff && !this.buffSeen.get(f.id)) {
      audio.play('buff', this.volumeAt(f.pos.x, f.pos.z));
      f.model.react('roar');
      this.effects.ring(f.pos, '#ff6a2a', 2.5, 0.5);
    }
    this.buffSeen.set(f.id, buff);
  }

  // ------------------------------------------------------------------ frame

  private frame(t: number): void {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const now = this.net.serverNow();
    this.renderer.flash = Math.max(0, this.renderer.flash - dt * 3);

    const mouse = this.input.consumeMouse();
    this.cam.addMouse(mouse.dx, mouse.dy, settings.sensitivity, settings.invertY, !!this.lock);
    this.input.suspended = this.ui.chatOpen || !!this.ui.modalOpen;

    if (this.lock && (this.lock.s === 'dead' || !this.fighters.has(this.lock.id) || (this.local && dist2D(this.local.cf.pos.x, this.local.cf.pos.z, this.lock.pos.x, this.lock.pos.z) > 30))) {
      if (this.kind !== 'arena' || !this.fighters.has(this.lock.id)) this.lock = null;
    }

    if (this.local) {
      const others = [...this.fighters.values()].filter((f) => !f.isLocal);
      const sprint = this.input.isDown('dodge') && performance.now() - this.dodgePressAt > 220;
      this.local.update(dt, now, { axes: this.input.moveAxes(), camYaw: this.cam.yaw, sprint, others, lock: this.lock });
    }
    for (const f of this.fighters.values()) {
      f.interpolate(now);
      const buff = (f.flags & 1) === 1 || (!!f.sim && f.sim.buffActive(now));
      f.updateVisual(dt, now, buff);
      this.stateCues(f, now);
      this.moveFx(f);
    }

    // camera
    if (this.local) {
      const p = this.local.cf.pos;
      this.cam.update(dt, p, this.lock ? this.lock.pos : null);
      this.mapView?.update(dt, p);
    } else {
      // title screen: slow orbit over the plaza
      this.titleTime += dt;
      const a = this.titleTime * 0.06;
      this.renderer.camera.position.set(Math.sin(a) * 26, 9, Math.cos(a) * 26);
      this.renderer.camera.lookAt(0, 2.5, 0);
      this.mapView?.update(dt, new THREE.Vector3());
    }
    this.effects.update(dt, this.renderer.camera);
    this.updateHud(dt, now);
    this.renderer.render();

    this.fps.frames++;
    this.fps.t += dt;
    if (this.fps.t >= 1) {
      this.fps.value = Math.round(this.fps.frames / this.fps.t);
      this.fps.frames = 0;
      this.fps.t = 0;
    }
  }

  private project(x: number, y: number, z: number): { x: number; y: number } | null {
    const out = { x: 0, y: 0 };
    return this.renderer.project(this.tmp.set(x, y, z), out) ? out : null;
  }

  private updateHud(dt: number, now: number): void {
    this.ui.updateFloaters(dt, (x, y, z) => this.project(x, y, z));
    const local = this.local;
    if (!local) return;
    const me = local.cf;
    const sim = local.sim;
    this.ui.setNetInfo(this.online, this.offline ? null : Math.round(this.net.rtt), settings.showFps ? this.fps.value : null);
    this.ui.setHints(sim.char, now, { dodge: sim.dodgeReady, special: sim.specialReadyAt, ability: sim.abilityReadyAt });
    if (this.touch) {
      const charges = sim.dodgeReady;
      this.touch.update({
        specialReady: now >= sim.specialReadyAt && sim.isAlive() && (!this.match || this.match.phase === 'fight'),
        abilityName: sim.char.ability.name,
        abilityLeft: Math.max(0, sim.abilityReadyAt - now),
        dodgeLeft: charges.some((t) => t <= now) ? 0 : Math.max(0, Math.min(...charges) - now),
        locked: !!this.lock,
      });
    }
    this.ui.setPostureMain(sim.posture / sim.char.stats.posture, sim.state === 'broken');
    this.ui.setZone(this.kind === 'lobby' && inSafeZone(this.map, me.pos.x, me.pos.z));
    this.ui.setClickHint(!this.input.locked && !this.ui.modalOpen && !this.ui.chatOpen, this.input.locked, this.input.lockFailed);
    this.ui.setQueue(!!this.queue, this.queue?.since ?? 0, this.queue?.count ?? 0, now);
    this.ui.setMatch(this.match, now);

    // countdown numbers
    if (this.match?.phase === 'countdown') {
      const secs = Math.ceil((this.match.endsAt - now) / 1000);
      if (secs !== this.lastCountdown && secs > 0 && secs <= 3) {
        this.lastCountdown = secs;
        this.ui.banner(String(secs), `第${KANJI_NUM[this.match.round] ?? this.match.round}戦 · Round ${this.match.round}`, 950, 'count', KANJI_NUM[secs]);
        audio.play('countdown');
      }
    }

    // fighter cards: you (left) and your opponent / lock-on target (right)
    const m = this.match;
    const myScore = m ? m.scores[m.you] : null;
    const theirScore = m ? m.scores[m.you === 0 ? 1 : 0] : null;
    const prof = this.profile;
    const self: CardData = {
      name: prof?.name ?? '',
      title: prof ? rankOf(prof.mmr, prof.placements).label : '',
      char: sim.char,
      hp: sim.hp,
      special: me.specialCharge(now),
      broken: sim.state === 'broken',
      pips: myScore,
      pipMax: MATCH.roundsToWin,
      meta: prof && !m ? `${prof.wins}W ${prof.losses}L` : '',
    };
    this.ui.setCard('self', self);

    let target: ClientFighter | null = this.lock;
    if (!target && m) target = this.fighters.get(m.players[m.you === 0 ? 1 : 0].id) ?? null;
    if (!target && this.lastHitTarget && performance.now() < this.lastHitTarget.until) target = this.fighters.get(this.lastHitTarget.id) ?? null;
    if (target) {
      const r = target.roster;
      const title = r.dummy ? 'Training' : r.mmr !== undefined ? rankOf(r.mmr, r.placements ?? 0).label : r.bot ? 'AI' : '';
      const inMatch = !!m && m.players.some((p) => p.id === target!.id);
      this.ui.setCard('opp', {
        name: r.name,
        title,
        char: target.char,
        hp: target.hp,
        special: target.specialCharge(now),
        broken: target.s === 'broken',
        pips: inMatch ? theirScore : null,
        pipMax: MATCH.roundsToWin,
        meta: '',
      });
    } else this.ui.setCard('opp', null);

    // lock-on marker: a small diamond above the target's head
    if (this.lock) {
      const p = this.project(this.lock.pos.x, this.lock.pos.y + 2.5 * this.lock.model.scale, this.lock.pos.z);
      this.ui.setReticle(p ? p.x : null, p?.y ?? 0);
    } else this.ui.setReticle(null);

    // nameplates for everyone else in the lobby; whoever is on the opponent card (and anyone in an
    // arena) already has their name and health in the top HUD
    for (const f of this.fighters.values()) {
      if (f.isLocal) continue;
      if (f === target || this.kind === 'arena') {
        this.ui.plate(f.id, false);
        continue;
      }
      const d = dist2D(me.pos.x, me.pos.z, f.pos.x, f.pos.z);
      const visible = d < 40 && f.s !== 'dead';
      const p = visible ? this.project(f.pos.x, f.pos.y + 2.45 * f.model.scale, f.pos.z) : null;
      if (!p) {
        this.ui.plate(f.id, false);
        continue;
      }
      const r = f.roster;
      const color = r.dummy ? '#c9b8a0' : r.bot ? '#a0c8ff' : r.mmr !== undefined ? rankOf(r.mmr, r.placements ?? 0).color : '#ffffff';
      this.ui.plate(f.id, true, p.x, p.y, r.name, f.hp / f.char.stats.hp, color, f.char.name, f.po / f.char.stats.posture);
    }

    // challenge prompt / death
    const ct = this.challengeTarget();
    const who = ct ? `<b>${ct.roster.name.replace(/</g, '&lt;')}</b>` : '';
    this.ui.setPrompt(ct && sim.isAlive() ? (this.touch ? `Tap to challenge ${who} to a duel` : `<b>[G]</b> Challenge ${who} to a duel`) : null);
    if (this.kind === 'lobby' && sim.state === 'dead') this.ui.setDeath('Respawning in the shrine plaza…');
    else this.ui.setDeath(null);
    void forward;
  }
}

/** Small spinning character preview for the select screen. */
function createPreview(container: HTMLElement): Preview {
  const holder = document.createElement('div');
  holder.className = 'preview-holder';
  container.appendChild(holder);
  const r = new PixelRenderer(holder, 3, settings.artStyle);
  const scene = r.scene;
  scene.background = new THREE.Color('#1c1a24');
  scene.add(new THREE.HemisphereLight('#d8e4ff', '#4a4038', 1.5));
  const sun = new THREE.DirectionalLight('#fff0dc', 2.2);
  sun.position.set(3, 6, 4);
  scene.add(sun);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), new THREE.MeshLambertMaterial({ color: '#3a3446' }));
  disc.rotation.x = -Math.PI / 2;
  scene.add(disc);
  r.camera.position.set(0, 1.5, 4.4);
  r.camera.lookAt(0, 1.0, 0);
  let model: CharacterModel | null = null;
  let raf = 0;
  let t = 0;
  let last = performance.now();
  const cycle: { key: 'l0' | 'l1' | 'h' | 'sp' | null; ms: number }[] = [
    { key: null, ms: 1400 },
    { key: 'l0', ms: 0 },
    { key: 'l1', ms: 0 },
    { key: null, ms: 600 },
    { key: 'h', ms: 0 },
    { key: null, ms: 600 },
    { key: 'sp', ms: 0 },
  ];
  let idx = 0;
  let stateT = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    if (!model) return;
    model.root.rotation.y = Math.sin(t * 0.6) * 0.6;
    const step = cycle[idx];
    const atk = step.key ? (step.key[0] === 'l' ? model.char.lights[Number(step.key[1])] : step.key === 'h' ? model.char.heavy : model.char.special) : null;
    const total = atk ? atk.windup + atk.active + atk.recovery + 150 : step.ms;
    stateT += dt * 1000;
    model.update(
      { state: atk ? 'attack' : 'idle', elapsed: stateT, dur: total, attack: atk, windup: atk?.windup ?? 0, key: step.key ?? undefined, serial: idx, speed: 0, moveForward: 1, moveSide: 0, airborne: false, blockHeld: false, buff: false },
      dt,
    );
    if (stateT > total) {
      stateT = 0;
      idx = (idx + 1) % cycle.length;
    }
    r.resize();
    r.render();
  };
  loop();
  return {
    el: holder,
    setChar(id: CharacterId) {
      if (model) {
        scene.remove(model.root);
        model.dispose();
      }
      model = new CharacterModel(id);
      scene.add(model.root);
      idx = 0;
      stateT = 0;
    },
    dispose() {
      cancelAnimationFrame(raf);
      model?.dispose();
      r.renderer.dispose();
      r.renderer.forceContextLoss();
      holder.remove();
    },
  };
}
