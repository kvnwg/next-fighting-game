import {
  ENTRANCE_MS,
  MAP_IDS,
  MAX_HP,
  Rng,
  VOTE_MS,
  WEAPONS,
  WEAPON_IDS,
  startPosition,
  type BotLevel,
  type MapId,
  type PlayerInfo,
  type RoomPhase,
  type RoomState,
  type ServerMessage,
  type Side,
  type SimEvent,
  type WeaponId,
  type Winner,
} from '@nfg/shared';
import { AudioEngine } from '../audio/engine.ts';
import { InputManager, type UiAction } from '../input/input.ts';
import { TouchControls } from '../input/touch.ts';
import { NetClient, serverUrl } from '../net/client.ts';
import type { Platform } from '../platform/crazygames.ts';
import { detectDevice, pickQuality, qualityPreset, type DeviceKind } from '../platform/device.ts';
import { camPose } from '../render/camera.ts';
import type { FighterRenderState } from '../render/fighter-visual.ts';
import { Hud, type HudMode } from '../ui/hud.ts';
import { ScreenFx } from '../ui/overlay.ts';
import {
  ControlsCard,
  LoadingScreen,
  LobbyBar,
  MenuButton,
  MenuScreen,
  NameCard,
  ResultsScreen,
  VoteScreen,
  toast,
  type Settings,
} from '../ui/screens.ts';
import { EntranceDirector, type EntranceHooks } from './entrance.ts';
import { playEvent } from './feedback.ts';
import { loadProfile, loadSettings, playerInfo, saveProfile, saveSettings, titleFor, type Profile } from './profile.ts';
import { LocalSession, OnlineSession, type Session } from './session.ts';
import { World } from './world.ts';

type Phase = 'boot' | 'practice' | 'vote' | 'load' | 'entrance' | 'fight' | 'results';
type MapVote = MapId | 'random' | null;

const BOT_NAMES: Record<BotLevel, string> = { dummy: 'Training Dummy', easy: 'Bot (Easy)', normal: 'Bot (Normal)', hard: 'Bot (Hard)' };
const BOT_LEVEL_LABEL: Record<BotLevel, string> = { dummy: 'Dummy', easy: 'Easy', normal: 'Normal', hard: 'Hard' };
const BOT_TITLES: Record<BotLevel, string> = { dummy: 'Practice', easy: 'Wanderer', normal: 'Swordsman', hard: 'Sword Saint' };
const SEARCH_BOT_OFFER_MS = 20_000;
/** A build without a match server (VITE_OFFLINE=1, e.g. a hosted demo) offers practice and bot matches only. */
const ONLINE = !import.meta.env.VITE_OFFLINE;
const PRACTICE_STATUS = ONLINE ? 'Practice: hit the dummy, or start a match' : 'Practice: hit the dummy, or fight the bot';

export class App {
  private readonly ui = document.getElementById('ui')!;
  private readonly canvas = document.getElementById('game') as HTMLCanvasElement;
  private world!: World;
  private input!: InputManager;
  private touch!: TouchControls;
  private audio!: AudioEngine;
  private hud!: Hud;
  private fx!: ScreenFx;
  private lobby!: LobbyBar;
  private menuBtn!: MenuButton;
  private director!: EntranceDirector;
  private readonly controls = new ControlsCard();
  private readonly voteScreen = new VoteScreen();
  private readonly loading = new LoadingScreen();
  private readonly nameCard = new NameCard();
  private readonly results = new ResultsScreen();
  private readonly menu = new MenuScreen();
  private readonly net = new NetClient();
  private readonly rng = new Rng(Date.now() & 0xffffff);
  private profile!: Profile;
  private settings!: Settings;
  private device: DeviceKind = 'desktop';

  phase: Phase = 'boot';
  mode: 'local' | 'online' = 'local';
  session: Session | null = null;
  private you: Side = 0;
  private players: [PlayerInfo, PlayerInfo] = [
    { name: 'You', avatar: null, title: '' },
    { name: 'Opponent', avatar: null, title: '' },
  ];
  private weapons: [WeaponId, WeaponId] = ['ronin', 'warden'];
  private botLevel: BotLevel = 'normal';
  private paused = false;
  private last = performance.now();
  private time = 0;
  private rs: [FighterRenderState, FighterRenderState] | null = null;
  /** Whether each fighter has made their entrance yet (hidden from loading until then). */
  private arrived: [boolean, boolean] = [true, true];

