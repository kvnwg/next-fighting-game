/** The client application: wires networking, input, simulation, rendering and UI together. */
import * as THREE from 'three';
import { AttackDef, AttackKey, AttackShape, CHARACTERS, CHARACTER_IDS, CharacterId, executeSpacing, getAttack, isHeavyKey } from '../shared/characters';
import { COMBAT, MATCH, PLAYER_RADIUS } from '../shared/config';
import { MAPS, LOBBY_MAP, MapDef, hazardAt, inSafeZone } from '../shared/maps';
import { angleDiff, dist2D, forward, yawTo } from '../shared/math';
import { thrownOut, zoneAim } from '../shared/combat';
import { CombatEvent, PROTOCOL_VERSION, ProfileView, RingView, RosterEntry, ServerMsg } from '../shared/protocol';
import { rankOf } from '../shared/ranks';
import { audio } from './audio';
import { EXEC_LEAD } from './audio/recipes';
import { CAMERA_BULK, CameraRig, executionShots } from './camera';
import { CARD_AT, ENTRANCES, ENTRANCE_HOLD, entranceStarts, introSequence } from './entrances';
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
import { RingWalls } from './render/rings';
import { Telegraph } from './render/telegraph';
import { TITLE_MAP } from './render/maps/title';
import { TitleScene } from './title/scene';
import { TitleScreen } from './title/screen';
import { platform } from './platform';
import { saveSettings, settings } from './settings';
import { watchOrientation } from './orientation';
import { matchAd, watchAd } from './adbreak';
import { Tips, TutorialOverlay } from './tutorial';
import { UnlockCeremony } from './unlock';
import { isPremium } from '../shared/progress';
import { TouchControls, isTouchDevice } from './touch';
import { CardData, Preview, UI, esc } from './ui';

type MatchMsg = Extract<ServerMsg, { t: 'match' }>;

/** kanji numerals for countdowns and round titles */
const KANJI_NUM = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
/** each step of an execution's impact frame (ink on white, then on red), in ms */
const IMPACT_MS = 70;
/** how long before the finishing blow its swing starts, so the recorded whoosh peaks on the hit (ms) */
const EXEC_WHOOSH_LEAD = 160;
/** and the finishing blow's recorded lead-ins (audio's EXEC_LEAD) */
const EXEC_SOUND_LEAD = EXEC_LEAD * 1000;
/** the colour an area attack's ground flashes as it lands: a fissure's embers, lightning, soulfire */
const AREA_HIT: Record<AttackShape['kind'], string> = { line: '#ff8a3a', zone: '#ffe27a', ring: '#3cff8a' };
/** the Lancer's golden lightning */
const BOLT = '#ffe27a';
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** A thrown spear in the air (see App.spearFlight). */
interface SpearFlight {
  /** the copy of the spear that flies */
  mesh: THREE.Object3D;
  serial: number;
  /** where it left the hand, its line (a unit vector), and how far down it the grip goes */
  from: THREE.Vector3;
  dir: THREE.Vector3;
  reach: number;
  /** grip to tip (m) */
  len: number;
  /** 0..1 through the flight: out to the end of the line by 0.5, then back */
  u: number;
  /** the flight's length (ms) */
  ms: number;
  turned: boolean;
  spin: number;
  spark: number;
  lastTip: THREE.Vector3 | null;
}

/** recording the trailer (dev only, see demo.ts): your fighter plays itself and the camera follows it */
const DEMO = import.meta.env.DEV && new URLSearchParams(location.search).has('demo');

