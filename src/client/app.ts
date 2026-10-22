/** The client application: wires networking, input, simulation, rendering and UI together. */
import * as THREE from 'three';
import { AttackKey, CHARACTERS, CharacterId, executeSpacing, getAttack, isHeavyKey } from '../shared/characters';
import { COMBAT, MATCH } from '../shared/config';
import { MAPS, LOBBY_MAP, MapDef, inSafeZone } from '../shared/maps';
import { angleDiff, dist2D, forward, yawTo } from '../shared/math';
import { CombatEvent, PROTOCOL_VERSION, ProfileView, RosterEntry, ServerMsg } from '../shared/protocol';
import { rankOf } from '../shared/ranks';
import { audio } from './audio';
import { CameraRig, executionShots } from './camera';
import { CARD_AT, ENTRANCES, entranceStarts, introSequence } from './entrances';
import { ENTRANCE_MS } from './render/anim/animator';
import { buildBlockers, constrainCamera } from './cameraClip';
import { ClientFighter } from './entities';
import { AURAS } from './auras';
import { Bind, Input } from './input';
import { LocalController } from './local';
import { Net } from './net';
import { CharacterModel } from './render/character';
import { Effects } from './render/effects';
import { GameRenderer } from './render/renderer';
import { G } from './render/gfx/globals';
import { portraitURL } from './render/portrait';
import { SelectScreen } from './select';
import { MapView } from './render/world';
import { TITLE_MAP } from './render/maps/title';
import { TitleScene } from './title/scene';
import { TitleScreen } from './title/screen';
import { platform } from './platform';
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
  private renderer: GameRenderer;
  private graphics = settings.graphics;
  private scene: THREE.Scene;
  private cam: CameraRig;
  private effects: Effects;
  private input: Input;
  private net = new Net();
  private ui: UI;
  private select: SelectScreen;
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
  /** seconds left of the red-and-black beat after a posture break */
  private drama = 0;
  /** the execution cinematic running (only for one you're in) */
  private exec: { a: ClientFighter; d: ClientFighter; t: number; start: number; hitDone: boolean } | null = null;
  /** the map's own fighter rim strength, restored after an execution */
  private rimBase = 0.6;
  /** back-to-back deflects build up the spectacle */
  private deflectStreak = 0;
  private lastDeflectAt = -Infinity;
  /** the ring entrances playing in the match intro: whose, when, and which cues have fired */
  private intro: { start: number; turns: { f: ClientFighter; r: RosterEntry; mine: boolean; at: number }[]; fired: Set<string> } | null = null;
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
  /** the title screen: the Ronin on the cliff (3D) and the menus over it, until the game starts */
  private titleScene: TitleScene | null = null;
  private titleScreen: TitleScreen | null = null;
  /** someone wants a copy of the next rendered frame (the title's cut into the game) */
  private snapWant: ((frame: HTMLCanvasElement) => void) | null = null;

  constructor(
    root: HTMLElement,
    private readonly offline: boolean,
  ) {
    this.renderer = new GameRenderer(root, settings.graphics, { dynamicResolution: settings.graphics === 'auto' });
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
        if (settings.graphics !== this.graphics) {
          // a new tier changes how much scenery, grass and particle detail the map is built with
          this.graphics = settings.graphics;
          this.renderer.setQuality(settings.graphics);
          if (this.map) this.loadMap(this.map);
        }
        audio.setVolume(settings.volume);
        saveSettings();
      },
      onModalChange: (open) => {
        this.input.suspended = open || this.ui.chatOpen;
        if (open) {
          this.input.exitLock();
          this.touch?.cancel();
          this.ui.setTouchMenu(false);
          // menus are breaks
          platform.gameplayStop();
        } else if (this.myId) platform.gameplayStart();
      },
      onPrompt: () => this.sendChallenge(),
      createPreview: (el) => createPreview(el),
      portrait: (id) => portraitURL(this.renderer.renderer, id),
    }, offline, touch);
    this.select = new SelectScreen(root, (id) => portraitURL(this.renderer.renderer, id), (v) => {
      this.net.send({ t: 'vote', ...v });
      audio.play('click', 0.5);
      if (v.char) {
        settings.char = v.char;
        saveSettings();
        this.ui.setLobbyChar(v.char);
      }
    });
    if (touch) {
      this.touch = new TouchControls(this.ui.hud, this.input, {
        onMenu: () => this.ui.setTouchMenu(),
        onChat: () => {
          this.touch?.cancel();
          this.onBind('chat', true, performance.now());
        },
      });
    }
    this.openTitle();
    this.titleScreen!.boot();
    this.bindNet();
    requestAnimationFrame((t) => this.frame(t));
    // the title screen is up: loading is over
    requestAnimationFrame(() => platform.loadingStop());
    audio.setMuted('platform', platform.settings.muteAudio);
    audio.setListener(this.renderer.camera);
    platform.onSettingsChange((p) => audio.setMuted('platform', p.muteAudio));
    // a signed-in CrazyGames player gets their name filled in
    if (!settings.name) void platform.username().then((name) => name && this.titleScreen?.setName(name));
    // dev builds: reach the app from the console / screenshot scripts
    if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = this;
  }

  // ------------------------------------------------------------------ title screen

  /** The cliff at sunset, with the Ronin and the menus over it. */
  private openTitle(): void {
    this.loadMap(TITLE_MAP);
    this.titleScene = new TitleScene(this.scene, this.renderer, this.mapView!);
    this.titleScreen ??= new TitleScreen(this.renderer.container, {
      touch: this.input.touchMode,
      offline: this.offline,
      name: settings.name,
      renderer: this.renderer,
      scene: () => this.titleScene,
      onSubmit: (name) => void this.connect(name),
    });
  }

  private closeTitle(): void {
    this.titleScene?.dispose();
    this.titleScene = null;
    this.titleScreen = null;
  }

  /** The account is ready: play the welcome, cut to the game, then let the game's messages in. */
  private async onWelcomeHeld(profile: ProfileView, isNew: boolean): Promise<void> {
    const screen = this.titleScreen;
    if (!screen) return this.net.release();
    if (!(await screen.welcome(profile, isNew)) || !this.net.connected) return;
    const frame = await new Promise<HTMLCanvasElement | null>((res) => {
      this.snapWant = res;
      // no frame within a moment (a hidden tab): dissolve instead
      setTimeout(() => res(null), 400);
    });
    this.snapWant = null;
    if (frame) screen.slash(frame);
    else screen.dissolve();
    this.closeTitle();
    this.net.release();
  }

  // ------------------------------------------------------------------ connection

  private async connect(name: string): Promise<void> {
    audio.unlock();
    audio.play('click');
    const screen = this.titleScreen;
    if (!screen) return;
    if (name.length < 2) {
      screen.setStatus('Pick a name (2-16 letters).', true);
      return;
    }
    settings.name = name;
    saveSettings();
    screen.setStatus('');
    screen.forging();
    const isNew = !settings.token;
    try {
      if (this.offline) {
        const { connectOffline } = await import('./offline');
        await this.net.connect(connectOffline);
      } else {
        await this.net.connect(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      }
    } catch (e) {
      screen.failed(`${(e as Error).message}${this.offline ? '' : ' Is the server running? (npm run dev)'}`);
      return;
    }
    // hold the game back until the welcome has played out
    this.net.hold();
    this.net.onHeld = (m) => {
      if (m.t === 'welcome') void this.onWelcomeHeld(m.profile, isNew);
    };
    this.net.send({ t: 'hello', v: PROTOCOL_VERSION, token: settings.token || undefined, name, char: settings.char });
  }

  private bindNet(): void {
    const n = this.net;
    n.onClose = (reason) => {
      platform.gameplayStop();
      this.myId = '';
      this.ui.showTitle();
      this.input.exitLock();
      this.clearFighters();
      this.local = null;
      this.kind = null;
      this.ui.setCharsLocked(false);
      this.match = null;
      this.cam.stopShots();
      this.endEntrances();
      this.select.hide();
      const text = `Disconnected: ${reason}. Press Enter to reconnect.`;
      if (this.titleScreen?.active) {
        // dropped while the welcome was playing
        this.titleScreen.failed(text);
        return;
      }
      this.titleScreen?.el.remove();
      this.titleScreen = null;
      this.titleScene?.dispose();
      this.titleScene = null;
      this.openTitle();
      this.titleScreen!.resume(text);
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
      platform.gameplayStart();
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
    n.on('select', (m) => {
      if (!this.select.open) {
        this.queue = null;
        this.input.exitLock();
        this.touch?.cancel();
        audio.play('matchFound');
      }
      this.select.show(m);
      if (this.local) this.local.frozen = true;
    });
    n.on('selectCancel', (m) => {
      this.select.hide();
      if (this.local && this.kind === 'lobby') this.local.frozen = false;
      this.ui.toast(m.reason, 'warn');
    });
    n.on('result', (m) => {
      this.ui.showResult(m, this.profile);
      audio.play(m.won ? 'victory' : 'defeat');
      platform.gameplayStop();
      // a ranked promotion is the rare moment CrazyGames' celebration is for
      if (m.before && m.after && rankOf(m.after.mmr, m.after.placements).label !== rankOf(m.before.mmr, m.before.placements).label && (m.delta ?? 0) > 0) platform.happytime();
      // after a match is the natural break for an ad: never mid-fight
      setTimeout(() => {
        void platform.requestMidgameAd(() => audio.setMuted('ad', true)).then(() => audio.setMuted('ad', false));
      }, 1200);
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
    audio.setSpace(map.id);
    this.mapView = new MapView(map, this.scene, this.renderer);
    const blockers = buildBlockers(map);
    this.cam.constrain = (from, to, wallsOnly) => constrainCamera(map, wallsOnly ? [] : blockers, from, to);
    // weather and ambient particles belong to the map's recipe now
    this.effects.setWeather(null);
    this.effects.clearBlood();
    if (this.local) this.local.map = map;
  }

  private clearFighters(): void {
    for (const f of this.fighters.values()) f.dispose();
    this.fighters.clear();
    this.ui.clearPlates();
    this.lock = null;
  }

  private enterInstance(m: Extract<ServerMsg, { t: 'enter' }>): void {
    this.cam.stopShots();
    this.endEntrances();
    this.select.hide();
    this.clearFighters();
    const map = Object.prototype.hasOwnProperty.call(MAPS, m.map) ? MAPS[m.map] : LOBBY_MAP;
    this.loadMap(map);
    this.kind = m.kind;
    this.ui.setCharsLocked(m.kind === 'arena');
    this.local = null;
    for (const r of m.roster) this.addFighter(r);
    this.applySnaps(m.snap, this.net.serverNow(), true);
    const me = this.fighters.get(this.myId);
    if (me) {
      this.local = new LocalController(me, this.net, map);
      this.local.onAction = (a, ok) => {
        if (!ok) return;
        if (a === 'jump') audio.jump(me.roster.char, { vol: 0.6, pos: me.pos });
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
        this.ui.setLobbyChar(r.char);
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
    this.ui.setLobbyChar(id);
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
      case 'intro': {
        this.ui.matchIntro(m.mode, m.map, m.players, m.you);
        audio.play('matchFound');
        // a close-up on them, one on you, and back behind your shoulder for the countdown
        const me = this.fighters.get(this.myId);
        const op = this.fighters.get(oppId);
        if (me && op) this.startEntrances(m, me, op);
        break;
      }
      case 'countdown':
        this.endEntrances();
        this.lastCountdown = -1;
        this.lock = this.fighters.get(oppId) ?? null;
        break;
      case 'fight':
        // a slow device can still be mid-intro: the fight always starts on the follow camera
        this.cam.stopShots();
        this.endEntrances();
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

  /** The wide shot, the opponent's ring entrance, then yours, then round behind your shoulder. */
  private startEntrances(m: MatchMsg, me: ClientFighter, op: ClientFighter): void {
    const start = m.endsAt - MATCH.introTime;
    const at = entranceStarts();
    const mine = m.players[m.you];
    const theirs = m.players[m.you === 0 ? 1 : 0];
    me.entrance = { start: start + at.me, dur: ENTRANCE_MS };
    op.entrance = { start: start + at.op, dur: ENTRANCE_MS };
    this.intro = {
      start,
      turns: [
        { f: op, r: theirs, mine: false, at: start + at.op },
        { f: me, r: mine, mine: true, at: start + at.me },
      ],
      fired: new Set(),
    };
    const subject = (f: ClientFighter) => ({ pos: f.pos, yaw: f.yaw, scale: f.model.scale, char: f.roster.char });
    const end = this.cam.restPose(me.pos, op.pos);
    this.cam.playShots(introSequence(subject(me), subject(op), end), Math.max(0, this.net.serverNow() - start) / 1000);
    this.ui.setCinematic(true);
  }

  private endEntrances(): void {
    if (!this.intro) return;
    for (const t of this.intro.turns) t.f.entrance = null;
    this.intro = null;
    this.ui.setCinematic(false);
  }

  /** Each entrance's sounds and its name card, fired as it plays. */
  private entranceCues(now: number): void {
    const intro = this.intro;
    if (!intro) return;
    if (now > intro.start + MATCH.introTime + 500) return this.endEntrances();
    for (const t of intro.turns) {
      const s = (now - t.at) / ENTRANCE_MS;
      if (s < 0 || s > 1) continue;
      const e = ENTRANCES[t.r.char];
      // a cue more than a beat late (a slow frame, joining late) is dropped, not bunched up
      e.sfx.forEach((c, i) => {
        const key = `${t.r.id}:${i}`;
        if (s >= c.s && s < c.s + 0.12 && !intro.fired.has(key)) {
          intro.fired.add(key);
          audio.play(c.sound, c.vol ?? 1);
        }
      });
      const key = `${t.r.id}:card`;
      if (s >= CARD_AT && s < CARD_AT + 0.15 && !intro.fired.has(key)) {
        intro.fired.add(key);
        this.ui.nameCard(t.r, t.mine, e.title, e.line, (1 - CARD_AT) * ENTRANCE_MS + 250);
      }
    }
  }

  // ------------------------------------------------------------------ input

  private onBind(b: Bind, pressed: boolean, time: number): void {
    const inGame = !!this.local;
    if (b === 'escape') {
      if (!pressed) return;
      if (this.ui.chatOpen) this.ui.closeChat();
      else if (this.ui.modalOpen) this.ui.closeModal();
      else if (this.ui.closePlayPanel()) return;
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
    // no words or numbers over a fight: Dueling Grounds shows none
    const say = (..._: unknown[]): void => undefined;
    const head = (f: ClientFighter | undefined) => (f ? new THREE.Vector3(f.pos.x, f.pos.y + 2.1 * f.model.scale, f.pos.z) : pos);
    // impact freeze on both fighters; the one struck shudders through it
    const stop = (ms: number, shudder = 0) => {
      d?.hitstop(ms, shudder);
      a?.hitstop(ms);
    };
    if (mine && e.a && e.d) this.lastHitTarget = { id: meA ? e.d : e.a, until: performance.now() + 5000 };
    // heavies, specials and abilities hit harder: longer freeze, bigger shake, more sparks
    const heavy = isHeavyKey(e.key) || e.key === 'sp' || e.key === 'ab' || e.key === 'ia' || e.key === 'ct';
    const swing = a ? a.swingDir : new THREE.Vector3(0, 0, 1);

    // your attack connected: its on-contact cancels open on your side too (the server has its own)
    if (meA && this.local && (e.k === 'hit' || e.k === 'armor' || e.k === 'block' || e.k === 'guardBreak')) this.local.sim.contactSerial = this.local.sim.attackSerial;
    switch (e.k) {
      case 'deflect': {
        // the clash, as Dueling Grounds does it: a gold streak and flash at the blades, a brief
        // orange tint, embers falling. No freeze, no shake, no zoom, no text.
        const nowMs = performance.now();
        const streak = (this.deflectStreak = nowMs - this.lastDeflectAt < 2500 ? this.deflectStreak + 1 : 1);
        this.lastDeflectAt = nowMs;
        const big = (heavy ? 1.2 : 1) * (1 + 0.1 * Math.min(3, streak - 1));
        const toCam = this.tmp3.subVectors(this.renderer.camera.position, pos).normalize();
        this.effects.flash(pos, '#fff6d0', 0.9 * big, 0.1);
        this.effects.flash(pos, '#ffb02a', 1.6 * big, 0.2);
        this.effects.slash(pos, this.tmp2.set(0, 1, 0).cross(toCam).normalize(), '#ffd24a', 1.3 * big, 0.06);
        this.effects.burst(pos, { count: Math.round(14 * big), color: ['#fff6c0', '#ffd24a', '#ffffff'], speed: 9, life: 0.25, size: 0.04, gravity: 6, drag: 3, stretch: 0.1 });
        this.effects.burst(pos, { count: Math.round(16 * big), color: ['#ffd24a', '#ff9a2a', '#fff6c0'], speed: 3, up: 2, life: 0.45, size: 0.035, gravity: 9, drag: 0.8 });
        d?.model.react('deflect');
        a?.model.react('blocked');
        a?.model.flash('#ffc34a', 0.8);
        if (mine) {
          this.renderer.flash = 0.2;
          this.renderer.flashColor.set('#ff9a2a');
        }
        if (meD) this.local?.onDeflected();
        break;
      }
      case 'block':
        this.effects.burst(pos, { count: 10, color: ['#ffb04a', '#ff8a2a', '#ffe0a0'], speed: 5, life: 0.3, size: 0.05 });
        a?.model.react('blocked');
        if (d) d.model.react('guard', { side: Math.max(-1, Math.min(1, swing.x * Math.cos(d.yaw) - swing.z * Math.sin(d.yaw))), heavy });
        break;
      case 'guardBreak':
        this.effects.burst(pos, { count: 24, color: ['#ff9a2a', '#ffd24a', '#ff5a2a'], speed: 7, life: 0.45, size: 0.07 });
        // the guard shatters like glass
        this.effects.shards(pos, swing, 24);
        d?.model.flash('#ff7a2a', 1);
        if (meA) this.cam.shake(0.16, 0.2);
        break;
      case 'hit':
      case 'armor':
        // as Dueling Grounds draws it: one thin red slash through the contact, and blood (that
        // armour soaks). Only the one who landed it feels it in the camera.
        if (e.k === 'hit') this.effects.blood(pos, swing, heavy ? 1.3 : 0.9);
        this.effects.slash(pos, swing, '#ff2a3a', heavy ? 1.6 : 1.2, heavy ? 0.05 : 0.035);
        this.effects.burst(pos, { count: heavy ? 6 : 4, color: ['#ffffff', '#ff8a8a'], speed: 6, life: 0.15, size: 0.035, gravity: 4, drag: 4, stretch: 0.08 });
        d?.model.flash('#ffffff', 0.9);
        // knocked the way the blade went: + travels toward the defender's left
        if (d) d.model.react('hit', { side: Math.max(-1, Math.min(1, swing.x * Math.cos(d.yaw) - swing.z * Math.sin(d.yaw))), heavy });
        if (meA) this.cam.shake(heavy ? 0.2 : 0.13, heavy ? 0.24 : 0.16);
        break;
      case 'deathblow':
        // the execution begins: the strike that caught them broken locks the pair in
        if (d && a) d.execBy = a.roster.char;
        this.effects.ring(d?.pos ?? pos, '#ff2a2a', 3.2, 0.5);
        this.effects.flash(pos, '#ff4a4a', 1.2, 0.2);
        d?.model.flash('#ff2a2a', 1);
        stop(90, 0.05);
        if (mine && a && d) this.startExecution(a, d);
        break;
      case 'execute': {
        // the finishing blow
        if (this.exec) this.exec.hitDone = true;
        const toCam = this.tmp3.subVectors(this.renderer.camera.position, pos).normalize();
        this.effects.blood(pos, swing, 1.8);
        this.effects.shatter(pos, 0.9);
        this.effects.hitFlare(pos, swing, toCam, '#ff1a3a', 1.2);
        this.effects.slash(pos, swing, '#ffffff', 2.2, 0.1);
        this.effects.shockwave(d?.pos ?? pos, 1.6, '#ff3a3a');
        this.effects.ring(d?.pos ?? pos, '#ff2a2a', 6, 0.7);
        this.effects.burst(pos, { count: 45, color: ['#ff2a2a', '#ffffff', '#7a0a0a'], speed: 10, life: 0.8, size: 0.08, gravity: 8 });
        d?.model.flash('#ffffff', 1.6);
        d?.model.react('hit');
        stop(300, 0.12);
        say(e.tags?.includes('kill') ? 'EXECUTED' : `-${e.dmg ?? 0}`, head(d).x, head(d).y + 0.3, head(d).z, 'bad huge', '処刑');
        if (mine) {
          this.cam.shake(0.55, 0.55);
          if (d) this.cam.punchIn(d.pos, 0.45);
          this.renderer.flash = 0.3;
          this.renderer.flashColor.set('#ffffff');
        }
        break;
      }
      case 'mikiri':
        this.effects.burst(pos, { count: 30, color: ['#ffffff', '#c8e8ff'], speed: 7, life: 0.5 });
        say('MIKIRI COUNTER', head(d).x, head(d).y, head(d).z, 'good big', '見切り');
        if (mine) {
          this.cam.shake(0.14, 0.18);
        }
        break;
      case 'evade':
        if (e.tags?.includes('blink')) {
          this.effects.burst(pos, { count: 26, color: ['#9b6bff', '#3a2a5a', '#d0b8ff'], speed: 3, life: 0.6, size: 0.12, gravity: -1, up: 1 });
        } else if (mine) say('EVADED', head(d).x, head(d).y, head(d).z, 'muted');
        break;
      case 'counter':
        this.effects.burst(pos, { count: 24, color: ['#ffd24a', '#ffffff'], speed: 6, life: 0.45 });
        a?.model.react('hit');
        say('COUNTER!', head(d).x, head(d).y, head(d).z, 'good big', '返し');
        if (e.dmg) say(`-${e.dmg}`, head(a).x, head(a).y - 0.5, head(a).z, meA ? 'dmg me' : 'dmg');
        break;
      case 'feint':
        if (d) say('FEINT', head(d).x, head(d).y, head(d).z, 'warn small');
        break;
      case 'lava':
        this.effects.burst(pos, { count: 8, color: ['#ffb030', '#ff5a10'], speed: 2, up: 3, life: 0.5, gravity: -2 });
        if (meD) {
          if (e.dmg) say(`-${e.dmg}`, pos.x, pos.y + 1.5, pos.z, 'dmg me');
        }
        break;
      case 'fall':
        say('RING OUT', pos.x, 1.5, pos.z, 'bad big', '落');
        break;
      default:
        break;
    }
    if (e.tags?.includes('broken') && d) {
      // a posture break: a red X slashed across them and the screen tinted red for a beat
      const chest = this.tmp.set(d.pos.x, d.pos.y + 1.2 * d.model.scale, d.pos.z);
      const toCam = this.tmp3.subVectors(this.renderer.camera.position, chest).normalize();
      const side = this.tmp2.set(0, 1, 0).cross(toCam).normalize();
      for (const s of [1, -1]) this.effects.slash(chest, new THREE.Vector3().copy(side).multiplyScalar(s).add(new THREE.Vector3(0, 1, 0)).normalize(), '#ff1a2a', 2, 0.07);
      this.effects.shatter(chest, 0.8);
      if (mine) this.drama = 0.3;
    }
    if (e.tags?.includes('abroken') && a) {
      const chest = this.tmp.set(a.pos.x, a.pos.y + 1.2 * a.model.scale, a.pos.z);
      this.effects.shatter(chest, 0.8);
    }
    // the sound of it all: who hit whom, with what, on what (audio.ts / audio/recipes.ts)
    audio.combat(e, { a: a?.roster.char, d: d?.roster.char, vol, pos, heavy, mine, streak: e.k === 'deflect' ? this.deflectStreak : 1 });
  }

  /** Effects a move's choreography asks for: dust on a stomp, a shockwave under a slam, petals off an iai cut. */
  /** Per-fighter aura emitters: how many puffs are owed, and where the fighter was last frame. */
  private auraState = new Map<string, { acc: number; prev: THREE.Vector3 }>();

  /** The fighter's ambient aura (see auras.ts): puffs off the body, more on the move, off the blade in a swing. */
  private auraFx(f: ClientFighter, dt: number): void {
    const aura = AURAS[f.roster.char];
    if (!aura || dt <= 0 || !f.model.root.visible) return;
    const cam = this.renderer.camera.position;
    if (f.pos.distanceToSquared(cam) > 40 * 40) return;
    let st = this.auraState.get(f.id);
    if (!st) this.auraState.set(f.id, (st = { acc: 0, prev: f.pos.clone() }));
    const vx = (f.pos.x - st.prev.x) / dt;
    const vz = (f.pos.z - st.prev.z) / dt;
    st.prev.copy(f.pos);
    const speed = Math.min(6, Math.hypot(vx, vz));
    const k = f.model.scale;
    const fx = this.effects;
    const color = () => aura.colors[Math.floor(Math.random() * aura.colors.length)];
    const opts = { life: aura.life, size: aura.size * k, gravity: -aura.rise * 0.35, drag: 1.1, grow: aura.grow };
    // off the body: rising, streaming back against the way he's moving
    st.acc += (aura.rate + aura.moveRate * Math.min(1, speed / 3)) * dt;
    const fw = forward(f.yaw);
    while (st.acc >= 1) {
      st.acc -= 1;
      const side = (Math.random() * 2 - 1) * aura.spread * k;
      const h = (aura.from[0] + Math.random() * (aura.from[1] - aura.from[0])) * k;
      const back = (Math.random() * 0.12 - 0.1) * k;
      fx.emit(
        f.pos.x + fw.z * side + fw.x * back,
        f.pos.y + h,
        f.pos.z - fw.x * side + fw.z * back,
        -vx * 0.35 + (Math.random() - 0.5) * 0.15,
        aura.rise * (0.6 + Math.random() * 0.6),
        -vz * 0.35 + (Math.random() - 0.5) * 0.15,
        color(),
        opts,
      );
    }
    // boiling off the blade as it cuts
    if (f.model.swingMain) {
      const n = Math.round(aura.swingRate * dt + Math.random());
      const tip = f.weaponTip(this.tmp3);
      for (let i = 0; i < n; i++) {
        fx.emit(tip.x, tip.y, tip.z, (Math.random() - 0.5) * 0.3, aura.rise * (0.3 + Math.random() * 0.5), (Math.random() - 0.5) * 0.3, color(), { ...opts, life: aura.life * 0.6, size: aura.size * k * 0.8 });
      }
    }
  }

  private moveFx(f: ClientFighter): void {
    if (!f.fxQueue.length) return;
    const me = this.local?.cf;
    const far = !!me && dist2D(me.pos.x, me.pos.z, f.pos.x, f.pos.z) > 32;
    for (const { cue, pos, dir } of f.fxQueue) {
      if (far) continue;
      // the entrances have their own sounds; an execution's cues ride over the duck
      if (!f.entrance) audio.cue(cue.kind, f.roster.char, cue.scale, { vol: this.volumeAt(pos.x, pos.z), pos, hero: !!this.exec && (this.exec.a === f || this.exec.d === f) });
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
          // on the ground under the impact, wherever the head ended up
          pos.y = Math.max(0, f.pos.y);
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
        case 'chain': {
          // a spectral chain from the blade straight out along the fighter's facing, wisps along it
          const end = this.tmp2.copy(dir).multiplyScalar(sc).add(pos);
          end.y = Math.max(0.6, pos.y);
          fx.beam(pos, end, color, 0.07, 0.35);
          fx.beam(pos, end, '#e8fff0', 0.025, 0.25);
          for (let i = 1; i <= 4; i++) fx.wisps(this.tmp3.copy(pos).lerp(end, i / 4), color, 0.4);
          break;
        }
        case 'shake':
          this.shakeNear(f, 0.1 * sc, 0.15);
          break;
        case 'bolt':
          pos.y = Math.max(0, f.pos.y);
          fx.bolt(pos, cue.color ?? '#ffe27a', sc);
          this.renderer.flash = Math.max(this.renderer.flash, Math.min(0.6, 0.45 * sc));
          this.renderer.flashColor.set('#fff8e0');
          this.shakeNear(f, 0.2 * sc, 0.3);
          break;
        case 'fog':
          fx.fog(f.pos, sc, cue.color);
          break;
        case 'embers':
          fx.embers(f.pos, sc, cue.color);
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
        audio.perilous(f.roster.char, { vol, pos: f.pos });
        this.effects.flash(this.tmp.set(f.pos.x, f.pos.y + 2.4 * f.model.scale, f.pos.z), '#ff2a2a', 1.4, 0.3);
      }
      if (v.state === 'dodge' && v.elapsed < 200) audio.dodge(f.roster.char, v.dodgeKind ?? 'roll', { vol: vol * 0.8, pos: f.pos });
    }
    if (v.state === 'attack' && v.attack && !v.attack.noHitbox) {
      if (v.elapsed >= v.windup - 30 && f.lastSwingSerial !== v.serial) {
        f.lastSwingSerial = v.serial;
        audio.swing(f.id, f.roster.char, v.key, { heavy: isHeavyKey(v.key) || !!v.attack.perilous, vol: this.volumeAt(f.pos.x, f.pos.z), pos: f.pos });
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
      audio.buff({ vol: this.volumeAt(f.pos.x, f.pos.z), pos: f.pos });
      f.model.react('roar');
      this.effects.ring(f.pos, '#ff6a2a', 2.5, 0.5);
    }
    this.buffSeen.set(f.id, buff);
    // footsteps, landings, and the whooshes of an execution's choreography
    audio.motion(f.id, f.roster.char, { vol: this.volumeAt(f.pos.x, f.pos.z), pos: f.pos, speed: f.speed, airborne: f.airborne, state: v.state, tip: v.state === 'execute' ? f.weaponTip(this.tmp3) : null, footfall: f.model.frame?.footfall ?? null });
  }

  // ------------------------------------------------------------------ frame

  /**
   * The execution cinematic: the world sinks into the dark around the two of them, the screen
   * letterboxes, and the camera cuts through four shots timed to the paired animation: wide and
   * low as it begins, over the victim's shoulder on the wind-up, close on the blow, then pulling
   * away as they go down.
   */
  private startExecution(a: ClientFighter, d: ClientFighter): void {
    this.exec = { a, d, t: 0, start: this.net.serverNow(), hitDone: false };
    this.ui.setCinematic(true);
    // laid out the way the server stands them (the victim straight ahead at the execution distance),
    // not from where the two are drawn this frame: they're still sliding into place
    const u = new THREE.Vector3(d.pos.x - a.pos.x, 0, d.pos.z - a.pos.z);
    if (u.lengthSq() < 1e-4) {
      const f = forward(a.yaw);
      u.set(f.x, 0, f.z);
    }
    u.normalize();
    const D = a.pos.clone().addScaledVector(u, executeSpacing(a.roster.char, d.roster.char, COMBAT.executeDistance));
    D.y = a.pos.y;
    this.cam.playShots(executionShots(a.pos.clone(), D, Math.max(a.model.scale, d.model.scale)));
  }

  private stepExecution(dt: number, now: number): void {
    const ex = this.exec;
    let dark = 0;
    if (ex) {
      // on the server's clock, like the paired animation, so the camera can't drift off it
      ex.t = now - ex.start;
      this.cam.syncShots(ex.t / 1000);
      const T = COMBAT.executeTime;
      dark = Math.min(1, ex.t / 350) * (1 - Math.max(0, Math.min(1, (ex.t - (T - 450)) / 450)));
      if (ex.t >= T || !this.fighters.has(ex.a.id) || !this.fighters.has(ex.d.id)) {
        this.exec = null;
        this.cam.stopShots();
        if (!this.intro) this.ui.setCinematic(false);
      }
    }
    if (G.uDark.value < 0.002 && dark === 0) {
      this.rimBase = G.uRim.value.w;
      G.uDark.value = 0;
      return;
    }
    G.uDark.value += (dark * 0.86 - G.uDark.value) * Math.min(1, dt * 12);
    // the fighters' rim burns brighter against the dark
    G.uRim.value.w = this.rimBase + G.uDark.value * 0.9;
  }

  private frame(t: number): void {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const now = this.net.serverNow();
    this.renderer.flash = Math.max(0, this.renderer.flash - dt * 3);
    this.stepExecution(dt, now);
    if (this.drama > 0) {
      // the screen sinks to a deep red, holds and comes back
      this.drama = Math.max(0, this.drama - dt);
      this.renderer.flash = Math.max(this.renderer.flash, 0.62 * Math.min(1, this.drama / 0.35));
      this.renderer.flashColor.set('#300008');
    }

    const mouse = this.input.consumeMouse();
    this.cam.addMouse(mouse.dx, mouse.dy, settings.sensitivity, settings.invertY, !!this.lock);
    // the title screen has its own keys (and a name being typed)
    this.input.suspended = this.ui.chatOpen || !!this.ui.modalOpen || this.select.open || !!this.titleScreen?.active;
    this.entranceCues(now);
    const left = this.select.tick(now);
    if (left !== null && left > 0 && left <= 3) audio.play('countdown', 0.5);

    if (this.lock && (this.lock.s === 'dead' || !this.fighters.has(this.lock.id) || (this.local && dist2D(this.local.cf.pos.x, this.local.cf.pos.z, this.lock.pos.x, this.lock.pos.z) > 30))) {
      if (this.kind !== 'arena' || !this.fighters.has(this.lock.id)) this.lock = null;
    }

    if (this.local) {
      const others = [...this.fighters.values()].filter((f) => !f.isLocal);
      const sprint = this.input.isDown('dodge') && performance.now() - this.dodgePressAt > 220;
      this.local.update(dt, now, { axes: this.input.moveAxes(), camYaw: this.cam.yaw, sprint, others, lock: this.lock });
    }
    // everyone keeps their eyes on their opponent: in a duel the other fighter, in the lobby
    // whoever the local player is locked on to (and that fighter watches them back)
    const duelists = this.kind === 'arena' ? [...this.fighters.values()] : [];
    const lockOn = this.local ? this.lock : null;
    for (const f of this.fighters.values()) {
      if (duelists.length === 2) f.lookAt = (duelists[0] === f ? duelists[1] : duelists[0]).pos;
      else if (this.local && f === this.local.cf) f.lookAt = lockOn?.pos ?? null;
      else f.lookAt = lockOn === f && this.local ? this.local.cf.pos : null;
    }
    for (const f of this.fighters.values()) {
      f.interpolate(now);
      const buff = (f.flags & 1) === 1 || (!!f.sim && f.sim.buffActive(now));
      f.updateVisual(dt, now, buff);
      this.stateCues(f, now);
      this.moveFx(f);
      this.auraFx(f, dt);
    }

    // grass parts around the fighters nearest the camera
    if (this.mapView) {
      const cam = this.renderer.camera.position;
      const near = [...this.fighters.values()].sort((a, b) => a.pos.distanceToSquared(cam) - b.pos.distanceToSquared(cam)).slice(0, 4);
      this.mapView.setPushers(near.map((f) => f.pos));
    }

    // camera
    if (this.local) {
      const p = this.local.cf.pos;
      this.cam.shakeScale = settings.reduceShake ? 0.35 : this.touch ? 0.8 : 1;
      this.cam.subjectScale = this.local.cf.model.scale;
      this.cam.targetScale = this.lock?.model.scale ?? 1;
      this.cam.update(dt, p, this.lock ? this.lock.pos : null, { dodging: this.local.sim.state === 'dodge' });
      this.mapView?.update(dt, p);
    } else if (this.titleScene) {
      this.titleScene.update(dt);
    } else {
      this.mapView?.update(dt, new THREE.Vector3());
    }
    this.titleScreen?.update(dt);
    this.effects.update(dt, this.renderer.camera);
    this.updateHud(dt, now);
    this.renderer.render();
    if (this.snapWant) {
      // copy the frame now, while the canvas still holds it
      const src = this.renderer.renderer.domElement;
      const c = document.createElement('canvas');
      c.width = src.width;
      c.height = src.height;
      c.getContext('2d')!.drawImage(src, 0, 0);
      this.snapWant(c);
      this.snapWant = null;
    }

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
      posture: sim.posture / sim.char.stats.posture,
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
        posture: target.po / target.char.stats.posture,
        broken: target.s === 'broken',
        pips: inMatch ? theirScore : null,
        pipMax: MATCH.roundsToWin,
        meta: '',
      });
    } else this.ui.setCard('opp', null);

    // the opponent's posture bar floats above their head (as in the reference fights)
    const foe = target && target.s !== 'dead' ? this.project(target.pos.x, target.pos.y + 2.25 * target.model.scale, target.pos.z) : null;
    this.ui.setFoePosture(foe, target ? target.po / target.char.stats.posture : 0, target?.s === 'broken');
    // a red X marks them while their guard is broken: finish it
    this.ui.setBrokenMark(target && target.s === 'broken' ? this.project(target.pos.x, target.pos.y + 1.25 * target.model.scale, target.pos.z) : null);

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
  const r = new GameRenderer(holder, 'medium', { preview: true });
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
  // the whole moveset in turn: the light chain, the heavy chain, dash, backstep and air attacks, the special
  const moves: AttackKey[][] = [['l0', 'l1', 'l2'], ['h', 'h1', 'h2'], ['dl', 'dh'], ['bl', 'bh'], ['jl', 'jh'], ['sp']];
  const cycle: { key: AttackKey | null; ms: number }[] = [{ key: null, ms: 1400 }];
  for (const group of moves) {
    for (const key of group) cycle.push({ key, ms: 0 });
    cycle.push({ key: null, ms: 600 });
  }
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
    const atk = step.key ? getAttack(model.char, step.key) : null;
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