  private votes: { map: MapVote[]; weapon: (WeaponId | null)[] } = { map: [null, null], weapon: [null, null] };
  private voteEndsAt = 0;
  private botVoteAt = 0;
  private droned = false;
  private introBeat = 0;
  private entranceSkipped = false;
  private matchStarted = false;

  private serverPhase: RoomPhase | null = null;
  private room: RoomState | null = null;
  private searching = false;
  private searchStarted = 0;
  private listening = false;

  constructor(private readonly platform: Platform) {}

  async boot(): Promise<void> {
    this.platform.loadingStart();
    this.device = detectDevice(this.platform);
    this.settings = loadSettings(this.platform);
    const override = new URLSearchParams(window.location.search).get('quality');
    const quality = this.settings.quality === 'auto' ? pickQuality(this.device, override) : qualityPreset(this.settings.quality);
    const mobile = this.device !== 'desktop';

    this.world = new World(this.canvas, quality, mobile);
    this.input = new InputManager(this.canvas);
    this.touch = new TouchControls(document.getElementById('touch')!, this.input);
    this.touch.setLefty(this.settings.lefty);
    this.audio = new AudioEngine({ mobile });
    this.hud = new Hud(document.getElementById('hud')!);
    this.fx = new ScreenFx(document.getElementById('overlay')!, this.canvas, quality.cssFilters);
    this.director = new EntranceDirector(
      (shots) => this.world.cam.playShots(shots),
      () => this.world.cam.stopShots(),
    );
    this.lobby = new LobbyBar(this.ui, {
      quick: () => void this.quickMatch(),
      bot: () => this.startBotMatch(),
      invite: () => void this.invite(),
      cancel: () => this.cancelSearch(),
    }, ONLINE);
    this.menuBtn = new MenuButton(this.ui, () => this.toggleMenu());
    this.applySettings(this.settings);

    // CrazyGames' mute setting overrides everything; iOS needs audio resumed inside a gesture.
    this.audio.setMuted(this.platform.settings.muteAudio);
    this.platform.onSettingsChange((s) => this.audio.setMuted(s.muteAudio));
    const unlock = () => this.audio.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { passive: true });

    this.input.onUi(this.onUi);
    this.input.onDeviceChange(() => this.updateTouchVisibility());

    this.profile = await loadProfile(this.platform);
    this.enterPractice();
    this.platform.loadingStop();

    // Invite links and "play with friends" go straight into a joinable room.
    if (ONLINE) {
      const invite = this.platform.inviteParams?.room ?? new URLSearchParams(window.location.search).get('room');
      if (invite) void this.joinRoom(invite);
      else if (this.platform.isInstantMultiplayer) void this.invite(false);
      this.platform.onJoinRoom((params) => {
        if (params.room) void this.joinRoom(params.room);
      });
    }

    requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------- frame loop

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.touch.update(dt);

    if (this.phase === 'vote') this.updateVote(Date.now());
    if (this.searching) this.updateSearchStatus(now);

    if (this.session && !this.paused && (this.phase === 'practice' || this.phase === 'fight' || this.phase === 'results')) {
      for (const e of this.session.advance(dt)) this.onSimEvent(e);
      if (this.phase === 'fight') this.updateIntroBeats();
    }