/** where the game server is, when the page isn't served by it (the CrazyGames build) */
const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? '';

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
  /** what the first fight leaves out, taught the first time it comes up (tutorial.ts) */
  private tips: Tips;
  /** beating the sensei: the fighter it earns, picked and revealed (unlock.ts) */
  private ceremony: UnlockCeremony | null = null;
  private mapView: MapView | null = null;
  private map: MapDef = LOBBY_MAP;
  private fighters = new Map<string, ClientFighter>();
  /** the button the pointer is over (for the hover tick) */
  private hoverEl: HTMLElement | null = null;
  /** the ground marked under each fighter's perilous area attack while it winds up, by fighter id */
  private marks = new Map<string, { tg: Telegraph; serial: number; aim: { x: number; z: number } | null }>();
  /** marks whose blow has landed or was stopped, fading out */
  private fadingMarks: Telegraph[] = [];
  /** thrown spears in the air, by thrower id */
  private spears = new Map<string, SpearFlight>();
  private local: LocalController | null = null;
  private myId = '';
  private profile: ProfileView | null = null;
  private kind: 'lobby' | 'arena' | null = null;
  private match: MatchMsg | null = null;
  private lastCountdown = -1;
  /** seconds left of the red-and-black beat after a posture break */
  private drama = 0;
  /** the execution cinematic running (only for one you're in) */
  private exec: { a: ClientFighter; d: ClientFighter; t: number; start: number; hitDone: boolean; whooshed: boolean; led: boolean } | null = null;
  /** the map's own fighter rim strength, restored after an execution */
  private rimBase = 0.6;
  /** back-to-back deflects build up the spectacle */
  private deflectStreak = 0;
  private lastDeflectAt = -Infinity;
  /** your own run of deflects, counted out over the clash (DEFLECT ×2, ×3...); a hit taken ends it */
  private myDeflects = 0;
  private myLastDeflectAt = -Infinity;
  /** when the last impact frame began (performance.now) */
  private impactStart = -Infinity;
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
  private tmpQ = new THREE.Quaternion();
  /** the title screen: the Ronin on the cliff (3D) and the menus over it, until the game starts */
  private titleScene: TitleScene | null = null;
  private titleScreen: TitleScreen | null = null;
  /** which lobby we're in and how full it is */
  private lobbyInfo: { n: number; count: number; cap: number; code?: string } | null = null;
  /** the tutorial is still to come for this player (it starts once the lobby is up) */
  private tutorialDue = false;
  /** the fighter the camera follows while the game plays itself (DEMO) */
  private demoSubject: ClientFighter | null = null;
  /** a friend's private lobby to join as soon as we're in (from an invite link) */
  private inviteRoom: string | null = null;
  /** started from CrazyGames' "play with friends": open a private lobby as soon as we're in */
  private instantRoom = false;
  /** the tutorial's lessons drawn over the fight, while it runs */
  private tutorial: TutorialOverlay | null = null;
  private tutorialStep: string | null = null;
  /** the lobby's dueling rings, and the walls of light around the sealed ones */
  private rings: RingView[] = [];
  private ringWalls: RingWalls | null = null;
  private ringCount = -1;
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
      onTrial: () => this.net.send({ t: 'trial' }),
      onCancelQueue: () => this.net.send({ t: 'unqueue' }),
      onSelectChar: (id) => {
        this.selectChar(id);
        audio.play('taiko', 0.8);
      },
      onRosterPick: (id) => audio.fighterPick(id),
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
        audio.setMusicVolume(settings.music);
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
      onUnlock: (kind, id, free) => this.net.send({ t: 'unlock', kind, id, ...(free ? { free: true } : {}) }),
      onWatchAd: async (kind) => {
        this.input.exitLock();
        const ok = await watchAd();
        // the server pays out (it checks the offer is still good)
        if (ok) this.net.send({ t: 'ad', kind });
        // never a button that does nothing (no ad served, closed early, an adblocker)
        else this.ui.toast('No ad to show right now. Try again in a little while.', 'warn');
        return ok;
      },
      onTutorial: () => this.net.send({ t: 'tutorial', a: 'start' }),
      onRoom: (a, code) => this.net.send(a === 'join' ? { t: 'room', a, code: code ?? '' } : { t: 'room', a }),
      inviteLink: (code) => platform.inviteLink(code),
    }, offline, touch);
    // a soft tick as a real pointer finds a button
    root.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const b = (e.target as HTMLElement).closest<HTMLElement>('button, [role="tab"], .fs-tile, .sel-tile, .sel-card');
      if (b === this.hoverEl) return;
      this.hoverEl = b;
      if (b && !(b as HTMLButtonElement).disabled) audio.hover();
    });
    this.select = new SelectScreen(root, (id) => portraitURL(this.renderer.renderer, id), (v) => {
      this.net.send({ t: 'vote', ...v });
      audio.play('click', 0.5);
      if (v.char) audio.fighterPick(v.char);
      if (v.char) {
        settings.char = v.char;
        saveSettings();
        this.ui.setLobbyChar(v.char);
      }
    }, () => this.profile);
    if (touch) {
      this.touch = new TouchControls(this.ui.hud, this.input, {
        onMenu: () => this.ui.setTouchMenu(),
        onChat: () => {
          this.touch?.cancel();
          this.onBind('chat', true, performance.now());
        },
      });
    }
    this.tips = new Tips(this.ui.hud, this.ui.touch);
    // turning the phone rearranges the controls under the player's thumbs: let go of everything held
    watchOrientation(() => {
      this.input.releaseAll();
      this.touch?.cancel();
      this.renderer.resize();
    });
    this.openTitle();
    this.titleScreen!.boot();
    this.bindNet();
    // the trailer starts straight away (DEMO)
    if (DEMO) void this.connect('Kensei');
    requestAnimationFrame((t) => this.frame(t));
    // the title screen is up: loading is over
    requestAnimationFrame(() => platform.loadingStop());
    audio.setMuted('platform', platform.settings.muteAudio);
    audio.setListener(this.renderer.camera);
    platform.onSettingsChange((p) => {
      audio.setMuted('platform', p.muteAudio);
      this.ui.setChatDisabled(p.disableChat);
    });
    this.ui.setChatDisabled(platform.settings.disableChat);
    // opened from a friend's invite: straight into their private lobby once in (or now, if already in)
    this.inviteRoom = platform.inviteRoom();
    platform.onInvite((room) => {
      this.inviteRoom = room;
      // in a match (or its select) the server can't move you: it waits till you're back in the lobby
      if (this.myId && this.kind === 'lobby' && !this.select.open) this.joinInvite();
    });
    // started from CrazyGames' "play with friends": the party leader goes straight in (no stop at the
    // title if the name is known) and into a new private lobby their friends can join
    this.instantRoom = !this.inviteRoom && platform.instantMultiplayer;
    if (this.instantRoom) void this.instantStart();
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
        // the CrazyGames build talks to the game server (VITE_SERVER_URL); served by it, to its own host
        await this.net.connect(SERVER_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      }
    } catch (e) {
      const hint = this.offline ? '' : SERVER_URL ? ' Check your connection and try again.' : ' Is the server running? (npm run dev)';
      screen.failed(`${(e as Error).message}${hint}`);
      return;
    }
    // hold the game back until the welcome has played out
    this.net.hold();
    this.net.onHeld = (m) => {
      if (m.t === 'welcome') void this.onWelcomeHeld(m.profile, isNew);
    };
    this.net.send({ t: 'hello', v: PROTOCOL_VERSION, token: settings.token || undefined, name, char: settings.char });
  }

  /** Instant multiplayer: connect without waiting at the title, unless there's a name to pick first. */
  private async instantStart(): Promise<void> {
    const name = settings.name || (await platform.username());
    if (!name || !this.titleScreen?.waiting) return;
    // nobody has touched the page yet: the sound comes on with the first click or key
    const unlock = (): void => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    await this.connect(name);
  }

  /** Into the private lobby a friend's invite is for, if one is waiting. */
  private joinInvite(): void {
    if (!this.inviteRoom) return;
    this.net.send({ t: 'room', a: 'join', code: this.inviteRoom });
    this.inviteRoom = null;
  }

  private bindNet(): void {
    const n = this.net;
    n.onClose = (reason) => {
      platform.gameplayStop();
      platform.setRoom(null);
      this.myId = '';
      this.lobbyInfo = null;
      this.ui.showTitle();
      this.input.exitLock();
      this.clearFighters();
      this.local = null;
      this.kind = null;
      this.ui.setCharsLocked(false);
      this.match = null;
      audio.music(null, 1);
      audio.introStop();
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
      // you play a fighter you own: a locked one (or a fresh profile) means the Ronin
      if (!m.profile.chars.includes(settings.char)) {
        settings.char = 'ronin';
        this.ui.setLobbyChar('ronin');
      }
      saveSettings();
      // a first visit starts with the tutorial, once the lobby is up
      // (unless you came to play a friend: the tutorial waits for another visit, or the Help page)
      this.tutorialDue = !m.profile.tutorial && !this.inviteRoom && !this.instantRoom;
      this.joinInvite();
      if (this.instantRoom) {
        this.instantRoom = false;
        this.net.send({ t: 'room', a: 'create' });
      }
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
      // queued for something else: a trial card still counting down goes
      if (m.mode) this.ui.dropResult();
    });
    n.on('match', (m) => this.onMatch(m));
    n.on('select', (m) => {
      this.ui.dropResult();
      if (!this.select.open) {
        this.queue = null;
        this.input.exitLock();
        this.touch?.cancel();
        audio.play('matchFound');
      }
      audio.music('select');
      this.select.show(m);
      if (this.local) this.local.frozen = true;
    });
    n.on('selectCancel', (m) => {
      this.select.hide();
      audio.music(this.kind === 'lobby' ? 'lobby' : null, 1);
      if (this.local && this.kind === 'lobby') this.local.frozen = false;
      this.ui.toast(m.reason, 'warn');
      this.joinInvite();
    });
    n.on('result', (m) => {
      // the first fight or a trial: the card waits for a choice, so the cursor is freed for it
      if (m.trial) this.input.exitLock();
      if (m.unlock) this.startCeremony(m.coins);
      // the card says an ad plays next and what it pays; it plays as the card goes, and pays if it runs to the end
      else
        this.ui.showResult(m, this.profile, (choice) => {
          // Next: straight into the next trial (or the same one again), once any ad is over
          const go = () => choice === 'next' && this.net.send({ t: 'trial' });
          if (!m.ad) return void go();
          this.input.exitLock();
          void matchAd().then((ok) => {
            if (ok) this.net.send({ t: 'ad', kind: 'match' });
            go();
          });
        });
      audio.introStop();
      audio.play(m.won ? 'victory' : 'defeat');
      audio.music(null, 3);
      platform.gameplayStop();
      // a ranked promotion is the rare moment CrazyGames' celebration is for
      if (m.before && m.after && rankOf(m.after.mmr, m.after.placements).label !== rankOf(m.before.mmr, m.before.placements).label && (m.delta ?? 0) > 0) platform.happytime();
    });
    n.on('tutorial', (m) => {
      if (!this.tutorial) this.tutorial = new TutorialOverlay(this.ui.hud, this.ui.touch, () => this.net.send({ t: 'tutorial', a: 'skip' }));
      const was = this.tutorialStep;
      this.tutorialStep = m.step;
      this.tutorial.show(m.step, m.n, m.need, m.note);
      // the lessons over, the closing duel starts like any fight
      if (m.step === 'duel' && was !== 'duel') audio.play('fight');
      else if (m.step !== was) audio.cardSlam();
      else if (m.note === 'good') audio.ready('special');
    });
    n.on('coins', (m) => {
      this.ui.coinsGained(m.gained);
      audio.coins(m.gained);
      if (m.why === 'tutorial') this.ui.toast(`Lesson learned: +${m.gained} coins`, 'good');
      if (m.why === 'matchAd') this.ui.toast(`Thanks for watching: +${m.gained} coins`, 'good');
    });
    n.on('unlocked', (m) => {
      // (the ceremony makes its own fuss)
      if (this.ceremony) return;
      audio.unlocked();
      const name = m.kind === 'char' ? (CHARACTERS[m.id as CharacterId]?.name ?? m.id) : (MAPS[m.id]?.name ?? m.id);
      this.ui.toast(m.kind === 'char' ? `${name} unlocked${m.free ? ' (your free pick)' : ''}!` : `${name} unlocked: pick it before a match`, 'good');
    });
    n.on('profile', (m) => {
      this.profile = m.profile;
      this.ui.setProfile(m.profile);
    });
    n.on('leaderboard', (m) => {
      this.ui.showLeaderboard(m.entries, m.you, m.total, this.profile);
      this.mapView?.setLeaderboard(m.entries);
    });
    n.on('lobby', (m) => {
      this.lobbyInfo = m;
      this.ui.setRoom(m.code ?? null);
      platform.setRoom(m.code ?? null, m.count < m.cap);
    });
    n.on('rings', (m) => this.onRings(m.r));
    n.on('challenge', (m) => {
      this.ui.showChallenge(m.from, m.name, m.char, m.ring !== undefined);
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
    this.ringWalls?.dispose();
    this.ringWalls = null;
    for (let i = 0; i < this.rings.length; i++) this.ui.ringLabel(i, null);
    this.rings = [];
    if (map.rings) {
      this.ringWalls = new RingWalls(map.rings);
      this.scene.add(this.ringWalls.group);
    }
  }

  private clearFighters(): void {
    for (const f of this.fighters.values()) f.dispose();
    this.fighters.clear();
    this.ui.clearPlates();
    this.lock = null;
  }

  /**
   * Beating the sensei: the fighter it earns, picked from the ones you could take and revealed as a
   * spectacle (unlock.ts). Then into the next trial with them, or back to the grounds.
   */
  private startCeremony(coins?: number): void {
    const owned = this.profile?.chars ?? [];
    const choices = CHARACTER_IDS.filter((id) => !owned.includes(id) && !isPremium(id));
    if (!choices.length) return;
    this.input.exitLock();
    this.touch?.cancel();
    this.ceremony = new UnlockCeremony(this.ui.root, {
      choices,
      coins,
      portrait: (id) => portraitURL(this.renderer.renderer, id),
      createPreview: (el) => createPreview(el, true),
      onPick: (id) => this.net.send({ t: 'unlock', kind: 'char', id, free: true }),
      onDone: (id) => {
        this.ceremony = null;
        if (!id) return platform.gameplayStart();
        settings.char = id;
        saveSettings();
        this.ui.setLobbyChar(id);
        this.net.send({ t: 'trial', char: id });
      },
    });
  }

  private enterInstance(m: Extract<ServerMsg, { t: 'enter' }>): void {
    audio.introStop();
    this.cam.stopShots();
    this.endEntrances();
    this.select.hide();
    this.clearFighters();
    // a new match: a trial's result card whose choice was made elsewhere (the Trials card, a friend's invite) goes
    if (m.kind !== 'lobby') this.ui.dropResult();
    // back in control, in a lobby or a match (a result card stopped it)
    if (!this.ui.modalOpen && !this.ceremony) platform.gameplayStart();
    const map = Object.prototype.hasOwnProperty.call(MAPS, m.map) ? MAPS[m.map] : LOBBY_MAP;
    this.loadMap(map);
    this.kind = m.kind;
    this.ui.setCharsLocked(m.kind === 'arena');
    this.local = null;
    for (const r of m.roster) this.addFighter(r);
    this.applySnaps(m.snap, this.net.serverNow(), true);
    const me = DEMO ? undefined : this.fighters.get(this.myId);
    this.demoSubject = DEMO ? (this.fighters.get(this.myId) ?? null) : null;
    if (this.demoSubject) this.cam.snapBehind(m.yaw);
    if (me) {
      this.local = new LocalController(me, this.net, map);
      this.local.onAction = (a, ok) => {
        if (!ok) return;
        if (a === 'jump') audio.jump(me.roster.char, { vol: 0.6, pos: me.pos });
      };
      this.local.onTeleport(m.x, m.z, m.yaw, m.epoch, undefined);
      if (map.rings) this.local.fence = (p) => this.fenceRings(p);
      this.cam.snapBehind(m.yaw);
    }
    this.ui.setLobbyMode(m.kind === 'lobby');
    this.ui.setDeath(null);
    if (m.kind === 'lobby') {
      this.tutorial?.destroy();
      this.tutorial = null;
      this.tutorialStep = null;
      if (this.tutorialDue) {
        this.tutorialDue = false;
        this.net.send({ t: 'tutorial', a: 'start' });
      }
      this.match = null;
      audio.music('lobby');
      this.ui.setMatch(null, 0);
      // a friend's invite that came in during the match
      this.joinInvite();
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
    const f = new ClientFighter(r, r.id === this.myId && !DEMO, this.scene);
    f.lavaAt = (x, z) => !!hazardAt(this.map, x, z);
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

  // ------------------------------------------------------------------ dueling rings

  /** The ring view for the duel we're in (sealed or just settled), if any. */
  private myRing(): RingView | null {
    return this.rings.find((r) => r.state !== 'open' && (r.a === this.myId || r.b === this.myId)) ?? null;
  }

  /** Index of the ring (x, z) stands in, or -1. */
  private ringAt(x: number, z: number): number {
    return this.map.rings?.findIndex((r) => Math.hypot(x - r.x, z - r.z) < r.r) ?? -1;
  }

  /** Our own walls: kept inside a ring we're dueling in, kept out of anyone else's. */
  private fenceRings(p: { x: number; z: number }): void {
    const defs = this.map.rings;
    if (!defs) return;
    for (const v of this.rings) {
      if (v.state !== 'countdown' && v.state !== 'fight') continue;
      const r = defs[v.i];
      const inside = v.a === this.myId || v.b === this.myId;
      const dx = p.x - r.x;
      const dz = p.z - r.z;
      const d = Math.hypot(dx, dz) || 1e-3;
      const lim = inside ? r.r - PLAYER_RADIUS : r.r + PLAYER_RADIUS;
      if (inside ? d <= lim : d >= lim) continue;
      p.x = r.x + (dx / d) * lim;
      p.z = r.z + (dz / d) * lim;
    }
  }

  private onRings(list: RingView[]): void {
    const prev = this.rings;
    this.rings = list;
    for (const r of list) {
      this.ringWalls?.set(r.i, r.state === 'countdown' || r.state === 'fight', r.state === 'over');
      const was = prev.find((p) => p.i === r.i);
      if (was?.state === r.state || (r.a !== this.myId && r.b !== this.myId)) continue;
      const mineA = r.a === this.myId;
      const oppName = (mineA ? r.bn : r.an) ?? '';
      if (r.state === 'countdown') {
        // the ring seals: you're squared up with them, locked on
        this.lock = this.fighters.get((mineA ? r.b : r.a) ?? '') ?? this.lock;
        this.ringCount = -1;
        this.ui.hideChallenge();
        this.ui.banner('Ring duel', `vs ${oppName}`, 1300, 'count', '決闘');
        audio.play('gong');
        audio.music('combat');
      } else if (r.state === 'fight') {
        this.ui.banner('Fight', '', 900, 'fight', '始め');
        audio.play('fight');
      } else if (r.state === 'over') {
        const draw = r.w === '';
        const won = r.w === this.myId;
        this.ui.banner(draw ? 'Draw' : won ? 'Victory' : 'Defeat', `vs ${oppName}`, 2600, draw ? 'draw' : won ? 'win' : 'lose', draw ? '引分' : won ? '勝利' : '敗北');
        audio.play(won || draw ? 'victory' : 'defeat');
        audio.music('lobby');
        this.lock = null;
      }
    }
  }

  /** Ring labels, the countdown of our own duel, and what standing in a free ring offers. */
  private ringHud(now: number): void {
    const defs = this.map.rings;
    const me = this.local?.cf;
    if (!defs || !me) return;
    for (const v of this.rings) {
      const r = defs[v.i];
      const near = dist2D(me.pos.x, me.pos.z, r.x, r.z) < 60;
      const at = v.state !== 'open' && near ? this.project(r.x, 3.6, r.z) : null;
      if (!at) {
        this.ui.ringLabel(v.i, null);
        continue;
      }
      const left = Math.max(0, Math.ceil(((v.until ?? now) - now) / 1000));
      const names = `${esc(v.an ?? '')}<span class="rl-vs">対</span>${esc(v.bn ?? '')}`;
      const sub =
        v.state === 'countdown' ? `Begins in ${left}` : v.state === 'fight' ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : v.w ? `${esc(v.w === v.a ? v.an ?? '' : v.bn ?? '')} wins` : 'A draw';
      this.ui.ringLabel(v.i, at, `<span class="rl-jp">決闘</span><div>${names}</div><div class="rl-sub">${sub}</div>`);
    }
    const mine = this.myRing();
    if (mine?.state === 'countdown') {
      const secs = Math.ceil(((mine.until ?? now) - now) / 1000);
      if (secs !== this.ringCount && secs > 0 && secs <= 3) {
        this.ringCount = secs;
        this.ui.banner(String(secs), 'Ring duel', 950, 'count', KANJI_NUM[secs]);
        audio.countdown(secs);
      }
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
    // the intro has its own song (see startEntrances); the fight's music comes in on "Fight!" and
    // runs to the result
    if (m.phase === 'intro') audio.music(null, 1.5);
    else if (m.phase === 'fight') {
      audio.introStop(1.2);
      audio.music('combat');
    }
    const oppId = m.players[m.you === 0 ? 1 : 0].id;
    switch (m.phase) {
      case 'intro': {
        this.ui.matchIntro(m.mode, m.map, m.players, m.you, m.trial);
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
        if (m.mode !== 'tutorial') {
          this.ui.banner('Fight', '', 900, 'fight', '始め');
          audio.play('fight');
        }
        this.lock = this.fighters.get(oppId) ?? null;
        break;
      case 'roundEnd': {
        const w = m.roundWinner;
        if (w !== -1) audio.roundEnd(w === m.you);
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
    const into = Math.max(0, this.net.serverNow() - start) / 1000;
    this.cam.playShots(introSequence(subject(me), subject(op), end), into);
    this.ui.setCinematic(true);
    audio.introSong(into, (at.me - 200) / 1000);
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
    // the camera keeps to the intro's clock, so a slow frame never leaves it behind the entrances
    this.cam.syncShots((now - intro.start) / 1000);
    for (const t of intro.turns) {
      const s = (now - t.at) / ENTRANCE_MS;
      if (s < 0 || s > 1) continue;
      const e = ENTRANCES[t.r.char];
      // a cue more than a beat late (a slow frame, joining late) is dropped, not bunched up
      e.sfx.forEach((c, i) => {
        const key = `${t.r.id}:${i}`;
        if (s >= c.s && s < c.s + 0.12 && !intro.fired.has(key)) {
          intro.fired.add(key);
          audio.entrance(t.r.char, c.sound, c.vol ?? 1);
        }
      });
      const key = `${t.r.id}:card`;
      if (s >= CARD_AT && s < CARD_AT + 0.15 && !intro.fired.has(key)) {
        intro.fired.add(key);
        // up through the rest of the entrance and the hold after it
        this.ui.nameCard(t.r, t.mine, e.title, e.line, (1 - CARD_AT) * ENTRANCE_MS + ENTRANCE_HOLD + 200);
        audio.cardSlam();
      }
    }
  }

  // ------------------------------------------------------------------ input

  private onBind(b: Bind, pressed: boolean, time: number): void {
    const inGame = !!this.local;
    if (b === 'escape') {
      if (!pressed) return;
      if (this.ui.chatOpen) this.ui.closeChat();
      else if (this.ui.closeLegend()) return;
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
    if (pressed && (b === 'chars' || b === 'shop' || b === 'leaderboard' || b === 'help')) {
      if (this.ui.chatOpen) return;
      this.ui.toggleModal(b === 'leaderboard' ? 'ladder' : b);
      return;
    }
    if (pressed && (b === 'ranked' || b === 'practice')) {
      if (this.ui.chatOpen || this.kind !== 'lobby') return;
      if (b === 'practice') this.net.send({ t: 'queue', mode: 'practice', diff: this.ui.practiceDifficulty() });
      else this.net.send(this.queue ? { t: 'unqueue' } : { t: 'queue', mode: 'ranked' });
      return;
    }
    if (pressed && b === 'play') {
      if (this.ui.chatOpen || this.ui.modalOpen || this.kind !== 'lobby') return;
      // the menu needs the cursor: a locked mouse would leave nothing to click it with
      if (this.ui.togglePlayPanel()) {
        this.input.releaseAll();
        this.input.exitLock();
      }
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
      audio.lockOn(false);
      return;
    }
    this.lock = this.bestLockTarget();
    if (this.lock) audio.lockOn(true);
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
    // nobody in a ring duel can take another challenge
    const busy = new Set(this.rings.flatMap((r) => (r.state === 'countdown' || r.state === 'fight' ? [r.a, r.b] : [])));
    for (const f of this.fighters.values()) {
      if (f === me || f.roster.dummy || f.s === 'dead' || busy.has(f.id)) continue;
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
    // no words or numbers over a fight, as in Dueling Grounds (the one exception: deflects)
    const say = (..._: unknown[]): void => undefined;
    if (meD && (e.k === 'hit' || e.k === 'guardBreak' || e.k === 'deathblow')) this.myDeflects = 0;
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
        // the clash: unmistakable every time. A freeze on the blades, a burst of gold light rings
        // facing you with a star at the contact, a gold streak and a shower of sparks, the
        // attacker's weapon lit up as it's thrown back; for your own, a flash and a kick of the
        // camera. A streak of them builds it all up.
        const nowMs = performance.now();
        const streak = (this.deflectStreak = nowMs - this.lastDeflectAt < 2500 ? this.deflectStreak + 1 : 1);
        this.lastDeflectAt = nowMs;
        const big = (heavy ? 1.2 : 1) * (1 + 0.12 * Math.min(3, streak - 1));
        const toCam = this.tmp3.subVectors(this.renderer.camera.position, pos).normalize();
        const across = this.tmp2.set(0, 1, 0).cross(toCam).normalize();
        this.effects.flash(pos, '#ffffff', 1.3 * big, 0.12);
        this.effects.flash(pos, '#ffb02a', 2.4 * big, 0.24);
        this.effects.ring(pos, '#ffd24a', 1.8 * big, 0.32, toCam, true);
        this.effects.ring(pos, '#fff6d0', 1.0 * big, 0.22, toCam, true);
        this.effects.hitFlare(pos, across, toCam, '#ffd24a', 1.4 * big);
        this.effects.slash(pos, across, '#ffd24a', 1.8 * big, 0.08);
        this.effects.burst(pos, { count: Math.round(30 * big), color: ['#fff6c0', '#ffd24a', '#ffffff'], speed: 12, life: 0.3, size: 0.045, gravity: 6, drag: 2.5, stretch: 0.12 });
        this.effects.burst(pos, { count: Math.round(24 * big), color: ['#ffd24a', '#ff9a2a', '#fff6c0'], speed: 3.5, up: 2.4, life: 0.6, size: 0.04, gravity: 9, drag: 0.8 });
        d?.model.react('deflect');
        a?.model.react('blocked');
        a?.model.flash('#ffc34a', 1);
        d?.model.flash('#fff2c0', 0.5);
        // the blades bite and hold for a beat
        a?.hitstop(90, 0.035);
        d?.hitstop(70);
        if (mine) {
          this.renderer.flash = Math.max(this.renderer.flash, 0.32);
          this.renderer.flashColor.set('#ffd88a');
          this.cam.shake(0.12 * big, 0.14);
        }
        if (meD) {
          // your timing, called out over the clash, and counted up while the run lasts
          this.myDeflects = nowMs - this.myLastDeflectAt < 2500 ? this.myDeflects + 1 : 1;
          this.myLastDeflectAt = nowMs;
          const n = this.myDeflects;
          this.ui.floatText(n > 1 ? `DEFLECT ×${n}` : 'DEFLECT', pos.x, pos.y + 0.4, pos.z, n > 2 ? 'good huge' : 'good big', '弾', 'deflect');
          this.local?.onDeflected();
        } else if (meA) this.ui.floatText('DEFLECTED', pos.x, pos.y + 0.4, pos.z, 'bad big', '弾');
        break;
      }
      case 'block':
        this.effects.burst(pos, { count: 10, color: ['#ffb04a', '#ff8a2a', '#ffe0a0'], speed: 5, life: 0.3, size: 0.05 });
        a?.model.react('blocked');
        if (d) d.model.react('guard', { side: Math.max(-1, Math.min(1, swing.x * Math.cos(d.yaw) - swing.z * Math.sin(d.yaw))), heavy });
        break;
      case 'guardBreak':
        // your guard broken in a match for the first time: blocking isn't the answer, deflecting is
        if (meD && this.kind === 'arena' && this.match?.mode !== 'tutorial') this.tips.show('guardBroken');
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
        this.effects.hitStreak(pos, swing, this.tmp3.subVectors(this.renderer.camera.position, pos).normalize(), heavy ? 1.35 : 1);
        // a faint tint, not a white-out (Dueling Grounds flashes the health bar instead)
        d?.model.flash('#ff8a7a', 0.12);
        // knocked the way the blade went: + travels toward the defender's left
        if (d) d.model.react('hit', { side: Math.max(-1, Math.min(1, swing.x * Math.cos(d.yaw) - swing.z * Math.sin(d.yaw))), heavy });
        if (meA) this.cam.shake(heavy ? 0.2 : 0.13, heavy ? 0.24 : 0.16);
        // the attacker's signature on the blow
        if (a && d) {
          const chest = new THREE.Vector3(d.pos.x, d.pos.y + 1.15 * d.model.scale, d.pos.z);
          switch (a.roster.char) {
            case 'lancer':
              // lightning crawling over them
              for (let i = 0; i < (heavy ? 6 : 3); i++) {
                const off = () => new THREE.Vector3((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 0.9).multiplyScalar(d.model.scale);
                this.effects.arc(chest.clone().add(off()), chest.clone().add(off()), '#8fd0ff', 5, 0.12, 0.1 + Math.random() * 0.08);
              }
              this.effects.burst(pos, { count: heavy ? 22 : 12, color: ['#bfe6ff', '#ffffff', '#6fb8ff'], speed: 7, life: 0.3, size: 0.035, gravity: 0, drag: 4, stretch: 0.08 });
              break;
            case 'paladin':
              // a burst of holy light
              this.effects.flash(pos, '#fff0b0', heavy ? 1.6 : 1.1, 0.18);
              this.effects.burst(pos, { count: heavy ? 26 : 14, color: ['#ffe08a', '#fff6d0', '#ffffff'], speed: 4, up: 1.5, life: 0.7, size: 0.035, gravity: -0.6, drag: 2 });
              break;
            case 'ronin':
              // smoke bursting off the cut
              this.effects.burst(pos, { count: heavy ? 14 : 8, color: ['#f4f4f6', '#d6d8dd', '#b8bbc3'], speed: 1.6, up: 0.6, life: 1.1, size: 0.07, gravity: -0.2, drag: 2, grow: 3 });
              break;
          }
        }
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
          // the impact frame (not with reduced shake: it's a hard flash)
          if (!settings.reduceShake) {
            const p = pos.clone().project(this.renderer.camera);
            this.renderer.impactAt.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
            this.impactStart = performance.now();
          }
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
      case 'counter': {
        // the Duelist's Prise de Fer takes the blade aside in white sparks and ripostes
        const riposte = d?.roster.char === 'duelist';
        this.effects.burst(pos, { count: riposte ? 32 : 24, color: riposte ? ['#ffffff', '#ffd6e0', '#ff8aa0'] : ['#ffd24a', '#ffffff'], speed: riposte ? 8 : 6, life: 0.45 });
        a?.model.react('hit');
        say(riposte ? 'RIPOSTE!' : 'COUNTER!', head(d).x, head(d).y, head(d).z, 'good big', riposte ? '突き返し' : '返し');
        if (e.dmg) say(`-${e.dmg}`, head(a).x, head(a).y - 0.5, head(a).z, meA ? 'dmg me' : 'dmg');
        break;
      }
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
    // and what only you feel: your blow landing, a blow landing on you, the one that kills
    const landed = e.k === 'hit' || e.k === 'armor' || e.k === 'deathblow' || e.k === 'guardBreak';
    if (meA && landed) audio.hitConfirm(heavy || e.k !== 'hit');
    if (meD && (e.k === 'hit' || e.k === 'deathblow')) audio.hitTaken(heavy);
    if (mine && e.k !== 'execute' && e.tags?.includes('kill')) audio.killBlow({ vol, pos });
  }

  /** Effects a move's choreography asks for: dust on a stomp, a shockwave under a slam, petals off an iai cut. */
  /** Per-fighter aura emitters: how many puffs are owed, and where the fighter was last frame. */
  private auraState = new Map<string, { acc: number; prev: THREE.Vector3 }>();

  /** The fighter's ambient aura (see auras.ts): steam off the blade, more on the move and much more in a swing. */
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
    const opts = { life: aura.life, size: aura.size * k, gravity: -aura.rise * 0.35, drag: 1.1, grow: aura.grow, alpha: aura.alpha };
    // off the blade, anywhere along it: rising and streaming back against the way he moves,
    // and boiling off much harder as it cuts
    const base = this.tmp2;
    const tip = this.tmp3;
    f.model.weaponTips(base, tip);
    st.acc += (aura.rate + aura.moveRate * Math.min(1, speed / 3) + (f.model.swingMain ? aura.swingRate : 0)) * dt;
    while (st.acc >= 1) {
      st.acc -= 1;
      // the far half of the blade gives off most
      const t = 0.25 + 0.75 * Math.sqrt(Math.random());
      fx.emit(
        base.x + (tip.x - base.x) * t + (Math.random() - 0.5) * 0.04 * k,
        base.y + (tip.y - base.y) * t + (Math.random() - 0.5) * 0.04 * k,
        base.z + (tip.z - base.z) * t + (Math.random() - 0.5) * 0.04 * k,
        -vx * 0.3 + (Math.random() - 0.5) * 0.15,
        aura.rise * (0.5 + Math.random() * 0.6),
        -vz * 0.3 + (Math.random() - 0.5) * 0.15,
        color(),
        f.model.swingMain ? { ...opts, life: aura.life * 0.6 } : opts,
      );
    }
  }

  /** Per-fighter signature particles: the Lancer's lightning, the Ronin's smoke trail, the Knight's holy light. */
  private sigState = new Map<string, { arc: number; body: number; ground: number; step: string | null; dodge: number }>();

  private signatureFx(f: ClientFighter, dt: number): void {
    if (dt <= 0 || !f.model.root.visible) return;
    if (f.pos.distanceToSquared(this.renderer.camera.position) > 40 * 40) return;
    let st = this.sigState.get(f.id);
    if (!st) this.sigState.set(f.id, (st = { arc: 0, body: 0, ground: 1, step: null, dodge: -1 }));
    const fx = this.effects;
    const k = f.model.scale;
    const swing = f.model.swingMain;
    const base = this.tmp2;
    const tip = this.tmp3;
    f.model.weaponTips(base, tip);
    const along = (t: number, out = new THREE.Vector3()) => out.copy(base).lerp(tip, t);
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    // everyone: a puff of dust as a foot lands, and as a dodge kicks off
    const ff = f.model.frame?.footfall ?? null;
    if (ff && ff !== st.step && !f.airborne) fx.dust(this.tmp.set(f.pos.x, f.pos.y + 0.05, f.pos.z), 0.35 * k);
    st.step = ff;
    const v = f.view(this.net.serverNow());
    if (v.state === 'dodge' && st.dodge !== v.serial) {
      st.dodge = v.serial;
      fx.dust(this.tmp.set(f.pos.x, f.pos.y + 0.05, f.pos.z), 0.9 * k);
    }
    switch (f.roster.char) {
      case 'lancer': {
        // sparks crawling up the spear, and arcs jumping along it (all the time as it swings)
        const sparks = Math.round((swing ? 90 : 28) * dt + Math.random());
        for (let i = 0; i < sparks; i++) {
          const p = along(rnd(0.15, 1));
          fx.emit(p.x, p.y, p.z, rnd(-1, 1), rnd(-0.5, 1.5), rnd(-1, 1), Math.random() < 0.5 ? '#bfe6ff' : '#ffffff', { life: 0.16, size: 0.028, gravity: 0, drag: 6, stretch: 0.04 });
        }
        st.arc -= dt;
        if (st.arc <= 0) {
          st.arc = swing ? 0.03 : rnd(0.1, 0.35);
          const a = along(rnd(0.1, 0.5));
          const b = along(rnd(0.6, 1)).add(new THREE.Vector3(rnd(-0.3, 0.3), rnd(-0.2, 0.35), rnd(-0.3, 0.3)).multiplyScalar(k));
          fx.arc(a, b, '#8fd0ff', 5, 0.12 * k, swing ? 0.07 : 0.09);
        }
        // the charge he carries radiates off him: short arcs leaping out of his body
        st.body -= dt;
        if (st.body <= 0) {
          st.body = rnd(0.08, 0.25);
          const a = new THREE.Vector3(f.pos.x + rnd(-0.22, 0.22) * k, f.pos.y + rnd(0.35, 1.75) * k, f.pos.z + rnd(-0.22, 0.22) * k);
          const out = new THREE.Vector3(a.x - f.pos.x, rnd(-0.3, 0.7), a.z - f.pos.z).normalize().multiplyScalar(rnd(0.35, 0.8) * k);
          fx.arc(a, out.add(a), Math.random() < 0.5 ? '#8fd0ff' : '#bfe6ff', 4, 0.09 * k, 0.07, 0.018);
        }
        // and every so often one snaps down to the ground beside him with a crack
        st.ground -= dt;
        if (st.ground <= 0) {
          st.ground = swing ? rnd(0.3, 0.7) : rnd(0.8, 1.9);
          const a = Math.random() < 0.5 ? along(rnd(0.4, 1)) : new THREE.Vector3(f.pos.x, f.pos.y + rnd(0.8, 1.6) * k, f.pos.z);
          const ang = rnd(0, Math.PI * 2);
          const r = rnd(0.7, 1.6) * k;
          const g = new THREE.Vector3(f.pos.x + Math.cos(ang) * r, f.pos.y + 0.04, f.pos.z + Math.sin(ang) * r);
          fx.arc(a, g, '#bfe6ff', 7, 0.16 * k, 0.11, 0.035);
          fx.arc(a, g, '#8fd0ff', 6, 0.22 * k, 0.07, 0.02);
          fx.sparkle(g, '#bfe6ff', 0.8);
          fx.ring(g, '#8fd0ff', 0.7, 0.25, undefined, true);
          audio.zap(swing ? 1 : 0.75, { vol: this.volumeAt(g.x, g.z), pos: g });
        }
        break;
      }
      case 'ronin': {
        // the cut leaves a ribbon of smoke along the blade's path, drifting and spreading as it hangs
        if (swing) {
          for (let i = 0; i < Math.round(170 * dt + Math.random()); i++) {
            const p = along(rnd(0.2, 1));
            const c = ['#f4f4f6', '#dcdde2', '#c4c6cd', '#a9acb5'][Math.floor(Math.random() * 4)];
            fx.emit(p.x, p.y, p.z, rnd(-0.15, 0.15), rnd(0.05, 0.3), rnd(-0.15, 0.15), c, { life: rnd(1.0, 1.6), size: 0.065 * k, gravity: -0.12, drag: 1.6, grow: 3.6, alpha: 0.35 });
          }
        }
        // his special and his iai tear through the air in a thick black smoke shot with embers,
        // left hanging along the blade's path and the line he lunged down
        const tearing = v.state === 'attack' && (v.key === 'sp' || v.key === 'ia') ? v.attack : null;
        if (tearing && v.elapsed > v.windup * 0.45 && v.elapsed < v.windup + tearing.active + 260) {
          for (let i = 0; i < Math.round(420 * dt + Math.random()); i++) {
            const p = Math.random() < 0.7 ? along(rnd(0.05, 1)) : this.tmp.set(f.pos.x + rnd(-0.3, 0.3) * k, f.pos.y + rnd(0.3, 1.6) * k, f.pos.z + rnd(-0.3, 0.3) * k);
            const c = ['#141012', '#1f1718', '#2b1d1e', '#3a2322', '#4a1616'][Math.floor(Math.random() * 5)];
            fx.emit(p.x, p.y, p.z, rnd(-0.25, 0.25), rnd(0.0, 0.25), rnd(-0.25, 0.25), c, { life: rnd(1.6, 2.6), size: 0.075 * k, gravity: -0.06, drag: 1.4, grow: 3.8, alpha: 0.5 });
          }
          for (let i = 0; i < Math.round(110 * dt + Math.random()); i++) {
            const p = along(rnd(0.2, 1));
            const c = ['#ff3a1a', '#ff6a2a', '#ffb04a'][Math.floor(Math.random() * 3)];
            fx.emit(p.x, p.y, p.z, rnd(-1.2, 1.2), rnd(0.2, 1.4), rnd(-1.2, 1.2), c, { life: rnd(0.6, 1.2), size: 0.03, gravity: -0.4, drag: 1.4, stretch: 0.05 });
          }
        }
        break;
      }
      case 'paladin': {
        // motes of holy light drifting up around him, and the blade glittering (far more as it swings)
        if (Math.random() < 10 * dt) {
          const ang = Math.random() * Math.PI * 2;
          const r = rnd(0.3, 0.75) * k;
          fx.emit(f.pos.x + Math.cos(ang) * r, f.pos.y + rnd(0.1, 1.9) * k, f.pos.z + Math.sin(ang) * r, 0, rnd(0.25, 0.55), 0, Math.random() < 0.5 ? '#ffe08a' : '#fff6d0', { life: rnd(1.2, 2), size: 0.03, gravity: -0.15, drag: 0.6 });
        }
        const glints = Math.round((swing ? 80 : 7) * dt + Math.random() * (swing ? 1 : 0.3));
        for (let i = 0; i < glints; i++) {
          const p = along(rnd(0.1, 1));
          fx.emit(p.x, p.y, p.z, rnd(-0.3, 0.3), rnd(0, 0.6), rnd(-0.3, 0.3), Math.random() < 0.6 ? '#fff2b0' : '#ffd86a', { life: swing ? rnd(0.4, 0.7) : 0.35, size: 0.032, gravity: -0.3, drag: 3 });
        }
        break;
      }
    }
  }

  /**
   * One of an execution's flourish strikes lands: the victim takes it like any heavy hit, knocked
   * the way the blow travelled, with a flash, a moment's freeze, blood and the hit's sound.
   */
  private executionBlow(a: ClientFighter): void {
    let d: ClientFighter | null = null;
    let best = 6;
    for (const f of this.fighters.values()) {
      if (f === a || f.s !== 'executed') continue;
      const dd = dist2D(a.pos.x, a.pos.z, f.pos.x, f.pos.z);
      if (dd < best) {
        best = dd;
        d = f;
      }
    }
    if (!d) return;
    const swing = a.swingDir;
    const chest = new THREE.Vector3(d.pos.x, d.pos.y + 1.1 * d.model.scale, d.pos.z);
    d.model.react('hit', { side: Math.max(-1, Math.min(1, swing.x * Math.cos(d.yaw) - swing.z * Math.sin(d.yaw))), heavy: true });
    d.model.flash('#ffffff', 0.7);
    // the executioner's freeze is shorter: flourishes can come 120 ms apart, and the lag must be
    // made up before the finishing blow
    d.hitstop(110, 0.08);
    a.hitstop(70);
    this.effects.blood(chest, swing, 0.9);
    audio.executionBlow(a.roster.char, d.roster.char, { vol: this.volumeAt(chest.x, chest.z), pos: chest });
    if (a === this.local?.cf || d === this.local?.cf) this.cam.shake(0.22, 0.22);
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
        case 'blow':
          this.executionBlow(f);
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

  /**
   * A perilous area attack's ground, marked from the first frame of its windup so you can get off
   * it: the strip ahead a fissure will split, the band around the Wraith his ring of fire will
   * sweep, the circle lightning will strike where you stood. The fill reaches the edge as the blow
   * lands, and the attack's own effect goes off across the whole of it.
   */
  private areaFx(f: ClientFighter, now: number): void {
    const v = f.view(now);
    const atk = v.state === 'attack' && v.attack?.perilous ? v.attack : null;
    const shape = atk?.shape;
    let m = this.marks.get(f.id);
    if (m && (!shape || m.serial !== v.serial)) {
      // stopped before it landed
      m.tg.cancel();
      this.fadingMarks.push(m.tg);
      this.marks.delete(f.id);
      m = undefined;
    }
    if (!atk || !shape || f.lastAreaSerial === v.serial) return;
    // a thrown spear's line stays marked until the spear is back in his hand
    const lands = v.windup + (atk.thrown ? atk.active : 0);
    if (!m) {
      if (v.elapsed >= lands) return;
      const tg = atk.thrown ? new Telegraph(shape, atk.range, '#ff2a2a', BOLT, false) : new Telegraph(shape, atk.range, '#ff2a2a', AREA_HIT[shape.kind]);
      this.effects.group.add(tg.mesh);
      m = { tg, serial: v.serial, aim: null };
      this.marks.set(f.id, m);
    }
    if (shape.kind === 'zone') {
      // where the server says it's aimed; until that arrives (your own), the same choice made here
      m.aim = f.am ?? m.aim ?? zoneAim({ x: f.pos.x, z: f.pos.z, yaw: f.yaw }, [...this.fighters.values()].filter((o) => o !== f && o.s !== 'dead').map((o) => o.pos), atk.range);
      m.tg.place(m.aim.x, m.aim.z, 0);
    } else m.tg.place(f.pos.x, f.pos.z, f.yaw);
    m.tg.progress = v.elapsed / v.windup;
    if (v.elapsed < lands) return;
    f.lastAreaSerial = v.serial;
    m.tg.strike();
    this.fadingMarks.push(m.tg);
    this.marks.delete(f.id);
    if (!atk.thrown) this.areaStrike(f, atk, shape, m.tg.mesh.position.clone(), f.yaw);
  }

  /**
   * The Lancer's thrown spear (an attack with `thrown`): the spear leaves his hand as the windup
   * ends and a copy of it flies the length of the line and back to the hand (thrownOut, the pace
   * the server judges the hits by), while the one in his hand is hidden. Out, it streaks lightning
   * and lights the line behind it; at the far end the sky answers with a bolt; coming back it's
   * pulled home on a lightning tether, and lands in his palm with a crack. If the throw is cut
   * short it still flies back. Runs before the fighter's model updates, so the hand is empty the
   * same frame.
   */
  private spearFlight(f: ClientFighter, dt: number, now: number): void {
    const v = f.view(now);
    const atk = v.state === 'attack' ? v.attack : null;
    const flying = !!atk?.thrown && v.elapsed >= v.windup && v.elapsed < v.windup + atk.active;
    let s = this.spears.get(f.id);
    if (flying && atk && (!s || s.serial !== v.serial)) {
      if (s) this.landSpear(f, s, false);
      s = this.throwSpear(f, atk, v.serial);
    }
    if (!s) return;
    if (flying && atk && s.serial === v.serial) s.u = (v.elapsed - v.windup) / atk.active;
    else {
      // home, or the throw cut short: straight back the way it would have come
      if (s.u < 0.5) s.u = 1 - s.u;
      s.u += (dt * 1000) / (s.ms * 0.4);
    }
    if (s.u >= 1) {
      this.landSpear(f, s, true);
      return;
    }
    f.model.thrown = true;
    const fx = this.effects;
    const hand = f.model.weaponXf('main', this.tmp, this.tmpQ, this.tmp2) ? this.tmp : f.pos;
    const far = this.tmp3.copy(s.from).addScaledVector(s.dir, s.reach);
    const back = s.u > 0.5;
    const grip = (back ? hand : s.from).clone().lerp(far, thrownOut(s.u));
    const dir = back ? far.clone().sub(hand).normalize() : s.dir;
    if (dir.lengthSq() < 0.5) dir.copy(s.dir);
    s.spin += dt * 26;
    s.mesh.position.copy(grip);
    s.mesh.quaternion.setFromUnitVectors(Z_AXIS, dir).multiply(this.tmpQ.setFromAxisAngle(Z_AXIS, s.spin));
    const tip = grip.clone().addScaledVector(dir, s.len);
    const butt = grip.clone().addScaledVector(dir, -s.len * 0.35);
    // the shaft blazing with lightning, the streak it leaves, and sparks spitting off it
    fx.beam(butt, tip, BOLT, 0.2, 0.05);
    fx.beam(butt, tip, '#ffffff', 0.07, 0.04);
    if (s.lastTip) {
      fx.beam(back ? tip : s.lastTip, back ? s.lastTip : tip, BOLT, 0.09, 0.14);
      fx.beam(back ? tip : s.lastTip, back ? s.lastTip : tip, '#ffffff', 0.03, 0.1);
    }
    s.lastTip = tip.clone();
    s.spark += dt;
    if (s.spark > 0.035) {
      s.spark = 0;
      for (let i = 0; i < 3; i++) {
        const p = butt.clone().lerp(tip, Math.random());
        fx.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, i ? BOLT : '#ffffff', { life: 0.3, size: 0.05, gravity: 4, drag: 2, stretch: 0.05 });
      }
      fx.arc(tip, tip.clone().add(this.tmp2.set((Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.4)), BOLT, 3, 0.12, 0.07, 0.022);
      // coming back it's pulled home along a tether of lightning
      if (back) {
        fx.arc(hand.clone(), butt, '#fff3b0', 9, 0.3, 0.07, 0.03);
        audio.zap(0.7, { vol: this.volumeAt(butt.x, butt.z), pos: butt });
      }
    }
    // the far end: the sky answers, and the whole line it flew lights up behind it
    if (back && !s.turned) {
      s.turned = true;
      const ground = new THREE.Vector3(tip.x, Math.max(0, f.pos.y) + 0.05, tip.z);
      fx.bolt(tip, BOLT, 1.3);
      fx.bolt(tip, '#cfe8ff', 0.7);
      fx.shockwave(ground, 0.9, BOLT);
      fx.flash(tip, '#fff6d0', 3.2, 0.22);
      fx.beam(s.from, tip, '#fff3b0', 0.05, 0.7);
      fx.beam(s.from, tip, BOLT, 0.16, 0.45);
      const me = this.local?.cf;
      const k = me ? Math.max(0, 1 - Math.min(dist2D(me.pos.x, me.pos.z, tip.x, tip.z), dist2D(me.pos.x, me.pos.z, f.pos.x, f.pos.z)) / 14) : 0;
      this.renderer.flash = Math.max(this.renderer.flash, 0.3 + 0.35 * k);
      this.renderer.flashColor.set('#fff8e0');
      if (k > 0.05) this.cam.shake(0.3 * k, 0.4);
      audio.cue('bolt', f.roster.char, 1.8, { vol: this.volumeAt(tip.x, tip.z), pos: tip, hero: true });
    }
  }

  /** Thunderreach leaves the hand: the copy that flies, set off along his line. */
  private throwSpear(f: ClientFighter, atk: AttackDef, serial: number): SpearFlight {
    const m = f.model;
    const mesh = m.weapon.main.clone(true);
    mesh.traverse((o) => (o.visible = true));
    const from = new THREE.Vector3();
    const scale = new THREE.Vector3();
    m.weaponXf('main', from, this.tmpQ, scale);
    mesh.scale.copy(scale);
    this.scene.add(mesh);
    const len = from.distanceTo(f.weaponTip(this.tmp));
    // out along his facing, from the hand down to chest height, the tip reaching the line's end
    const fw = forward(f.yaw);
    const reachXZ = Math.max(1, atk.range - len);
    const far = new THREE.Vector3(f.pos.x + fw.x * reachXZ, Math.max(0, f.pos.y) + 1.15 * m.scale, f.pos.z + fw.z * reachXZ);
    const dir = far.clone().sub(from);
    const reach = dir.length();
    dir.divideScalar(reach);
    const s: SpearFlight = { mesh, serial, from, dir, reach, len, u: 0, ms: atk.active, turned: false, spin: 0, spark: 0, lastTip: null };
    this.spears.set(f.id, s);
    // the release: a flash off the hand and a crack of lightning
    const fx = this.effects;
    fx.flash(from, '#fff6d0', 2.2, 0.16);
    fx.spray(from, dir, [BOLT, '#ffffff'], 18, 9, 0.35, { life: 0.3, size: 0.05, gravity: 2, stretch: 0.06 });
    audio.zap(1.6, { vol: this.volumeAt(from.x, from.z), pos: from });
    this.shakeNear(f, 0.12, 0.2);
    return s;
  }

  /** The spear back in his hand (`caught`), or put away (a new throw, or he's gone). */
  private landSpear(f: ClientFighter, s: SpearFlight, caught: boolean): void {
    s.mesh.removeFromParent();
    this.spears.delete(f.id);
    f.model.thrown = false;
    if (!caught) return;
    const fx = this.effects;
    const hand = f.model.weaponXf('main', this.tmp, this.tmpQ, this.tmp2) ? this.tmp.clone() : f.pos.clone();
    fx.flash(hand, '#fff6d0', 1.8, 0.16);
    fx.sparkle(hand, BOLT, 1.3);
    fx.spray(hand, s.dir.clone().negate(), [BOLT, '#ffffff'], 16, 6, 0.6, { life: 0.35, size: 0.05, gravity: 5, stretch: 0.05 });
    for (let i = 0; i < 3; i++) fx.arc(hand, new THREE.Vector3(hand.x + (Math.random() - 0.5) * 1.6, Math.max(0, f.pos.y) + 0.05, hand.z + (Math.random() - 0.5) * 1.6), BOLT, 5, 0.18, 0.1, 0.025);
    audio.zap(1.8, { vol: this.volumeAt(hand.x, hand.z), pos: hand });
    audio.cue('shockwave', f.roster.char, 0.7, { vol: this.volumeAt(hand.x, hand.z), pos: hand });
    this.shakeNear(f, 0.14, 0.18);
  }

  /** The blow of an area attack landing across the ground it marked. */
  private areaStrike(f: ClientFighter, atk: AttackDef, shape: AttackShape, at: THREE.Vector3, yaw: number): void {
    const fx = this.effects;
    const me = this.local?.cf;
    const near = (p: THREE.Vector3): number => (me ? Math.max(0, 1 - dist2D(me.pos.x, me.pos.z, p.x, p.z) / 14) : 0);
    at.y = 0.05;
    switch (shape.kind) {
      case 'line': {
        // the ground splits from the hammer out to the end of the strip, earth thrown up along it
        const fw = forward(yaw);
        const dir = new THREE.Vector3(fw.x, 0, fw.z);
        for (let s = 0.8; s <= atk.range; s += 0.7) {
          const p = new THREE.Vector3(at.x + fw.x * s, 0.05, at.z + fw.z * s);
          fx.after(s * 0.02, () => {
            fx.quake(p, dir, 0.8);
            if (Math.random() < 0.5) fx.debris(p, 0.7);
          });
        }
        const end = new THREE.Vector3(at.x + fw.x * atk.range, 0.05, at.z + fw.z * atk.range);
        fx.after(atk.range * 0.02, () => fx.shockwave(end, 0.7, AREA_HIT.line));
        const mid = at.clone().addScaledVector(dir, atk.range / 2);
        audio.cue('quake', f.roster.char, 1.8, { vol: this.volumeAt(mid.x, mid.z), pos: mid });
        const k = Math.max(near(at), near(mid), near(end));
        if (k > 0.05) this.cam.shake(0.2 * k, 0.4);
        break;
      }
      case 'zone': {
        // lightning out of a clear sky onto the mark
        fx.bolt(at, AREA_HIT.zone, 1.7);
        fx.bolt(at, '#cfe8ff', 0.9);
        fx.shockwave(at, 0.7, AREA_HIT.zone);
        const k = near(at);
        this.renderer.flash = Math.max(this.renderer.flash, 0.25 + 0.4 * k);
        this.renderer.flashColor.set('#fff8e0');
        if (k > 0.05) this.cam.shake(0.32 * k, 0.35);
        audio.cue('bolt', f.roster.char, 2, { vol: this.volumeAt(at.x, at.z), pos: at });
        break;
      }
      case 'ring': {
        // soulfire bursts up all through the band and a green wave rolls out across it
        for (let i = 0; i < 30; i++) {
          const a = (i / 30) * Math.PI * 2 + Math.random() * 0.2;
          const r = shape.inner + Math.random() * (atk.range - shape.inner);
          fx.soulfire(new THREE.Vector3(at.x + Math.cos(a) * r, 0.05, at.z + Math.sin(a) * r), 0.7);
        }
        fx.ring(at, AREA_HIT.ring, atk.range, 0.55, undefined, true);
        fx.ring(at, '#b8ffd0', shape.inner, 0.35, undefined, true);
        const k = near(at);
        if (k > 0.05) this.cam.shake(0.18 * k, 0.25);
        break;
      }
    }
  }

  private updateMarks(dt: number): void {
    for (const [id, m] of this.marks) {
      if (this.fighters.has(id)) m.tg.update(dt);
      else {
        m.tg.cancel();
        this.fadingMarks.push(m.tg);
        this.marks.delete(id);
      }
    }
    for (let i = this.fadingMarks.length - 1; i >= 0; i--) {
      if (this.fadingMarks[i].update(dt)) continue;
      this.fadingMarks[i].dispose();
      this.fadingMarks.splice(i, 1);
    }
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
        // the first of each kind coming at you in a match: what to do about it
        if (this.kind === 'arena' && f.id !== this.myId && this.match?.mode !== 'tutorial') this.tips.show(`perilous-${v.attack.perilous}`);
        audio.perilous(f.roster.char, { vol, pos: f.pos }, Math.max(0, v.attack.windup - v.elapsed) / 1000);
        this.effects.flash(this.tmp.set(f.pos.x, f.pos.y + 2.4 * f.model.scale, f.pos.z), '#ff2a2a', 1.4, 0.3);
      }
      if (v.state === 'dodge' && v.elapsed < 200) audio.dodge(f.roster.char, v.dodgeKind ?? 'roll', { vol: vol * 0.8, pos: f.pos });
      // the opponent starting an attack: their weapon glints the moment the windup begins, so you
      // see it coming whatever the angle (white for a light, orange for a heavy, red if perilous)
      if (v.state === 'attack' && v.attack && !v.attack.noHitbox && !f.isLocal && settings.parryCue) {
        const me = this.local?.cf;
        if (me && dist2D(me.pos.x, me.pos.z, f.pos.x, f.pos.z) < 14) {
          const heavy = isHeavyKey(v.key) || v.key === 'sp';
          const tip = f.weaponTip(new THREE.Vector3());
          const c = v.attack.perilous ? '#ff3a2a' : heavy ? '#ffa02a' : '#ffffff';
          this.effects.flash(tip, c, heavy || v.attack.perilous ? 1.0 : 0.7, 0.18);
          this.effects.burst(tip, { count: heavy ? 8 : 5, color: [c, '#ffffff'], speed: 3, life: 0.2, size: 0.04, gravity: 0, drag: 4 });
        }
      }
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
    this.exec = { a, d, t: 0, start: this.net.serverNow(), hitDone: false, whooshed: false, led: false };
    audio.musicDuck(true);
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
      // the finishing blow's recordings that swell into it
      if (!ex.led && ex.t >= COMBAT.executeHitAt - EXEC_SOUND_LEAD) {
        ex.led = true;
        audio.executionLead(ex.a.roster.char, { vol: this.volumeAt(ex.a.pos.x, ex.a.pos.z), pos: ex.a.pos });
      }
      // the finishing strike's heavy swing, started to swell into the blow
      if (!ex.whooshed && ex.t >= COMBAT.executeHitAt - EXEC_WHOOSH_LEAD) {
        ex.whooshed = true;
        audio.executionStrike(ex.a.id, ex.a.roster.char, { vol: this.volumeAt(ex.a.pos.x, ex.a.pos.z), pos: ex.a.pos });
      }
      const T = COMBAT.executeTime;
      dark = Math.min(1, ex.t / 350) * (1 - Math.max(0, Math.min(1, (ex.t - (T - 450)) / 450)));
      if (ex.t >= T || !this.fighters.has(ex.a.id) || !this.fighters.has(ex.d.id)) {
        this.exec = null;
        audio.musicDuck(false);
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
    // the impact frame: ink on white, then on red, IMPACT_MS each
    const sinceImpact = performance.now() - this.impactStart;
    this.renderer.impact = sinceImpact < IMPACT_MS ? 1 : sinceImpact < 2 * IMPACT_MS ? 2 : 0;
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
    this.input.suspended = this.ui.chatOpen || !!this.ui.modalOpen || this.select.open || !!this.titleScreen?.active || !!this.ceremony;
    this.entranceCues(now);
    const left = this.select.tick(now);
    if (left !== null && left > 0) audio.selectBoom(left);

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
    for (const [id, s] of this.spears) {
      if (this.fighters.has(id)) continue;
      s.mesh.removeFromParent();
      this.spears.delete(id);
    }
    for (const f of this.fighters.values()) {
      f.interpolate(now);
      const buff = (f.flags & 1) === 1 || (!!f.sim && f.sim.buffActive(now));
      this.spearFlight(f, dt, now);
      f.updateVisual(dt, now, buff);
      this.stateCues(f, now);
      this.areaFx(f, now);
      this.moveFx(f);
      this.auraFx(f, dt);
      this.signatureFx(f, dt);
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
      this.cam.subjectBulk = CAMERA_BULK[this.local.cf.roster.char] ?? 1;
      this.cam.update(dt, p, this.lock ? this.lock.pos : null, { dodging: this.local.sim.state === 'dodge' });
      this.mapView?.update(dt, p);
    } else if (this.demoSubject) {
      const f = this.demoSubject;
      this.cam.shakeScale = 1;
      this.cam.subjectScale = f.model.scale;
      this.cam.targetScale = this.lock?.model.scale ?? 1;
      this.cam.subjectBulk = CAMERA_BULK[f.roster.char] ?? 1;
      this.cam.update(dt, f.pos, this.lock ? this.lock.pos : null, { dodging: f.s === 'dodge' });
      this.mapView?.update(dt, f.pos);
    } else if (this.titleScene) {
      this.titleScene.update(dt);
    } else {
      this.mapView?.update(dt, new THREE.Vector3());
    }
    this.titleScreen?.update(dt);
    this.ringWalls?.update(dt);
    this.effects.update(dt, this.renderer.camera);
    this.updateMarks(dt);
    this.updateHud(dt, now);
    // recording the trailer draws only the frames it keeps (see scripts in demo.ts); the unlock
    // ceremony covers the whole screen, so the world under it isn't drawn (its fighter is)
    if ((!DEMO || (globalThis as { __demoRender?: boolean }).__demoRender !== false) && !this.ceremony) this.renderer.render();
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

  /** The fight's HUD while the game plays itself (DEMO): both cards and the foe's posture, from what the server says. */
  private demoHud(now: number): void {
    const me = this.demoSubject;
    const m = this.match;
    if (!me || !m) return;
    this.ui.setMatch(m, now);
    if (m.phase === 'countdown') {
      const secs = Math.ceil((m.endsAt - now) / 1000);
      if (secs !== this.lastCountdown && secs > 0 && secs <= 3) {
        this.lastCountdown = secs;
        this.ui.banner(String(secs), `第${KANJI_NUM[m.round] ?? m.round}戦 · Round ${m.round}`, 950, 'count', KANJI_NUM[secs]);
      }
    }
    const foe = this.fighters.get(m.players[m.you === 0 ? 1 : 0].id) ?? null;
    const card = (f: ClientFighter, score: number): CardData => ({
      name: f.roster.name,
      title: f.roster.mmr !== undefined ? rankOf(f.roster.mmr, f.roster.placements ?? 0).label : '',
      char: f.char,
      hp: f.hp,
      special: f.specialCharge(now),
      posture: f.po / f.char.stats.posture,
      broken: f.s === 'broken',
      pips: score,
      pipMax: MATCH.roundsToWin,
      meta: '',
    });
    this.ui.setCard('self', card(me, m.scores[m.you]));
    this.ui.setPostureMain(me.po / me.char.stats.posture, me.s === 'broken');
    if (!foe) return;
    this.ui.setCard('opp', card(foe, m.scores[m.you === 0 ? 1 : 0]));
    const head = foe.s !== 'dead' ? this.project(foe.pos.x, foe.pos.y + 2.25 * foe.model.scale, foe.pos.z) : null;
    this.ui.setFoePosture(head, foe.po / foe.char.stats.posture, foe.s === 'broken');
    this.ui.setBrokenMark(foe.s === 'broken' ? this.project(foe.pos.x, foe.pos.y + 1.25 * foe.model.scale, foe.pos.z) : null);
  }

  private project(x: number, y: number, z: number): { x: number; y: number } | null {
    const out = { x: 0, y: 0 };
    return this.renderer.project(this.tmp.set(x, y, z), out) ? out : null;
  }

  /** whether your special and ability were last seen charged (so each comes back with a sound) */
  private readySeen = { special: true, ability: true };
  /** when your heart next beats, while you're nearly dead */
  private heartAt = 0;

  /** Your special and ability coming back, and your heartbeat when you're nearly dead. */
  private feedbackCues(sim: LocalController['sim'], now: number): void {
    const fighting = sim.isAlive() && (!this.match || this.match.phase === 'fight');
    const special = fighting && now >= sim.specialReadyAt;
    const ability = fighting && now >= sim.abilityReadyAt;
    if (special && !this.readySeen.special) audio.ready('special');
    if (ability && !this.readySeen.ability) audio.ready('ability');
    // outside a fight they count as seen, so nothing chimes the moment it starts
    this.readySeen = { special: special || !fighting, ability: ability || !fighting };
    const left = sim.hp / sim.maxHp;
    if (fighting && left > 0 && left <= 0.25 && now >= this.heartAt) {
      audio.lowHealth(left <= 0.1 ? 1 : 0.7);
      this.heartAt = now + (left <= 0.1 ? 650 : 900);
    }
  }

  private updateHud(dt: number, now: number): void {
    this.ui.updateFloaters(dt, (x, y, z) => this.project(x, y, z));
    const local = this.local;
    if (!local) return this.demoHud(now);
    const me = local.cf;
    const sim = local.sim;
    this.ui.setNetInfo(this.online, this.offline ? null : Math.round(this.net.rtt), settings.showFps ? this.fps.value : null, this.kind === 'lobby' ? this.lobbyInfo : null);
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
    this.feedbackCues(sim, now);
    // no giving up a match that's over, or while you're finishing them off
    const m0 = this.match;
    const rival = m0 ? this.fighters.get(m0.players[m0.you === 0 ? 1 : 0].id) : undefined;
    this.ui.setForfeitable(!!m0 && m0.mode !== 'tutorial' && m0.phase !== 'matchEnd' && sim.state !== 'execute' && rival?.s !== 'executed' && rival?.s !== 'dead');
    // the tutorial's arrow and timing ring follow the sensei
    if (this.tutorial && rival) {
      const v = rival.view(now);
      const blow = v.state === 'attack' && v.attack ? { left: v.windup - v.elapsed, windup: v.windup } : null;
      this.tutorial.update({ foe: this.project(rival.pos.x, rival.pos.y + 1.2 * rival.model.scale, rival.pos.z), blow });
    }
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
        audio.countdown(secs);
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
      const title = r.dummy ? 'Training' : r.mmr !== undefined ? rankOf(r.mmr, r.placements ?? 0).label : '';
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
      const color = r.dummy ? '#c9b8a0' : r.mmr !== undefined ? rankOf(r.mmr, r.placements ?? 0).color : '#ffffff';
      this.ui.plate(f.id, true, p.x, p.y, r.name, f.hp / f.char.stats.hp, color, f.char.name, f.po / f.char.stats.posture);
    }

    // challenge prompt / death
    this.ringHud(now);
    const dueling = this.myRing();
    const ct = dueling ? null : this.challengeTarget();
    const who = ct ? `<b>${ct.roster.name.replace(/</g, '&lt;')}</b>` : '';
    const ring = this.kind === 'lobby' && !dueling ? this.ringAt(me.pos.x, me.pos.z) : -1;
    const free = ring >= 0 && (this.rings[ring]?.state ?? 'open') === 'open';
    const here = free && ct && this.ringAt(ct.pos.x, ct.pos.z) === ring;
    const act = this.touch ? 'Tap to challenge' : '<b>[G]</b> Challenge';
    let prompt: string | null = null;
    if (sim.isAlive() && ct) prompt = here ? `${act} ${who} to a duel <b>here in the ring</b>` : `${act} ${who} to a duel`;
    else if (sim.isAlive() && free) prompt = 'Duel ring · challenge someone standing in it with you to fight them here, uninterrupted';
    this.ui.setPrompt(prompt);
    if (this.kind === 'lobby' && sim.state === 'dead') this.ui.setDeath(dueling ? 'Beaten in the ring… you get up where you fell' : 'Respawning in the shrine plaza…');
    else this.ui.setDeath(null);
    void forward;
  }
}

/** Small spinning character preview for the select screen. */
/** A fighter on a turntable going through their moves; `close`: framed tighter, for a square frame. */
function createPreview(container: HTMLElement, close = false): Preview {
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
      // framed close on the fighter, whatever their size, so they fill the tall frame (or the square one)
      const k = model.scale;
      r.camera.position.set(0, (close ? 1.15 : 1.25) * k, (close ? 2.35 : 3.1) * k);
      r.camera.lookAt(0, (close ? 1.0 : 0.95) * k, 0);
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