    this.renderFighters(dt);
    this.updateCamera(dt);
    this.updateHud(dt);
    this.fx.update(dt);
    this.world.render(dt);
  };

  private inputLive = (): boolean =>
    (this.phase === 'practice' || this.phase === 'fight') && !this.paused && !this.menu.open && !this.world.cam.inCinematic;

  private staticState(side: Side): FighterRenderState {
    const s = startPosition(side);
    return {
      x: s.x, y: 0, z: s.z, facing: s.facing, weapon: this.weapons[side], state: 'idle', frame: this.time * 60, move: null,
      moveX: 0, moveY: 0, dodgeX: 0, dodgeZ: 0, rollDir: 0, glowing: false, invulnerable: false, parryWindow: false,
    };
  }

  private renderFighters(dt: number): void {
    const visuals = this.world.visuals;
    if (!visuals) return;
    const useSession = this.session && (this.phase === 'practice' || this.phase === 'fight' || this.phase === 'results');
    const states = [0, 1].map((i) => (useSession ? this.session!.renderState(i as Side) : this.staticState(i as Side))) as [FighterRenderState, FighterRenderState];
    const ov = this.director.override;
    const frozen = !!useSession && this.session!.match.hitstop > 0;
    const winner = this.session?.match.winner ?? -1;
    for (const side of [0, 1] as Side[]) {
      let st = states[side];
      if (ov && ov.side === side) {
        this.arrived[side] = true;
        st = { ...st, x: st.x + ov.dx, y: st.y + ov.dy, z: st.z + ov.dz };
        visuals[side].special = ov.special;
      } else {
        visuals[side].special = this.phase === 'results' && winner === side ? 'victory' : null;
      }
      states[side] = st;
      visuals[side].setVisible(this.arrived[side]);
      visuals[side].update(st, dt, frozen);
    }
    this.rs = states;
  }

  private updateCamera(dt: number): void {
    if (!this.rs) return;
    const me = this.rs[this.you];
    const op = this.rs[this.you === 0 ? 1 : 0];
    this.world.cam.addLook(this.input.takeLook());
    this.world.cam.update(dt, me, op, {
      dodging: me.state === 'dodge',
      knockedDown: me.state === 'knockdown' || me.state === 'ko',
    });
  }

  private updateHud(dt: number): void {
    const m = this.session?.match;
    const live = !!m && !this.world.cam.inCinematic;
    const mode: HudMode = live && this.phase === 'practice' ? 'practice' : live && this.phase === 'fight' ? 'fight' : 'hidden';
    // The first round's intro plays without bars or buttons; the HUD slides in on "Fight".
    const intro = !!m && this.phase === 'fight' && m.round === 1 && m.phase === 'intro';
    this.hud.setMode(mode);
    this.hud.setTopIn(!intro);
    this.menuBtn.setMode(this.menu.open || intro || mode === 'hidden' ? 'hidden' : mode === 'practice' ? 'corner' : 'fight');
    if (!m || mode === 'hidden' || intro) {
      this.hud.placeEnemyBar(null, 0, false);
      this.fx.setLowHp(1);
      return;
    }
    const [a, b] = m.fighters;
    const me = m.fighters[this.you];
    const op = m.fighters[this.you === 0 ? 1 : 0];
    this.hud.update(
      {
        hp: [a.hp, b.hp],
        posture: [a.posture, b.posture],
        broken: [a.state === 'guardbreak', b.state === 'guardbreak'],
        roundsWon: [a.roundsWon, b.roundsWon],
        round: m.round,
        timer: m.practice ? null : m.timer / 60,
        dodgeCharges: me.dodgeCharges,
        critReady: me.critCooldown === 0,
        ping: this.session!.ping,
      },
      dt,
    );
    const ors = this.rs?.[this.you === 0 ? 1 : 0];
    const screen = ors && op.state !== 'ko' ? this.world.project(ors.x, ors.y + 2.25, ors.z) : null;
    this.hud.placeEnemyBar(screen, op.posture, op.state === 'guardbreak', mode === 'practice' ? op.hp : null);
    this.fx.setLowHp(this.phase === 'fight' ? me.hp / MAX_HP : 1);
  }

  // ---------------------------------------------------------------- sim events

  private onSimEvent(e: SimEvent): void {
    if (!this.session) return;
    playEvent(e, {
      world: this.world,
      hud: this.hud,
      fx: this.fx,
      audio: this.audio,
      match: this.session.match,
      you: this.you,
      onTelegraphSeen: () => {
        if (this.profile.seenTelegraphHint) return;
        this.profile.seenTelegraphHint = true;
        saveProfile(this.platform, this.profile);
        this.hud.hint('White glow = unblockable. Parry it or dodge it!', 4);
      },
    });
    switch (e.type) {
      case 'roundIntro':
        this.introBeat = 0;
        this.hud.showBanner(`ROUND ${e.round}`, 1, true);
        this.audio.play('roundStart');
        break;
      case 'fight':
        this.hud.showBanner('FIGHT!', 0.8);
        this.audio.play('fight');
        this.platform.gameplayStart();
        break;
      case 'ko':
        this.hud.showBanner('K.O.', 1.6);
        this.audio.play('ko');
        break;
      case 'roundEnd':
        if (e.reason === 'time') this.hud.showBanner('TIME', 1.4);
        this.audio.music.stinger(e.winner === -1 ? 'gong' : e.winner === this.you ? 'roundWin' : 'roundLose');
        break;
      case 'matchEnd':
        this.audio.music.stinger(e.winner === this.you ? 'victory' : 'defeat');
        if (this.mode === 'local') setTimeout(() => this.showResults(e.winner), 2200);
        break;
      default:
        break;
    }
  }

  /** "3, 2, 1" during the round intro, ticking like the vote countdown. */
  private updateIntroBeats(): void {
    const m = this.session?.match;
    if (!m || m.phase !== 'intro') return;
    const beats: [number, string][] = [
      [60, '3'],
      [90, '2'],
      [120, '1'],
    ];
    while (this.introBeat < beats.length && m.phaseFrame >= beats[this.introBeat]![0]) {
      const [, text] = beats[this.introBeat]!;
      this.hud.showBanner(text, 0.45);
      this.audio.play(text === '1' ? 'tickFinal' : 'tick');
      this.introBeat++;
    }
  }

  // ---------------------------------------------------------------- practice

  private enterPractice(): void {
    this.clearScreens();
    this.disposeSession();
    this.phase = 'practice';
    this.mode = 'local';
    this.paused = false;
    this.you = 0;
    // The training dummy is the Warden: a big, patient target.
    this.weapons = [this.profile.weapon, 'warden'];
    this.players = [playerInfo(this.profile), { name: BOT_NAMES.dummy, avatar: null, title: BOT_TITLES.dummy }];
    this.arrived = [true, true];
    this.world.setMap('moon-shrine');
    this.world.setFighters(this.weapons, 0);
    this.session = new LocalSession({ weapons: this.weapons, practice: true, bot: 'dummy', seed: 7 }, this.input, this.inputLive);
    this.hud.setPlayers(0, this.players);
    this.lobby.setVisible(true);
    this.lobby.setStatus(this.searching ? 'Searching for an opponent...' : PRACTICE_STATUS, this.searching);
    this.world.cam.stopShots();
    this.world.cam.snapNext = true;
    this.audio.music.setState('lobby');
    if (!this.profile.seenControls) this.showControls();
    this.updateTouchVisibility();
    this.platform.gameplayStart();
  }

  private showControls(): void {
    this.controls.show(this.ui, this.input.lastDevice === 'touch' || this.device !== 'desktop', () => {
      this.profile.seenControls = true;
      saveProfile(this.platform, this.profile);
    });
  }

  private clearScreens(): void {
    this.voteScreen.hide();
    this.loading.hide();
    this.nameCard.hide();
    this.results.hide();
    this.menu.hide();
    this.controls.hide();
    this.hud.hideBanner();
    this.hud.clearHint();
    this.fx.clear();
  }

  private disposeSession(): void {
    this.session?.dispose();
    this.session = null;
  }

  // ---------------------------------------------------------------- bot match (local)

  private startBotMatch(): void {
    if (this.searching) this.cancelSearch();
    this.mode = 'local';
    this.you = 0;
    // Bot difficulty follows the player's record so new players aren't crushed.
    const w = this.profile.wins;
    this.botLevel = w < 2 ? 'easy' : w < 8 ? 'normal' : 'hard';
    this.players = [playerInfo(this.profile), { name: BOT_NAMES[this.botLevel], avatar: null, title: BOT_TITLES[this.botLevel] }];
    this.startVote();
  }

  private startVote(): void {
    this.clearScreens();
    this.disposeSession();
    this.phase = 'vote';
    this.platform.gameplayStop();
    this.lobby.setVisible(false);
    this.updateTouchVisibility();
    this.droned = false;
    this.audio.music.setState('lobby');
    if (this.mode === 'local') {
      this.votes = { map: [null, null], weapon: [this.profile.weapon, null] };
      this.voteEndsAt = Date.now() + VOTE_MS;
      this.botVoteAt = Date.now() + this.rng.range(1200, 3200);
    }
    this.voteScreen.show(this.ui, this.voteView(), (v) => this.castVote(v));
    if (this.mode === 'online' && this.profile.weapon) this.net.send({ t: 'vote', weapon: this.profile.weapon });
  }

  private voteView() {
    return {
      you: this.you,
      players: this.players,
      votes: this.votes as { map: (MapId | null)[]; weapon: (WeaponId | null)[] },
      secondsLeft: (this.voteEndsAt - Date.now()) / 1000,
    };
  }

  private castVote(v: { map?: MapId | 'random'; weapon?: WeaponId }): void {
    this.audio.play('select');
    if (v.map) this.votes.map[this.you] = v.map;
    if (v.weapon) {
      this.votes.weapon[this.you] = v.weapon;
      this.profile.weapon = v.weapon;
      saveProfile(this.platform, this.profile);
    }
    if (this.mode === 'online') this.net.send({ t: 'vote', map: v.map, weapon: v.weapon });
    this.voteScreen.update(this.voteView());
  }

  private updateVote(now: number): void {
    if (this.mode === 'local' && this.botVoteAt && now >= this.botVoteAt) {
      this.botVoteAt = 0;
      const mine = this.votes.map[0];
      this.votes.map[1] = mine && this.rng.chance(0.5) ? mine : this.rng.pick([...MAP_IDS, 'random' as const]);
      this.votes.weapon[1] = this.rng.pick(WEAPON_IDS);
      this.audio.play('select', { pan: 0.4 });
    }
    const view = this.voteView();
    if (this.voteScreen.update(view) && view.secondsLeft <= 9.5) this.audio.play(view.secondsLeft <= 3 ? 'tickFinal' : 'tick');
    if (!this.droned && view.secondsLeft <= 1.6) {
      this.droned = true;
      this.audio.music.setState('drone', 0.6);
    }
    if (this.mode === 'local' && now >= this.voteEndsAt) this.resolveLocalVote();
  }

  private resolveLocalVote(): void {
    const voted = this.votes.map.filter((m): m is MapId => !!m && m !== 'random');
    const counts = new Map<MapId, number>();
    for (const m of voted) counts.set(m, (counts.get(m) ?? 0) + 1);
    const best = Math.max(0, ...counts.values());
    const top = [...counts].filter(([, n]) => n === best).map(([m]) => m);
    const map = top.length > 0 ? this.rng.pick(top) : this.rng.pick(MAP_IDS);
    const weapons: [WeaponId, WeaponId] = [this.votes.weapon[0] ?? this.rng.pick(WEAPON_IDS), this.votes.weapon[1] ?? this.rng.pick(WEAPON_IDS)];
    // The bot goes by the fighter it picked.
    this.players[1] = { ...this.players[1], name: `${WEAPONS[weapons[1]].name} (${BOT_LEVEL_LABEL[this.botLevel]})` };
    this.startLoad(map, weapons);
  }

  // ---------------------------------------------------------------- loading and entrances

  private startLoad(map: MapId, weapons: [WeaponId, WeaponId]): void {
    this.clearScreens();
    this.phase = 'load';
    this.audio.play('whoosh');
    // Loading is never silent.
    this.audio.music.setState('ambience', 0.4);
    this.weapons = weapons;
    const mode = this.mode === 'local' ? 'Bot Match' : this.room?.isPrivate ? 'Private Match' : 'Quick Match';
    this.loading.show(this.ui, map, mode, [this.players[0].name, this.players[1].name]);
    this.world.setMap(map);
    this.world.setFighters(weapons, this.you);
    this.arrived = [false, false];
    // Slow establishing drift toward the torii while the world "loads".
    void this.world.cam.playShots([{ duration: 30, from: camPose([-13, 2.4, -7], [0, 2.6, 17], 55), to: camPose([-9, 3.4, 5], [0, 2.6, 17], 55) }]);
    if (this.mode === 'online') {
      this.net.send({ t: 'progress', value: 0.5 });
      requestAnimationFrame(() => this.net.send({ t: 'progress', value: 1 }));
      return;
    }
    // Everything is procedural, so local loading is quick; keep a short beat so the screen reads.
    const start = Date.now();
    const tick = setInterval(() => {
      const k = Math.min(1, (Date.now() - start) / 900);
      this.loading.setProgress([k, Math.min(1, k * 3)]);
      if (k >= 1) {
        clearInterval(tick);
        setTimeout(() => this.phase === 'load' && void this.startEntrance(), 500);
      }
    }, 100);
  }

  private entranceHooks(): EntranceHooks {
    return {
      landed: (side) => {
        const s = startPosition(side);
        this.world.vfx.dustRing(s.x, s.z);
        this.world.cam.shake('small');
        this.audio.play('thump', { pan: this.world.pan(s.x, 0.5, s.z) });
      },
      showCard: (side) => {
        const p = this.players[side];
        const bot = this.mode === 'local' && side !== this.you;
        const rank = bot
          ? { tier: 'Bot', rating: this.botLevel.toUpperCase(), mark: 'B' }
          : side === this.you
            ? { tier: 'Unranked', rating: `${this.profile.wins} Wins`, mark: String(Math.min(9, Math.floor(this.profile.wins / 5) + 1)) }
            : { tier: 'Unranked', rating: p.title, mark: '?' };
        this.nameCard.show(this.ui, p, rank, this.profile.seenEntrance);
      },
      hideCard: () => this.nameCard.hide(),
    };
  }

  private async startEntrance(): Promise<void> {
    if (this.phase === 'entrance' || this.phase === 'fight') return;
    this.phase = 'entrance';
    this.loading.fadeOut();
    this.world.cam.stopShots();
    // The match track starts on the first frame of the entrance.
    this.audio.music.setState('match', 0.3);
    this.entranceSkipped = false;
    this.matchStarted = false;
    const hooks = this.entranceHooks();
    const them: Side = this.you === 0 ? 1 : 0;
    await this.director.playOpponent(them, hooks);
    const rest = this.world.cam.restPose({ ...startPosition(this.you), y: 0 }, { ...startPosition(them), y: 0 });
    if (!this.entranceSkipped) await this.director.playYou(this.you, hooks, rest);
    this.profile.seenEntrance = true;
    saveProfile(this.platform, this.profile);
    if (this.mode === 'local') this.startLocalFight();
    else if (this.serverPhase === 'match') this.startOnlineFight();
  }

  private skipEntrance(): void {
    if (this.phase !== 'entrance' || this.entranceSkipped || !this.profile.seenEntrance) return;
    this.entranceSkipped = true;
    this.arrived = [true, true];
    this.director.skip(this.entranceHooks());
    if (this.mode === 'online') this.net.send({ t: 'skip' });
  }

  private startLocalFight(): void {
    this.disposeSession();
    this.session = new LocalSession(
      { weapons: this.weapons, practice: false, bot: this.botLevel, seed: this.rng.int(1, 1e6) },
      this.input,
      this.inputLive,
    );
    this.beginFight();
  }

  private startOnlineFight(): void {
    if (this.matchStarted) return;
    this.disposeSession();
    this.session = new OnlineSession(this.net, this.you, this.weapons, this.input, this.inputLive);
    this.beginFight();
  }

  private beginFight(): void {
    this.matchStarted = true;
    this.phase = 'fight';
    this.arrived = [true, true];
    this.hud.setPlayers(this.you, this.players);
    this.input.flush();
    this.updateTouchVisibility();
  }

  // ---------------------------------------------------------------- results

  private showResults(winner: Winner): void {
    if (this.phase === 'results') return;
    this.phase = 'results';
    this.platform.gameplayStop();
    this.updateTouchVisibility();
    this.fx.clear();
    const m = this.session?.match;
    const score: [number, number] = m ? [m.fighters[this.you].roundsWon, m.fighters[this.you === 0 ? 1 : 0].roundsWon] : [0, 0];
    const verdict = winner === -1 ? 'draw' : winner === this.you ? 'win' : 'lose';
    const titleBefore = titleFor(this.profile.wins);
    if (verdict === 'win') this.profile.wins++;
    else if (verdict === 'lose') this.profile.losses++;
    saveProfile(this.platform, this.profile);
    if (titleFor(this.profile.wins) !== titleBefore) {
      // A rank-up is the kind of rare moment CrazyGames' celebration is meant for.
      this.platform.happytime();
      toast(this.ui, `New title: ${titleFor(this.profile.wins)}`, 3);
    }
    this.results.show(this.ui, verdict, score, {
      rematch: () => this.rematch(),
      leave: () => this.leaveToPractice(),
    });
    this.results.setStatus(this.mode === 'online' ? 'Rematch keeps you in the same room.' : '');
    this.audio.music.setState('lobby', 2);
    // Natural break for a midgame ad: never mid-fight, and the UI is blocked while it plays.
    setTimeout(() => {
      if (this.phase !== 'results') return;
      this.results.setBlocked(true);
      void this.platform
        .requestMidgameAd(() => this.audio.setMuted(true))
        .then(() => {
          this.audio.setMuted(this.platform.settings.muteAudio);
          this.results.setBlocked(false);
        });
    }, 1200);
  }

  private rematch(): void {
    this.audio.play('confirm');
    if (this.mode === 'local') {
      this.startVote();
    } else {
      this.net.send({ t: 'rematch' });
      this.results.setStatus('Waiting for your opponent...', false);
    }
  }

  private leaveToPractice(): void {
    if (this.mode === 'online') {
      this.net.send({ t: 'leave' });
      this.platform.leftRoom();
      this.room = null;
      this.serverPhase = null;
    }
    this.enterPractice();
  }

  // ---------------------------------------------------------------- online

  private async ensureConnected(): Promise<boolean> {
    if (this.net.connected) return true;
    try {
      this.lobby.setStatus('Connecting...', false);
      await this.net.connect(serverUrl(), playerInfo(this.profile));
      if (!this.listening) {
        this.listening = true;
        this.net.onMessage(this.onServer);
        this.net.onClose(() => this.onDisconnected());
      }
      return true;
    } catch (err) {
      console.warn('[net]', err);
      this.lobby.setStatus('Online play is unavailable right now. Try a bot match!', false);
      return false;
    }
  }

  private async quickMatch(): Promise<void> {
    if (!(await this.ensureConnected())) return;
    this.net.send({ t: 'queue' });
    this.searching = true;
    this.searchStarted = performance.now();
    this.lobby.setStatus('Searching for an opponent...', true);
  }

  private updateSearchStatus(now: number): void {
    if (this.phase !== 'practice') return;
    const s = Math.floor((now - this.searchStarted) / 1000);
    const clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const offer = now - this.searchStarted > SEARCH_BOT_OFFER_MS ? ' · No one yet: try Play vs Bot while you wait' : '';
    this.lobby.setStatus(`Searching for an opponent ${clock}${offer}`, true);
  }

  private cancelSearch(): void {
    this.searching = false;
    this.net.send({ t: 'leave' });
    this.platform.leftRoom();
    this.room = null;
    this.serverPhase = null;
    this.lobby.setStatus(PRACTICE_STATUS, false);
  }

  private async invite(copy = true): Promise<void> {
    if (!(await this.ensureConnected())) return;
    this.pendingCopy = copy;
    this.net.send({ t: 'create' });
  }

  private pendingCopy = false;

  private async joinRoom(code: string): Promise<void> {
    if (!(await this.ensureConnected())) return;
    this.net.send({ t: 'join', code: code.toUpperCase() });
  }

  private onServer = (m: ServerMessage): void => {
    switch (m.t) {
      case 'room':
        this.onRoom(m.room, m.serverTime);
        break;
      case 'left':
        toast(this.ui, 'Your opponent left.');
        break;
      case 'closed':
        if (this.mode === 'online' && this.phase !== 'practice') {
          toast(this.ui, 'The match room closed.');
          this.room = null;
          this.serverPhase = null;
          this.enterPractice();
        }
        break;
      case 'error':
        toast(this.ui, m.message);
        break;
      default:
        break;
    }
  };

  private onDisconnected(): void {
    this.searching = false;
    this.room = null;
    this.serverPhase = null;
    if (this.mode === 'online' && this.phase !== 'practice') {
      toast(this.ui, 'Disconnected from the match server.');
      this.enterPractice();
    } else {
      this.lobby.setStatus('Disconnected. Quick Match will reconnect.', false);
    }
  }

  private onRoom(room: RoomState, serverTime: number): void {
    this.room = room;
    this.mode = 'online';
    this.searching = false;
    this.you = room.you;
    const placeholder = (i: number): PlayerInfo => ({ name: i === room.you ? this.profile.name : 'Waiting...', avatar: null, title: '' });
    this.players = [room.players[0] ?? placeholder(0), room.players[1] ?? placeholder(1)];
    this.net.clockOffset = serverTime - Date.now();
    const seated = room.players.filter(Boolean).length;
    this.platform.updateRoom({
      roomId: room.roomId,
      isJoinable: room.phase === 'waiting' && seated < 2,
      inviteParams: room.isPrivate ? { room: room.code } : undefined,
    });

    const changed = room.phase !== this.serverPhase;
    this.serverPhase = room.phase;
    switch (room.phase) {
      case 'waiting':
        if (changed && this.phase !== 'practice') this.enterPractice();
        this.lobby.setStatus(`Private room ${room.code}: waiting for a friend to join`, true);
        if (this.pendingCopy) {
          this.pendingCopy = false;
          const link = this.platform.inviteLink({ room: room.code });
          if (link) void navigator.clipboard?.writeText(link).then(
            () => toast(this.ui, 'Invite link copied'),
            () => toast(this.ui, `Room code: ${room.code}`),
          );
        }
        break;
      case 'vote':
        this.votes = { map: [...room.votes.map], weapon: [...room.votes.weapon] };
        this.voteEndsAt = this.net.toLocal(room.endsAt);
        if (changed) this.startVote();
        else this.voteScreen.update(this.voteView());
        break;
      case 'load':
        if (changed && room.map) this.startLoad(room.map, [room.weapons[0] ?? 'ronin', room.weapons[1] ?? 'ronin']);
        this.loading.setProgress(room.progress);
        break;
      case 'entrance':
        if (changed) void this.startEntrance();
        break;
      case 'match':
        if (changed && this.phase !== 'entrance') this.startOnlineFight();
        break;
      case 'results':
        if (changed) this.showResults(room.winner);
        else {
          const them = room.you === 0 ? 1 : 0;
          if (room.rematch[them] && !room.rematch[room.you]) this.results.setStatus('Your opponent wants a rematch!');
        }
        break;
    }
  }

  // ---------------------------------------------------------------- menus and settings

  private onUi = (action: UiAction): void => {
    if (action === 'menu') {
      this.toggleMenu();
      return;
    }
    if (action === 'any' && this.phase === 'entrance') this.skipEntrance();
  };

  private toggleMenu(): void {
    if (this.menu.open) {
      this.closeMenu();
      return;
    }
    // A local fight really pauses; an online one keeps running underneath.
    if (this.mode === 'local' && (this.phase === 'practice' || this.phase === 'fight')) this.paused = true;
    this.platform.gameplayStop();
    const inMatch = this.phase !== 'practice';
    this.menu.show(
      this.ui,
      this.settings,
      {
        change: (s) => this.applySettings(s),
        resume: () => this.closeMenu(),
        controls: () => {
          this.closeMenu();
          this.showControls();
        },
        leave: inMatch ? () => this.leaveToPractice() : null,
      },
      this.device !== 'desktop',
    );
    this.updateTouchVisibility();
  }

  private closeMenu(): void {
    this.menu.hide();
    this.paused = false;
    if (this.phase === 'practice' || this.phase === 'fight') this.platform.gameplayStart();
    this.updateTouchVisibility();
  }

  private applySettings(s: Settings): void {
    const qualityChanged = this.settings && s.quality !== this.settings.quality;
    this.settings = s;
    saveSettings(this.platform, s);
    this.audio?.setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
    if (this.world) this.world.cam.shakeScale = s.reduceEffects ? 0.3 : 1;
    if (this.fx) this.fx.intensity = s.reduceEffects ? 0.35 : 1;
    this.touch?.setLefty(s.lefty);
    if (qualityChanged) toast(this.ui, 'Graphics change applies after a reload.');
  }

  private updateTouchVisibility(): void {
    const touchUi = this.device !== 'desktop' || this.input.lastDevice === 'touch';
    this.touch.setVisible(touchUi && (this.phase === 'practice' || this.phase === 'fight') && !this.menu.open);
  }

  /** Small debug surface for automated play-tests. */
  debug() {
    const m = this.session?.match;
    return {
      phase: this.phase,
      mode: this.mode,
      matchPhase: m?.phase,
      fighters: m?.fighters.map((f) => ({ hp: f.hp, posture: f.posture, state: f.state, x: f.x, z: f.z })),
      inCinematic: this.world.cam.inCinematic,
      map: this.world.mapId,
    };
  }

  /** Test hook: jump straight into a bot match vote. */
  debugStartBotMatch(): void {
    this.startBotMatch();
  }

  /** Test hook: entrance duration is tied to the server's per-fighter entrance time. */
  static readonly ENTRANCE_SECONDS = (ENTRANCE_MS * 2) / 1000;
}
