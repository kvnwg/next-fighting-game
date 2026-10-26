/** DOM user interface: HUD, menus, overlays. Pure presentation; App drives it. */
import { CHARACTERS, CHARACTER_IDS, CharacterDef, CharacterId, Perilous } from '../shared/characters';
import { ARENA_MAPS, MAPS } from '../shared/maps';
import { BotDifficulty, LeaderboardEntry, MatchMode, ProfileView, RosterEntry, ServerMsg } from '../shared/protocol';
import { PLACEMENT_MATCHES, RankInfo, TIERS, rankOf } from '../shared/ranks';
import { CANCELS, CANCEL_NAMES, CancelInto, CancelWindow, MoveClass } from '../shared/cancels';
import { LobbyBar } from './lobbybar';
import { ICON, IconName, icon, pixelSVG, recolor, slashRows } from './pixelicons';
import { TRACKS } from './audio/music';
import { settings } from './settings';
import { LORE, readingMinutes } from './lore';
import { FREE_PICK_GAMES, MAP_PRICE, AD_REWARD, MATCH_AD_REWARD, charPrice, freePickReady, gamesToFreePick, isPremium, reachedGold } from '../shared/progress';
import { THUMBS } from './select';
import { matchAdExpected } from './adbreak';

const h = (html: string): HTMLElement => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A button label with its kanji tag (or a pixel icon) in front. */
const jpLabel = (kanji: string, text: string, ico?: IconName) => `${ico ? icon(ico) : `<span class="bk">${kanji}</span>`}${text}`;

/** A heading with its icon in front. */
const iconHead = (ico: IconName, text: string) => `<h4 class="ih">${icon(ico)}<span>${text}</span></h4>`;

// medals for the top three of the ladder: gold, silver, bronze
const MEDALS = [pixelSVG(ICON.medal, { cls: 'medal' }), pixelSVG(recolor(ICON.medal, 'g', 's'), { cls: 'medal' }), pixelSVG(recolor(ICON.medal, 'g', 'n'), { cls: 'medal' })];

const TOAST_ICON: Record<'info' | 'warn' | 'good', IconName> = { info: 'info', warn: 'peril', good: 'check' };

/** The pixel shield of the posture bar, whole and cracked (the bar's state picks one). */
const POSTURE_SHIELD = `<span class="pm-shield">${icon('shield', 'pm-whole')}${icon('shieldCracked', 'pm-cracked')}</span>`;

export function rankBadge(r: RankInfo, small = false): string {
  const label = r.placed ? r.label : small ? 'Unranked' : r.label;
  return `<span class="rank-badge ${small ? 'small' : ''}" style="--rank:${r.color}"><i></i>${esc(label)}</span>`;
}

const PERILOUS_TIP: Record<Perilous, string> = {
  thrust: 'Perilous THRUST — deflect it, or dodge into it for a Mikiri Counter',
  sweep: 'Perilous SWEEP — jump over it',
  grab: 'Perilous GRAB — dodge or jump away',
  area: 'Perilous AREA — get off the marked ground, or dodge through it as it lands',
};

export interface UIHandlers {
  onEnter(name: string): void;
  onRanked(): void;
  onPractice(diff: BotDifficulty): void;
  onCancelQueue(): void;
  onSelectChar(id: CharacterId): void;
  /** a fighter brought up on the roster (not yet chosen) */
  onRosterPick(id: CharacterId): void;
  onLeaderboard(): void;
  onChat(text: string): void;
  onChallengeReply(from: string, accept: boolean): void;
  onForfeit(): void;
  onSettingsChanged(): void;
  onModalChange(open: boolean): void;
  /** the on-screen prompt was tapped (touch: challenge the player in front of you) */
  onPrompt(): void;
  createPreview(container: HTMLElement): Preview;
  /** data URL of a character's portrait (rendered in-engine) */
  portrait(id: CharacterId): string;
  /** buy a fighter or an arena with coins, or (free) take the free fighter */
  onUnlock(kind: 'char' | 'map', id: string, free?: boolean): void;
  /** watch an ad from the shop for coins; true if earned */
  onWatchAd(kind: 'bonus'): Promise<boolean>;
  /** play the tutorial (again) */
  onTutorial(): void;
}

export type ModalKind = 'chars' | 'ladder' | 'help' | 'shop';

/** Coins as written: 1,250. */
const coinText = (n: number): string => Math.max(0, Math.floor(n)).toLocaleString('en-US');

export interface CardData {
  name: string;
  title: string;
  char: CharacterDef;
  hp: number;
  /** 0..1 special meter: full = the special attack is ready */
  special: number;
  broken: boolean;
  /** 0..1 posture: full means the guard breaks */
  posture: number;
  /** rounds won (null outside matches) */
  pips: number | null;
  pipMax: number;
  meta: string;
  metaTone?: 'good' | 'ok' | 'bad';
}

export interface Preview {
  el: HTMLElement;
  setChar(id: CharacterId): void;
  dispose(): void;
}

interface Floater {
  el: HTMLElement;
  x: number;
  y: number;
  z: number;
  life: number;
  max: number;
}

/** The cancel table (shared/cancels.ts) as the help screen shows it. */
/** Every song's credit, as its licence asks. */
function musicCredits(): string {
  return [...TRACKS.lobby, ...TRACKS.select, ...TRACKS.combat]
    .map((t) => `<li>"${t.title}" by ${t.artist} · <a href="${t.link}" target="_blank" rel="noopener">${t.licence}</a> · via BreakingCopyright</li>`)
    .join('');
}

function cancelTable(): string {
  const cols: [CancelInto, string][] = [['light', 'Light'], ['heavy', 'Heavy'], ['special', 'Special'], ['dodge', 'Dodge'], ['guard', 'Guard'], ['jump', 'Jump']];
  const cell = (w: CancelWindow | undefined) => (!w ? '<td class="muted">—</td>' : `<td>${w.onContact ? 'on hit' : (w.from ?? 0) > 0.05 ? 'late' : '✓'}</td>`);
  const rows = (Object.keys(CANCELS) as MoveClass[]).map((k) => `<tr><td>${CANCEL_NAMES[k]}</td>${cols.map(([c]) => cell(CANCELS[k][c])).join('')}</tr>`).join('');
  return `<table class="keys cancels"><tr><td></td>${cols.map(([, n]) => `<td>${n}</td>`).join('')}</tr>${rows}</table>`;
}

export class UI {
  readonly root: HTMLElement;
  readonly hud: HTMLElement;
  private modal: HTMLElement;
  private chatLog: HTMLElement;
  private chatInput: HTMLInputElement;
  private plates = new Map<string, HTMLElement>();
  private ringLabels = new Map<number, HTMLElement>();
  private plateLayer: HTMLElement;
  private floatLayer: HTMLElement;
  private floaters: Floater[] = [];
  private bannerTimer = 0;
  private lobbyBar!: LobbyBar;
  private toastBox: HTMLElement;
  private feed: HTMLElement;
  private preview: Preview | null = null;
  private challengeFrom: string | null = null;
  modalOpen: string | null = null;
  /** a fighter's legend open over the fighter select (see openLegend) */
  private legend: HTMLElement | null = null;
  /** repaints the open fighter select's locks and buttons (what you own changed) */
  private charsRefresh: (() => void) | null = null;
  /** in a match you fight with who you brought: the fighter picker stays shut */
  private charsLocked = false;
  profile: ProfileView | null = null;
  chatOpen = false;
  private els: Record<string, HTMLElement> = {};

  constructor(
    parent: HTMLElement,
    private readonly handlers: UIHandlers,
    private readonly offline = false,
    readonly touch = false,
  ) {
    this.root = h(`<div id="ui" class="${touch ? 'touch' : ''}"></div>`);
    parent.appendChild(this.root);

    this.hud = h(`
      <div class="hud hidden">
        <div class="plates"></div>
        <div class="floaters"></div>
        <div class="lock-reticle hidden"></div>
        <div class="fcard self">
          <div class="fc-port"><img class="fc-portrait" alt="" /></div>
          <div class="fc-main">
            <div class="fc-top"><span class="fc-n"></span><span class="fc-title"></span><span class="fc-ping"></span></div>
            <div class="fc-hprow">${icon('heart', 'fc-heart')}<div class="fc-hp"><div class="fc-track"><i class="fc-trail"></i><i class="fc-fill"></i></div></div></div>
            <div class="fc-po"><div class="fc-track"><i class="fc-pofill"></i></div><b class="fc-brk">BROKEN</b></div>
            <div class="fc-bot"><span class="fc-handle"></span><span class="fc-spwrap">${icon('flame', 'fc-spico')}<span class="fc-sp" title="Perilous art"><i class="fc-spfill"></i></span></span><span class="fc-pips"></span></div>
          </div>
        </div>
        <div class="fcard opp hidden">
          <div class="fc-port"><img class="fc-portrait" alt="" /></div>
          <div class="fc-main">
            <div class="fc-top"><span class="fc-n"></span><span class="fc-title"></span><span class="fc-ping"></span></div>
            <div class="fc-hprow">${icon('heart', 'fc-heart')}<div class="fc-hp"><div class="fc-track"><i class="fc-trail"></i><i class="fc-fill"></i></div></div></div>
            <div class="fc-po"><div class="fc-track"><i class="fc-pofill"></i></div><b class="fc-brk">BROKEN</b></div>
            <div class="fc-bot"><span class="fc-handle"></span><span class="fc-spwrap">${icon('flame', 'fc-spico')}<span class="fc-sp" title="Perilous art"><i class="fc-spfill"></i></span></span><span class="fc-pips"></span></div>
          </div>
        </div>
        <div class="top-center">
          <div class="match-round hidden"></div>
          <div class="match-timer hidden">${icon('hourglass', 'mt-ico')}<span class="mt-t">0:00</span></div>
          <div class="zone-indicator hidden">${icon('torii')}<span class="jp">安全地帯</span>Safe zone · PvP disabled</div>
          <div class="net-info"><span id="online"></span><span id="fps"></span></div>
        </div>
        <div class="side-menu">
          <button class="btn ranked" id="btn-ranked">${jpLabel('段位戦', 'Ranked')}<span class="key"> [K]</span></button>
          <div class="practice-group">
            <button class="btn" id="btn-practice">${jpLabel('稽古', 'Practice')}<span class="key"> [P]</span></button>
            <select id="practice-diff" aria-label="Bot difficulty"><option value="easy">Easy</option><option value="normal" selected>Normal</option><option value="hard">Hard</option></select>
          </div>
          <button class="btn small" id="btn-chars">${jpLabel('武者', 'Characters')}<span class="key"> [C]</span></button>
          <button class="btn small" id="btn-ladder">${jpLabel('番付', 'Ladder')}<span class="key"> [L]</span></button>
          <button class="btn small" id="btn-help">${jpLabel('心得', 'Help')}<span class="key"> [H]</span></button>
          <button class="btn small danger hidden" id="btn-forfeit">${jpLabel('降参', 'Forfeit', 'broken')}</button>
          <div class="queue-panel hidden">
            <div class="queue-jp">対戦相手探索中</div>
            <div class="queue-title">${icon('hourglass')}${offline ? 'Finding an opponent near your rating…' : 'Searching for a ranked duel…'}</div>
            <div class="queue-time">0:00</div>
            <div class="queue-count"></div>
            <button class="btn small" id="btn-cancel">${jpLabel('取消', 'Cancel', 'close')}</button>
          </div>
          <div class="esc-hint hidden">Esc to free the cursor</div>
        </div>
        <button class="purse" title="Coins · open the shop">${icon('coin', 'purse-ico')}<b class="purse-n">0</b><span class="purse-plus">+</span></button>
        <div class="feed"></div>
        <div class="center">
          <div class="banner hidden"></div>
          <div class="subbanner hidden"></div>
        </div>
        <div class="toasts"></div>
        <div class="prompt hidden"></div>
        <div class="challenge-popup hidden"></div>
        <div class="death-overlay hidden"><div class="death-kanji">死</div><div class="death-title">Slain</div><div class="death-sub"></div></div>
        <div class="chat">
          <div class="chat-log"></div>
          <div class="chat-row">${icon('chat', 'chat-ico')}<input class="chat-input hidden" maxlength="140" placeholder="Say something… (Enter to send, Esc to cancel)" /></div>
        </div>
        <div class="posture-main">
          <div class="pm-bar left"><div class="pm-fill"></div></div>
          ${POSTURE_SHIELD}
          <div class="pm-bar right"><div class="pm-fill"></div></div>
        </div>
        <div class="posture-main foe hidden">
          <div class="pm-bar left"><div class="pm-fill"></div></div>
          ${POSTURE_SHIELD}
          <div class="pm-bar right"><div class="pm-fill"></div></div>
        </div>
        <div class="hints left">
          <div class="hint" id="h-dodge"><kbd>Shift</kbd>${icon('dash')}<span class="h-label">Dodge</span><span class="h-cd"></span></div>
          <div class="hint" id="h-jump"><kbd>Space</kbd>${icon('jump')}<span class="h-label">Jump</span></div>
          <div class="hint" id="h-special"><kbd>E</kbd>${icon('peril')}<span class="h-label"></span><span class="h-cd"></span></div>
          <div class="hint" id="h-ability"><kbd>R</kbd>${icon('bolt')}<span class="h-label"></span><span class="h-cd"></span></div>
        </div>
        <div class="hints right">
          <div class="hint"><span class="h-label">Parry / (Hold) Block</span>${icon('shield')}<kbd>M2</kbd></div>
          <div class="hint"><span class="h-label">Light / Heavy</span>${icon('sword')}<kbd>M1</kbd><kbd>F</kbd></div>
          <div class="hint"><span class="h-label">Lock on</span>${icon('target')}<kbd>Tab</kbd></div>
        </div>
        <div class="click-hint hidden">Click the game to capture the mouse</div>
      </div>`);
    this.root.appendChild(this.hud);
    this.lobbyBar = new LobbyBar(this.hud, {
      onPractice: (d) => this.handlers.onPractice(d),
      onRanked: () => this.handlers.onRanked(),
      onCancelQueue: () => this.handlers.onCancelQueue(),
      onFighters: () => this.toggleModal('chars'),
      onShop: () => this.toggleModal('shop'),
      onLadder: () => this.toggleModal('ladder'),
      onHelp: () => this.toggleModal('help'),
      onSettings: () => {
        this.openModal('help');
        this.modal.querySelector('.settings')?.scrollIntoView({ block: 'center' });
      },
      portrait: (id) => this.handlers.portrait(id),
    });
    this.lobbyBar.setChar(settings.char);
    this.modal = h(`<div class="modal hidden"></div>`);
    this.root.appendChild(this.modal);

    const q = <T extends HTMLElement>(sel: string) => this.hud.querySelector<T>(sel)!;
    this.plateLayer = q('.plates');
    this.floatLayer = q('.floaters');
    this.toastBox = q('.toasts');
    this.feed = q('.feed');
    this.chatLog = q('.chat-log');
    this.chatInput = q<HTMLInputElement>('.chat-input');
    for (const [k, sel] of Object.entries({
      online: '#online',
      fps: '#fps',
      zone: '.zone-indicator',
      timer: '.match-timer',
      timerText: '.mt-t',
      round: '.match-round',
      selfCard: '.fcard.self',
      oppCard: '.fcard.opp',
      postureMain: '.posture-main:not(.foe)',
      foePosture: '.posture-main.foe',
      hDodge: '#h-dodge',
      hSpecial: '#h-special',
      hAbility: '#h-ability',
      queue: '.queue-panel',
      queueTime: '.queue-time',
      queueCount: '.queue-count',
      banner: '.banner',
      subbanner: '.subbanner',
      prompt: '.prompt',
      challenge: '.challenge-popup',
      death: '.death-overlay',
      deathSub: '.death-sub',
      reticle: '.lock-reticle',
      clickHint: '.click-hint',
      escHint: '.esc-hint',
      menuButtons: '.side-menu',
      btnRanked: '#btn-ranked',
      btnPractice: '#btn-practice',
      btnForfeit: '#btn-forfeit',
      purse: '.purse',
      purseN: '.purse-n',
    })) {
      this.els[k] = q(sel);
    }

    q('#btn-ranked').addEventListener('click', () => this.handlers.onRanked());
    q('#btn-practice').addEventListener('click', () => this.handlers.onPractice(q<HTMLSelectElement>('#practice-diff').value as BotDifficulty));
    q('#btn-cancel').addEventListener('click', () => this.handlers.onCancelQueue());
    q('#btn-chars').addEventListener('click', () => this.toggleModal('chars'));
    q('#btn-ladder').addEventListener('click', () => this.toggleModal('ladder'));
    q('#btn-help').addEventListener('click', () => this.toggleModal('help'));
    q('.purse').addEventListener('click', () => this.toggleModal('shop'));
    q('.prompt').addEventListener('click', () => this.handlers.onPrompt());
    // touch: the menu is a dropdown under the menu button; picking anything closes it
    this.els.menuButtons.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.btn:not(#btn-forfeit)')) this.setTouchMenu(false);
    });
    // two-step confirm (native confirm() dialogs are blocked in some embeds)
    const forfeit = q<HTMLButtonElement>('#btn-forfeit');
    let armedUntil = 0;
    forfeit.addEventListener('click', () => {
      if (performance.now() < armedUntil) {
        armedUntil = 0;
        forfeit.innerHTML = jpLabel('降参', 'Forfeit', 'broken');
        this.handlers.onForfeit();
        return;
      }
      armedUntil = performance.now() + 3000;
      forfeit.innerHTML = jpLabel('降参', this.touch ? 'Tap again to forfeit' : 'Click again to forfeit', 'broken');
      setTimeout(() => {
        if (performance.now() >= armedUntil) forfeit.innerHTML = jpLabel('降参', 'Forfeit', 'broken');
      }, 3100);
    });
    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = this.chatInput.value.trim();
        if (text) this.handlers.onChat(text);
        this.closeChat();
      } else if (e.key === 'Escape') this.closeChat();
    });
    // clicking or tapping away closes the chat (touch keyboards have no Escape, and a chat left
    // open would keep the game's keys switched off)
    this.chatInput.addEventListener('blur', () => {
      if (this.chatOpen) this.closeChat();
    });
    // keep the buttons from stealing keyboard focus (space/enter would click them)
    this.hud.querySelectorAll('button, select').forEach((b) => b.addEventListener('mouseup', () => (b as HTMLElement).blur()));
  }

  // ------------------------------------------------------------------ title & game

  showGame(): void {
    this.hud.classList.remove('hidden');
  }

  /** Back to the title screen (App puts it up): the HUD goes. */
  showTitle(): void {
    this.hud.classList.add('hidden');
  }

  // ------------------------------------------------------------------ profile & lobby chrome

  setProfile(p: ProfileView): void {
    this.profile = p;
    this.setText(this.els.purseN, coinText(p.coins));
    this.lobbyBar.setFreePick(Math.min(p.games, FREE_PICK_GAMES), FREE_PICK_GAMES, freePickReady(p), p.freePicked);
    // what's owned or affordable may have changed under an open menu
    if (this.modalOpen === 'chars') this.charsRefresh?.();
    else if (this.modalOpen === 'shop') this.renderShop();
  }

  /** Coins just came in: the purse jumps and the amount floats up off it. */
  coinsGained(n: number): void {
    const purse = this.els.purse;
    purse.classList.remove('bump');
    void purse.offsetWidth;
    purse.classList.add('bump');
    const pop = h(`<div class="coin-pop">${icon('coin')}+${coinText(n)}</div>`);
    purse.appendChild(pop);
    setTimeout(() => pop.remove(), 1400);
  }

  /** Small, dim connection line: players online, round-trip time, fps. */
  setNetInfo(online: number, rtt: number | null, fps: number | null, lobby: { n: number; count: number; cap: number } | null = null): void {
    const parts = [this.offline ? 'Single player' : `${online} online`];
    // which lobby you're in, once there's more than one
    if (lobby && !this.offline && online > lobby.count) parts.unshift(`Grounds ${lobby.n} · ${lobby.count}/${lobby.cap}`);
    if (rtt !== null) parts.push(`${rtt}ms`);
    this.setText(this.els.online, parts.join(' · '));
    this.setText(this.els.fps, fps !== null ? ` · ${fps} fps` : '');
  }

  private setText(el: HTMLElement, text: string): void {
    if (el.textContent !== text) el.textContent = text;
  }

  setLobbyMode(inLobby: boolean): void {
    this.els.menuButtons.classList.toggle('in-match', !inLobby);
    this.hud.classList.toggle('lobby', inLobby);
    this.lobbyBar.setVisible(inLobby);
    this.lobbyBar.setChar(settings.char);
    for (const id of ['btnRanked', 'btnPractice']) (this.els[id] as HTMLButtonElement).disabled = !inLobby;
    this.els.btnForfeit.classList.toggle('hidden', inLobby);
    if (!inLobby) this.els.queue.classList.add('hidden');
  }

  /** Whether giving up is on the table (not once the match is decided, nor while you finish them). */
  setForfeitable(on: boolean): void {
    this.els.btnForfeit.classList.toggle('gone', !on);
  }

  setQueue(searching: boolean, since: number, count: number, serverNow: number): void {
    this.els.queue.classList.toggle('hidden', !searching);
    (this.els.btnRanked as HTMLButtonElement).disabled = searching;
    const s = Math.max(0, Math.floor((serverNow - since) / 1000));
    this.lobbyBar.setQueue(searching, s);
    if (!searching) return;
    this.els.queueTime.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.els.queueCount.textContent = count > 1 ? `${count} players searching` : 'Waiting for another player…';
  }

  setZone(inSafe: boolean | null): void {
    this.els.zone.classList.toggle('hidden', !inSafe);
  }

  setClickHint(show: boolean, locked: boolean, fallback = false): void {
    // without pointer lock the cursor stays free: mouse movement over the game still looks around
    this.els.clickHint.classList.toggle('hidden', !show || fallback);
    this.els.escHint.classList.toggle('hidden', !locked);
  }

  /** The lobby bar shows your current fighter. */
  setLobbyChar(id: CharacterId): void {
    this.lobbyBar.setChar(id);
  }

  /** Open or close the play panel (M); true if it's now open. */
  togglePlayPanel(): boolean {
    this.lobbyBar.setPanel(!this.lobbyBar.isOpen);
    return this.lobbyBar.isOpen;
  }

  /** Close the play panel if it's open (Escape); true if it was. */
  closePlayPanel(): boolean {
    if (!this.lobbyBar.isOpen) return false;
    this.lobbyBar.setPanel(false);
    return true;
  }

  practiceDifficulty(): BotDifficulty {
    return this.lobbyBar.difficulty;
  }

  // ------------------------------------------------------------------ combat HUD

  /** Fighter cards: you on the left, your opponent / lock-on target mirrored on the right. */
  setCard(which: 'self' | 'opp', d: CardData | null): void {
    const el = which === 'self' ? this.els.selfCard : this.els.oppCard;
    el.classList.toggle('hidden', !d);
    if (!d) return;
    const q = (sel: string) => el.querySelector<HTMLElement>(sel)!;
    if (el.dataset.char !== d.char.id) {
      el.dataset.char = d.char.id;
      (q('.fc-portrait') as HTMLImageElement).src = this.handlers.portrait(d.char.id);
      el.style.setProperty('--accent', d.char.palette.accent);
    }
    this.setText(q('.fc-title'), d.title);
    this.setText(q('.fc-n'), d.name);
    this.setText(q('.fc-handle'), d.char.name);
    const frac = Math.max(0, Math.min(1, d.hp / d.char.stats.hp));
    const hp = `${frac * 100}%`;
    const fill = q('.fc-hp .fc-fill');
    if (fill.style.width !== hp) {
      // a hit: flash the bar, and let the red trail catch up after a beat
      if (parseFloat(fill.style.width || '100') > frac * 100 + 0.01) {
        el.classList.remove('hit');
        void el.offsetWidth;
        el.classList.add('hit');
      }
      fill.style.width = hp;
      q('.fc-trail').style.width = hp;
    }
    el.classList.toggle('low', frac < 0.3 && frac > 0);
    this.setBar(q('.fc-pofill'), d.posture);
    const sp = q('.fc-sp');
    (sp.firstElementChild as HTMLElement).style.width = `${Math.max(0, Math.min(1, d.special)) * 100}%`;
    sp.classList.toggle('ready', d.special >= 1);
    el.classList.toggle('broken', d.broken);
    const pips = d.pips === null ? '' : Array.from({ length: d.pipMax }, (_, i) => `<i class="${i < d.pips! ? 'won' : ''}"></i>`).join('');
    const pipEl = q('.fc-pips');
    if (pipEl.dataset.v !== pips) {
      pipEl.dataset.v = pips;
      pipEl.innerHTML = pips;
    }
    const ping = q('.fc-ping');
    this.setText(ping, d.meta);
    ping.dataset.q = d.metaTone ?? '';
  }

  private setBar(fill: HTMLElement, frac: number): void {
    const f = Math.max(0, Math.min(1, frac));
    fill.style.width = `${f * 100}%`;
    fill.dataset.level = f > 0.8 ? 'high' : f > 0.5 ? 'mid' : 'low';
  }

  /**
   * Your posture bar, bottom centre: white is the guard you have left, draining from both ends toward
   * the shield as posture builds (the shield cracks as it gets low). A broken guard has no bar; it
   * fades back in whole when the stagger ends.
   */
  setPostureMain(frac: number, broken: boolean): void {
    this.postureBar(this.els.postureMain, frac, broken);
  }

  /**
   * The execution mark on a posture-broken opponent (null hides it): two katana cuts slash across
   * it one after the other, lock-on brackets snap in round them and 斬 (slay) drops in under it,
   * then it throbs, a hard-edged diamond pulsing out from it, until they recover or are cut down.
   * Showing it again (it is display: none when hidden) plays the cuts again.
   */
  setBrokenMark(at: { x: number; y: number } | null): void {
    let el = this.hud.querySelector<HTMLElement>('.broken-mark');
    if (!el) {
      el = document.createElement('div');
      el.className = 'broken-mark hidden';
      el.innerHTML =
        '<span class="bm-wave"></span><span class="bm-wave late"></span>' +
        '<span class="bm-lock"><i></i><i></i><i></i><i></i></span>' +
        `<span class="bm-x">${pixelSVG(slashRows(21), { cls: 'bm-cut a' })}${pixelSVG(slashRows(21, true), { cls: 'bm-cut b' })}</span>` +
        '<b class="bm-tag jp">斬</b>';
      this.hud.querySelector('.plates')!.after(el);
    }
    el.classList.toggle('hidden', !at);
    if (at) el.style.transform = `translate(${at.x}px, ${at.y}px)`;
  }

  setFoePosture(at: { x: number; y: number } | null, frac = 0, broken = false): void {
    const el = this.els.foePosture;
    el.classList.toggle('hidden', !at);
    if (!at) return;
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
    this.postureBar(el, frac, broken);
  }

  private postureBar(el: HTMLElement, frac: number, broken: boolean): void {
    const f = Math.max(0, Math.min(1, frac));
    const left = `${(1 - f) * 100}%`;
    for (const fill of el.querySelectorAll<HTMLElement>('.pm-fill')) if (fill.style.width !== left) fill.style.width = left;
    el.classList.toggle('broken', broken);
    el.classList.toggle('cracked', f > 0.6);
    el.classList.toggle('calm', f < 0.01 && !broken);
    el.dataset.level = f > 0.8 ? 'high' : f > 0.5 ? 'mid' : 'low';
  }

  setHints(char: CharacterDef, now: number, readyAt: { dodge: number[]; special: number; ability: number }): void {
    const cd = (el: HTMLElement, readyTime: number, label: string, title: string) => {
      const left = Math.max(0, readyTime - now);
      this.setText(el.querySelector<HTMLElement>('.h-label')!, label);
      this.setText(el.querySelector<HTMLElement>('.h-cd')!, left > 0 ? `${(left / 1000).toFixed(1)}s` : '');
      el.classList.toggle('cooling', left > 0);
      el.title = title;
    };
    const charges = readyAt.dodge;
    const ready = charges.filter((t) => t <= now).length;
    cd(this.els.hDodge, ready > 0 ? 0 : Math.min(...charges), charges.length > 1 ? `Dodge ${ready}/${charges.length}` : 'Dodge', 'Dodge (i-frames). Dodge INTO a perilous thrust for a Mikiri Counter.');
    cd(this.els.hSpecial, readyAt.special, char.special.name, `${char.special.name}: ${PERILOUS_TIP[char.special.perilous!]}`);
    cd(this.els.hAbility, readyAt.ability, char.ability.name, `${char.ability.name}: ${char.ability.description}`);
  }

  setMatch(m: Extract<ServerMsg, { t: 'match' }> | null, serverNow: number): void {
    // a lesson has no rounds and no clock
    const shown = !!m && m.mode !== 'tutorial';
    this.els.timer.classList.toggle('hidden', !shown);
    this.els.round.classList.toggle('hidden', !shown);
    if (!m || !shown) return;
    let secs = 0;
    if (m.phase === 'fight') secs = Math.max(0, Math.ceil((m.endsAt - serverNow) / 1000));
    this.setText(this.els.round, `Round ${m.round}`);
    this.setText(this.els.timerText, m.phase === 'fight' ? (secs >= 100 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : String(secs)) : '—');
    this.els.timer.classList.toggle('urgent', m.phase === 'fight' && secs <= 10);
  }

  setDeath(text: string | null): void {
    this.els.death.classList.toggle('hidden', text === null);
    if (text !== null) this.els.deathSub.textContent = text;
  }

  /** Touch: open or close the menu dropdown (toggles when no value is given). */
  setTouchMenu(open?: boolean): void {
    const menu = this.els.menuButtons;
    menu.classList.toggle('open', open ?? !menu.classList.contains('open'));
  }

  setPrompt(text: string | null): void {
    this.els.prompt.classList.toggle('hidden', !text);
    if (text) this.els.prompt.innerHTML = text;
  }

  setReticle(x: number | null, y = 0): void {
    this.els.reticle.classList.toggle('hidden', x === null);
    if (x !== null) this.els.reticle.style.transform = `translate(${x}px, ${y}px)`;
  }

  /** Big centre-screen callout: brushed kanji over the English text. */
  banner(text: string, sub = '', ms = 1600, cls = '', kanji = ''): void {
    const b = this.els.banner;
    const s = this.els.subbanner;
    b.className = `banner ${cls}${kanji ? '' : ' en-only'}`;
    b.innerHTML = kanji ? `<span class="b-jp">${kanji}</span><span class="b-en">${esc(text)}</span>` : `<span class="b-en">${esc(text)}</span>`;
    s.textContent = sub;
    s.classList.toggle('hidden', !sub);
    // restart the pop animation
    void b.offsetWidth;
    b.classList.add('pop');
    clearTimeout(this.bannerTimer);
    if (ms > 0) {
      this.bannerTimer = window.setTimeout(() => {
        b.classList.add('hidden');
        s.classList.add('hidden');
      }, ms);
    }
  }

  hideBanner(): void {
    this.els.banner.classList.add('hidden');
    this.els.subbanner.classList.add('hidden');
  }

  toast(text: string, kind: 'info' | 'warn' | 'good' = 'info'): void {
    const el = h(`<div class="toast ${kind}">${icon(TOAST_ICON[kind])}<span>${esc(text)}</span></div>`);
    this.toastBox.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }

  killFeed(killer: string, victim: string, how: string): void {
    const el = h(`<div class="feed-row">${killer ? `<b>${esc(killer)}</b> ` : ''}${icon('sword')}<span class="muted">${esc(how)}</span> <b>${esc(victim)}</b></div>`);
    this.feed.prepend(el);
    while (this.feed.children.length > 5) this.feed.lastElementChild!.remove();
    setTimeout(() => el.remove(), 7000);
  }

  // ------------------------------------------------------------------ nameplates & floating text

  /** Overhead nameplate: name, health and (once it starts building) posture, Sekiro-style. */
  plate(id: string, show: boolean, x = 0, y = 0, name = '', hpFrac = 1, color = '#fff', sub = '', postureFrac = 0): void {
    let el = this.plates.get(id);
    if (!show) {
      if (el) el.style.display = 'none';
      return;
    }
    if (!el) {
      el = h(`<div class="plate"><div class="plate-name"></div><div class="plate-hp"><div></div></div><div class="plate-po"><div></div></div></div>`);
      this.plateLayer.appendChild(el);
      this.plates.set(id, el);
    }
    el.style.display = '';
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    const n = el.firstElementChild as HTMLElement;
    const label = sub ? `${esc(name)} <span class="plate-sub">${esc(sub)}</span>` : esc(name);
    if (n.dataset.label !== label) {
      n.innerHTML = label;
      n.dataset.label = label;
    }
    n.style.color = color;
    (el.querySelector('.plate-hp div') as HTMLElement).style.width = `${Math.max(0, hpFrac) * 100}%`;
    const po = el.querySelector('.plate-po') as HTMLElement;
    po.classList.toggle('empty', postureFrac < 0.02);
    this.setBar(po.firstElementChild as HTMLElement, postureFrac);
  }

  /** A label over a dueling ring (who's fighting, the clock, the result); null hides it. */
  ringLabel(i: number, at: { x: number; y: number } | null, html = ''): void {
    let el = this.ringLabels.get(i);
    if (!at) {
      if (el) el.style.display = 'none';
      return;
    }
    if (!el) {
      el = h(`<div class="ring-label"></div>`);
      this.plateLayer.appendChild(el);
      this.ringLabels.set(i, el);
    }
    el.style.display = '';
    el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
    if (el.dataset.html !== html) {
      el.innerHTML = html;
      el.dataset.html = html;
    }
  }

  removePlate(id: string): void {
    this.plates.get(id)?.remove();
    this.plates.delete(id);
  }

  clearPlates(): void {
    for (const el of this.plates.values()) el.remove();
    this.plates.clear();
  }

  floatText(text: string, x: number, y: number, z: number, cls: string, kanji = ''): void {
    const el = h(`<div class="floater ${cls}">${kanji ? `<span class="f-jp">${kanji}</span>` : ''}${esc(text)}</div>`);
    this.floatLayer.appendChild(el);
    this.floaters.push({ el, x, y, z, life: 1.0, max: 1.0 });
    if (this.floaters.length > 30) {
      const f = this.floaters.shift()!;
      f.el.remove();
    }
  }

  updateFloaters(dt: number, project: (x: number, y: number, z: number) => { x: number; y: number } | null): void {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y += dt * 0.9;
      const p = project(f.x, f.y, f.z);
      if (f.life <= 0 || !p) {
        if (f.life <= 0) {
          f.el.remove();
          this.floaters.splice(i, 1);
        } else f.el.style.display = 'none';
        continue;
      }
      f.el.style.display = '';
      f.el.style.opacity = String(Math.min(1, f.life * 2.5));
      f.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -50%)`;
    }
  }

  // ------------------------------------------------------------------ chat

  chat(name: string, text: string, sys = false): void {
    const el = h(`<div class="chat-line ${sys ? 'sys' : ''}">${sys ? '' : `<b>${esc(name)}:</b> `}${esc(text)}</div>`);
    this.chatLog.appendChild(el);
    while (this.chatLog.children.length > 40) this.chatLog.firstElementChild!.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
    el.classList.add('fresh');
    setTimeout(() => el.classList.remove('fresh'), 8000);
  }

  openChat(): void {
    this.chatOpen = true;
    this.chatInput.classList.remove('hidden');
    this.chatLog.classList.add('open');
    this.chatInput.focus();
  }

  closeChat(): void {
    this.chatOpen = false;
    this.chatInput.value = '';
    this.chatInput.blur();
    this.chatInput.classList.add('hidden');
    this.chatLog.classList.remove('open');
  }

  // ------------------------------------------------------------------ challenge

  /** `ring`: they want to fight here, in the duel ring you're both standing in */
  showChallenge(from: string, name: string, char: CharacterId, ring = false): void {
    this.challengeFrom = from;
    const el = this.els.challenge;
    el.innerHTML = `<div class="ch-seal" aria-hidden="true">挑</div><div class="ch-head">${icon('swords')}挑戦状 · A challenge</div>
      <div><b>${esc(name)}</b> (${CHARACTERS[char].name}) challenges you to a duel${ring ? ' <b>here in the ring</b>' : ''}!</div>
      <div class="row"><button class="btn small" data-a="1">${jpLabel('受', 'Accept', 'check')}<span class="key"> [Y]</span></button><button class="btn small danger" data-a="0">${jpLabel('断', 'Decline', 'close')}<span class="key"> [N]</span></button></div>`;
    el.classList.remove('hidden');
    el.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => this.answerChallenge((b as HTMLElement).dataset.a === '1')),
    );
    setTimeout(() => {
      if (this.challengeFrom === from) this.hideChallenge();
    }, 15000);
  }

  answerChallenge(accept: boolean): boolean {
    if (!this.challengeFrom) return false;
    this.handlers.onChallengeReply(this.challengeFrom, accept);
    this.hideChallenge();
    return true;
  }

  hideChallenge(): void {
    this.challengeFrom = null;
    this.els.challenge.classList.add('hidden');
  }

  // ------------------------------------------------------------------ modals

  toggleModal(kind: ModalKind): void {
    if (this.modalOpen === kind) this.closeModal();
    else this.openModal(kind);
  }

  closeModal(): void {
    if (!this.modalOpen) return;
    this.modalOpen = null;
    this.legend = null;
    this.charsRefresh = null;
    this.modal.classList.add('hidden');
    this.preview?.dispose();
    this.preview = null;
    this.modal.innerHTML = '';
    this.handlers.onModalChange(false);
  }

  private frame(title: string, body: string, wide = false, kanji = '', ico?: IconName, cls = ''): void {
    this.preview?.dispose();
    this.preview = null;
    this.legend = null;
    this.modal.innerHTML = `<div class="modal-box ${wide ? 'wide' : ''} ${cls}"><div class="modal-head"><h2>${ico ? icon(ico, 'mh-ico') : ''}${kanji ? `<span class="mk">${kanji}</span>` : ''}${title}</h2><button class="btn small close" aria-label="Close">${icon('close')}<span class="key"> Esc</span></button></div><div class="modal-body">${body}</div></div>`;
    this.modal.classList.remove('hidden');
    this.modal.querySelector('.close')!.addEventListener('click', () => this.closeModal());
  }

  /**
   * A fighter's legend, opened over the fighter select like a scroll unrolled across it: the
   * title, the five parts with their numerals stamped beside them (and a row of those numerals up
   * top to jump between parts, lit as you read through each), a bar filling as you go, and the
   * line they're known by at the end. Esc or Back rolls it up again.
   */
  private openLegend(id: CharacterId): void {
    this.closeLegend();
    const box = this.modal.querySelector<HTMLElement>('.fs-box');
    if (!box) return;
    const l = LORE[id];
    const c = CHARACTERS[id];
    const part = (h: string) => {
      const m = /^([IVX]+)\.\s*(.*)$/.exec(h);
      return m ? { n: m[1], name: m[2] } : { n: '', name: h };
    };
    const el = document.createElement('div');
    el.className = 'lg';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', `${l.title}: ${l.subtitle}`);
    el.style.setProperty('--c2', c.palette.accent);
    el.innerHTML = `
      <div class="lg-bar">
        <span class="lg-kanji">${esc(c.jp)}</span>
        <div class="lg-heads"><div class="lg-title">${esc(l.title)}</div><div class="lg-sub">${esc(l.subtitle)}</div></div>
        <nav class="lg-nav">${l.sections.map((s, i) => `<button data-i="${i}" title="${esc(part(s.heading).name)}">${esc(part(s.heading).n || String(i + 1))}</button>`).join('')}</nav>
        <button class="lg-close">${icon('back')}Back<span class="key"> Esc</span></button>
      </div>
      <div class="lg-progress"><i></i></div>
      <div class="lg-page" tabindex="0">
        <article class="lg-text">
          <div class="lg-epithet">${esc(c.name)} · ${esc(l.epithet)}</div>
          ${l.sections
            .map((s) => {
              const p = part(s.heading);
              return `<section class="lg-sec"><h3 class="lg-h">${p.n ? `<span class="lg-n">${esc(p.n)}</span>` : ''}<span>${esc(p.name)}</span></h3>${s.paragraphs.map((t) => `<p>${esc(t)}</p>`).join('')}</section>`;
            })
            .join('')}
          <div class="lg-end"><span class="lg-quote">“${esc(l.quote)}”</span><span class="lg-fin">${esc(c.jp)}</span></div>
        </article>
      </div>`;
    box.appendChild(el);
    this.legend = el;
    const page = el.querySelector<HTMLElement>('.lg-page')!;
    const secs = [...el.querySelectorAll<HTMLElement>('.lg-sec')];
    const nav = [...el.querySelectorAll<HTMLElement>('.lg-nav button')];
    const bar = el.querySelector<HTMLElement>('.lg-progress i')!;
    const track = () => {
      const max = page.scrollHeight - page.clientHeight;
      bar.style.width = `${max > 0 ? Math.min(100, (page.scrollTop / max) * 100) : 100}%`;
      // the part being read: the last one whose heading has passed the top third of the page
      const line = page.scrollTop + page.clientHeight * 0.33;
      let at = 0;
      secs.forEach((s, i) => {
        if (s.offsetTop - page.offsetTop <= line) at = i;
      });
      if (page.scrollTop >= max - 2) at = secs.length - 1;
      nav.forEach((b, i) => b.classList.toggle('on', i === at));
    };
    page.addEventListener('scroll', track, { passive: true });
    nav.forEach((b, i) =>
      b.addEventListener('click', () => {
        page.scrollTop = secs[i].offsetTop - page.offsetTop - 4;
        page.focus({ preventScroll: true });
      }),
    );
    el.querySelector('.lg-close')!.addEventListener('click', () => this.closeLegend());
    track();
    page.focus({ preventScroll: true });
  }

  /** Roll the legend up if it's open; true if it was. */
  closeLegend(): boolean {
    const el = this.legend;
    if (!el) return false;
    this.legend = null;
    el.classList.add('lg-out');
    window.setTimeout(() => el.remove(), 220);
    return true;
  }

  /** Lock the fighter picker for the length of a match (and shut it if it's open). */
  setCharsLocked(on: boolean): void {
    this.charsLocked = on;
    document.body.classList.toggle('chars-locked', on);
    if (on && this.modalOpen === 'chars') this.closeModal();
  }

  openModal(kind: ModalKind, currentChar: CharacterId = settings.char): void {
    if (kind === 'chars' && this.charsLocked) return;
    this.modalOpen = kind;
    this.handlers.onModalChange(true);
    if (kind === 'chars') this.renderChars(currentChar);
    else if (kind === 'shop') this.renderShop();
    else if (kind === 'ladder') {
      this.frame('Ranked Ladder', `<div class="ladder">Loading…</div>`, false, '番付', 'ladder');
      this.handlers.onLeaderboard();
    } else this.renderHelp();
  }

  /**
   * The fighter select: the roster along the bottom and, above it, the chosen fighter large (their
   * model turning through their moves), their name, kanji and role, and nothing more until you
   * open one of the tabs: their moves, their numbers, or their story. Fighters you don't own wear a
   * padlock; the button under the chosen one plays them, unlocks them with coins (the Lancer and the
   * Warden once you've reached Gold), or takes the free fighter once it's yours to take.
   */
  private renderChars(selected: CharacterId): void {
    const tiles = CHARACTER_IDS.map((id) => {
      const c = CHARACTERS[id];
      return `<button class="fs-tile" data-id="${id}" style="--c2:${c.palette.accent}" aria-label="${esc(c.name)}"><img src="${this.handlers.portrait(id)}" alt="" draggable="false"><span>${esc(c.name)}</span><i class="fs-lock">${icon('lock')}</i></button>`;
    }).join('');
    this.frame(
      'Choose your fighter',
      `<div class="fs">
        <div class="fs-stage">
          <div class="fs-preview"></div>
          <div class="fs-hero">
            <div class="fs-id"><span class="fs-kanji"></span><div><div class="fs-name"></div><div class="fs-role"></div></div></div>
            <div class="fs-tabs" role="tablist">
              <button class="fs-tab" role="tab" data-tab="moves" aria-selected="false">${icon('sword')}Moves</button>
              <button class="fs-tab" role="tab" data-tab="stats" aria-selected="false">${icon('gauge')}Stats</button>
              <button class="fs-tab" role="tab" data-tab="story" aria-selected="false">${icon('eye')}Story</button>
            </div>
            <div class="fs-panel hidden" role="tabpanel"></div>
            <div class="fs-go"><button class="fs-play" id="pick-char"></button><button class="fs-free hidden" id="free-char">${icon('star')}Take free</button><span class="fs-note"></span></div>
          </div>
        </div>
        <div class="fs-roster">${tiles}</div>
      </div>`,
      true,
      '武者',
      'fighters',
      'fs-box',
    );
    const root = this.modal.querySelector<HTMLElement>('.fs')!;
    const panel = root.querySelector<HTMLElement>('.fs-panel')!;
    const tabs = [...root.querySelectorAll<HTMLElement>('.fs-tab')];
    const roster = [...root.querySelectorAll<HTMLElement>('.fs-tile')];
    let current = selected;
    let tab: string | null = null;
    const keys = this.touch ? { light: 'Light', heavy: 'Heavy', special: 'Special', ability: 'Ability' } : { light: 'LMB', heavy: 'F', special: 'E', ability: 'R' };
    const row = (key: string, label: string, body: string) => `<div class="fs-row"><span class="fs-key">${key}</span><div><b>${label}</b><p>${body}</p></div></div>`;
    const chain = (list: { name: string }[]) => list.map((a) => esc(a.name)).join(' <i>›</i> ');
    const fill = () => {
      const c = CHARACTERS[current];
      if (tab === 'moves') {
        panel.innerHTML =
          row(keys.special, `Perilous · ${esc(c.special.name)}`, PERILOUS_TIP[c.special.perilous!]) +
          row(keys.ability, esc(c.ability.name), esc(c.ability.description)) +
          row('Passive', esc(c.passive.name), esc(c.passive.description)) +
          row(keys.light, 'Light chain', chain(c.lights)) +
          row(keys.heavy, 'Heavy chain', chain([c.heavy, c.extra.h1, c.extra.h2]));
      } else if (tab === 'stats') {
        const bar = (label: string, v: number) => `<div class="fs-bar"><span>${label}</span><div>${'<i class="on"></i>'.repeat(v)}${'<i></i>'.repeat(5 - v)}</div></div>`;
        panel.innerHTML = `<p class="fs-blurb">${esc(c.description)}</p>
          <div class="fs-bars">${bar('Power', c.ratings.power)}${bar('Speed', c.ratings.speed)}${bar('Reach', c.ratings.reach)}${bar('Defense', c.ratings.defense)}${bar('Difficulty', c.ratings.difficulty)}</div>
          <div class="fs-nums"><span>${icon('heart')}HP <b>${c.stats.hp}</b></span><span>${icon('shield')}Posture <b>${c.stats.posture}</b></span><span>${icon('dash')}Speed <b>${c.stats.speed}</b></span></div>`;
      } else if (tab === 'story') {
        const l = LORE[current];
        panel.innerHTML = `<div class="fs-epithet">${esc(l.epithet)}</div>
          <div class="fs-lg-title">${esc(l.title)}<span>${esc(l.subtitle)}</span></div>
          <p class="fs-teaser">${esc(l.teaser)}</p>
          <div class="fs-lg-go"><button class="fs-read">${icon('scroll')}Read the legend<span>${readingMinutes(l)} min</span></button><div class="fs-quote">“${esc(l.quote)}”</div></div>`;
        panel.querySelector('.fs-read')!.addEventListener('click', () => this.openLegend(current));
      }
      panel.scrollTop = 0;
    };
    const setTab = (t: string | null) => {
      tab = t;
      for (const b of tabs) b.setAttribute('aria-selected', String(b.dataset.tab === t));
      panel.classList.toggle('hidden', !t);
      root.classList.toggle('fs-open', !!t);
      if (t) {
        fill();
        // replay the panel's opening
        panel.classList.remove('fs-pop');
        void panel.offsetWidth;
        panel.classList.add('fs-pop');
      }
    };
    const show = (id: CharacterId) => {
      current = id;
      this.handlers.onRosterPick(id);
      const c = CHARACTERS[id];
      root.style.setProperty('--c1', c.palette.primary);
      root.style.setProperty('--c2', c.palette.accent);
      for (const b of roster) b.classList.toggle('sel', b.dataset.id === id);
      root.querySelector('.fs-kanji')!.textContent = c.jp;
      root.querySelector('.fs-name')!.textContent = c.name;
      root.querySelector('.fs-role')!.textContent = `${c.role} · ${c.weapon}`;
      paintLocks();
      const hero = root.querySelector<HTMLElement>('.fs-id')!;
      hero.classList.remove('fs-in');
      void hero.offsetWidth;
      hero.classList.add('fs-in');
      if (tab) fill();
      const pv = root.querySelector<HTMLElement>('.fs-preview')!;
      if (!this.preview) this.preview = this.handlers.createPreview(pv);
      else if (this.preview.el.parentElement !== pv) pv.appendChild(this.preview.el);
      this.preview.setChar(id);
    };
    const play = root.querySelector<HTMLButtonElement>('#pick-char')!;
    const free = root.querySelector<HTMLButtonElement>('#free-char')!;
    const note = root.querySelector<HTMLElement>('.fs-note')!;
    const owns = (id: CharacterId) => !this.profile || this.profile.chars.includes(id);
    // padlocks on the roster, and what the button under the chosen fighter does
    const paintLocks = () => {
      const p = this.profile;
      for (const b of roster) b.classList.toggle('locked', !owns(b.dataset.id as CharacterId));
      const c = CHARACTERS[current];
      free.classList.add('hidden');
      play.classList.remove('buy');
      if (!p || owns(current)) {
        play.disabled = false;
        play.innerHTML = `${icon('swords')}Play ${esc(c.name)}`;
        const left = p ? gamesToFreePick(p) : 0;
        note.innerHTML = p && freePickReady(p) ? `${icon('star')}A free fighter is waiting: pick a locked one` : p && left > 0 ? `${left} more match${left === 1 ? '' : 'es'} to a free fighter` : 'Switch fighters in the lobby safe zone';
        return;
      }
      const price = charPrice(current);
      const gold = reachedGold(p);
      if (isPremium(current) && !gold) {
        play.disabled = true;
        play.innerHTML = `${icon('lock')}Reach Gold to unlock`;
        note.textContent = `Then ${coinText(price)} coins. Climb the ranked ladder to Gold first.`;
        return;
      }
      if (freePickReady(p)) free.classList.remove('hidden');
      play.classList.add('buy');
      play.disabled = p.coins < price;
      play.innerHTML = `${icon('coin')}Unlock · ${coinText(price)}`;
      note.textContent = p.coins >= price ? `You have ${coinText(p.coins)} coins` : `${coinText(price - p.coins)} more coins needed · watch an ad in the shop`;
    };
    this.charsRefresh = paintLocks;
    for (const b of tabs) b.addEventListener('click', () => setTab(tab === b.dataset.tab ? null : b.dataset.tab!));
    for (const b of roster) b.addEventListener('click', () => show(b.dataset.id as CharacterId));
    play.addEventListener('click', () => {
      if (!owns(current)) {
        this.handlers.onUnlock('char', current);
        return;
      }
      this.handlers.onSelectChar(current);
      this.closeModal();
    });
    free.addEventListener('click', () => this.handlers.onUnlock('char', current, true));
    // the arrow keys walk the roster
    root.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!step || this.legend || (e.target as HTMLElement).closest('.fs-panel')) return;
      e.preventDefault();
      const i = (CHARACTER_IDS.indexOf(current) + step + CHARACTER_IDS.length) % CHARACTER_IDS.length;
      show(CHARACTER_IDS[i]);
      roster[i].focus();
    });
    show(selected);
    if (!this.touch) roster[CHARACTER_IDS.indexOf(selected)]?.focus({ preventScroll: true });
  }

  /**
   * The shop: your coins, an ad to watch for more (as often as you like), the free fighter's
   * progress, the arenas to unlock and a way to the fighters.
   */
  private renderShop(): void {
    const p = this.profile;
    const coins = p?.coins ?? 0;
    const left = p ? gamesToFreePick(p) : FREE_PICK_GAMES;
    const pips = Array.from({ length: FREE_PICK_GAMES }, (_, i) => `<i class="${p && (p.freePicked || i < p.games) ? 'on' : ''}"></i>`).join('');
    const freeLine = !p ? '' : p.freePicked ? 'Free fighter taken' : freePickReady(p) ? 'Ready! Pick any fighter free' : `${left} more match${left === 1 ? '' : 'es'} to a free fighter`;
    const mapCard = (id: string) => {
      const m = MAPS[id];
      const owned = !p || p.maps.includes(id);
      const action = owned
        ? `<span class="sh-owned">${icon('check')}Owned</span>`
        : `<button class="sh-buy" data-map="${id}"${coins < MAP_PRICE ? ' disabled' : ''}>${icon('coin')}${coinText(MAP_PRICE)}</button>`;
      return `<div class="sh-map${owned ? ' owned' : ''}"><img src="${THUMBS[id] ?? ''}" alt="" draggable="false"><span class="sh-jp">${esc(m?.jp ?? '')}</span><span class="sh-name">${esc(m?.name ?? id)}</span>${owned ? '' : `<i class="sh-lock">${icon('lock')}</i>`}${action}</div>`;
    };
    this.frame(
      'Shop',
      `<div class="shop">
        <div class="sh-top">
          <div class="sh-purse">${icon('coin')}<b>${coinText(coins)}</b><span>coins</span></div>
          <button class="sh-ad">${icon('watch')}<span><b>Watch an ad</b><i>+${AD_REWARD} coins · as often as you like</i></span></button>
          <div class="sh-free${p && freePickReady(p) ? ' ready' : ''}"><span class="sh-pips">${pips}</span><span>${esc(freeLine)}</span></div>
        </div>
        ${iconHead('mountain', 'Arenas')}
        <p class="muted">Anyone you fight can pick any arena either of you owns.</p>
        <div class="sh-maps">${ARENA_MAPS.map((m) => mapCard(m.id)).join('')}</div>
        ${iconHead('fighters', 'Fighters')}
        <button class="sh-fighters">${icon('fighters')}Unlock fighters<span>${coinText(charPrice('ronin'))} coins each · Lancer and Warden ${coinText(charPrice('lancer'))} at Gold</span></button>
        <p class="muted">Every finished match pays coins, and the ad that plays after it pays ${coinText(MATCH_AD_REWARD)} more.</p>
      </div>`,
      true,
      '店',
      'coin',
      'shop-box',
    );
    const box = this.modal.querySelector<HTMLElement>('.shop')!;
    const ad = box.querySelector<HTMLButtonElement>('.sh-ad')!;
    ad.addEventListener('click', () => {
      ad.disabled = true;
      void this.handlers.onWatchAd('bonus').finally(() => (ad.disabled = false));
    });
    for (const b of box.querySelectorAll<HTMLElement>('[data-map]')) b.addEventListener('click', () => this.handlers.onUnlock('map', b.dataset.map!));
    box.querySelector('.sh-fighters')!.addEventListener('click', () => this.openModal('chars'));
  }

  showLeaderboard(entries: LeaderboardEntry[], you: number | null, total: number, me: ProfileView | null): void {
    if (this.modalOpen !== 'ladder') return;
    const box = this.modal.querySelector('.ladder');
    if (!box) return;
    const rows = entries
      .map((e, i) => {
        const r = rankOf(e.mmr, e.placements);
        const mine = me && e.name === me.name && e.mmr === me.mmr;
        return `<tr class="${mine ? 'mine' : ''}"><td class="lp">${i < 3 ? MEDALS[i] : ''}${i + 1}</td><td>${esc(e.name)}</td><td>${rankBadge(r, true)}</td><td>${e.mmr}</td><td>${e.wins}-${e.losses}</td></tr>`;
      })
      .join('');
    const tiers = TIERS.map((t) => `<span class="rank-badge small" style="--rank:${t.color}"><i></i>${t.name} ${t.min}+</span>`).join(' ');
    const th = (ico: IconName | null, label: string) => `<th>${ico ? icon(ico) : ''}${label}</th>`;
    const meRank = me ? rankOf(me.mmr, me.placements) : null;
    box.innerHTML = `
      <div class="ladder-you">${me && meRank ? `${icon('crown')}You: ${rankBadge(meRank)} ${meRank.placed ? `${me.mmr} MMR · #${you ?? '?'} of ${total}` : `play ${PLACEMENT_MATCHES - me.placements} more ranked match(es) to place`}` : ''}</div>
      ${entries.length ? `<table><thead><tr>${th(null, '#')}${th(null, 'Name')}${th('star', 'Rank')}${th('gauge', 'MMR')}${th('swords', 'W-L')}</tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">Nobody has finished placements yet. Be the first!</p>'}
      <div class="tiers">${tiers}</div>
      <p class="muted">${
        this.offline
          ? `Ranked is best of 3 rounds against an opponent near your rating. Ratings use Elo (K=32, 64 during your ${PLACEMENT_MATCHES} placement matches), and your record is saved in this browser.`
          : `Ranked is best of 3 rounds on a random map. Ratings use Elo (K=32, 64 during your ${PLACEMENT_MATCHES} placement matches). Leaving a ranked match counts as a loss.`
      }</p>`;
  }

  private renderHelp(): void {
    const maps = ARENA_MAPS.map((m) => `<li><b>${m.name}</b> — ${esc(m.description)}</li>`).join('');
    this.frame(
      'How to fight',
      `<div class="help">
        <div class="help-cols">
          <div>
            ${iconHead('keys', 'Controls')}
            ${
              this.touch
                ? `<table class="keys">
              <tr><td>Left thumb</td><td>Move (anywhere on the left side)</td></tr>
              <tr><td>Drag right</td><td>Look around (out of a duel; locked on, the camera holds still)</td></tr>
              <tr><td>Light</td><td>Light attack, three in a row (after a forward dodge: dash attack; walking away: backstep attack; in the air: air attack)</td></tr>
              <tr><td>Heavy</td><td>Heavy attack, three in a row, with the same dash, backstep and air versions (tap Parry during the windup to feint)</td></tr>
              <tr><td>Parry</td><td>Guard; tap right before a hit to DEFLECT</td></tr>
              <tr><td>Dodge</td><td>Dodge (hold to sprint)</td></tr>
              <tr><td>Jump</td><td>Jump (evades perilous sweeps)</td></tr>
              <tr><td>Special</td><td>Appears when your special bar fills: perilous special (unblockable)</td></tr>
              <tr><td>Small button</td><td>Character ability</td></tr>
              <tr><td>Lock</td><td>Lock on</td></tr>
              <tr><td>Prompt</td><td>Tap it to challenge the player in front of you</td></tr>
              <tr><td>${icon('menu')}</td><td>Menu: ranked, practice, characters, ladder</td></tr>
            </table>`
                : ''
            }
            <table class="keys${this.touch ? ' hidden' : ''}">
              <tr><td>WASD</td><td>Move (Shift tap: dodge, hold: sprint)</td></tr>
              <tr><td>Mouse</td><td>Look / aim (click to capture; locked on, the camera holds still)</td></tr>
              <tr><td>LMB</td><td>Light attack, three in a row (after a forward dodge: dash attack; walking away: backstep attack; in the air: air attack)</td></tr>
              <tr><td>F</td><td>Heavy attack, three in a row, with the same dash, backstep and air versions (right-click during windup to feint)</td></tr>
              <tr><td>RMB</td><td>Guard — tap right before a hit to DEFLECT, hold to block</td></tr>
              <tr><td>Space</td><td>Jump (evades perilous sweeps)</td></tr>
              <tr><td>E</td><td>Perilous special (unblockable)</td></tr>
              <tr><td>R</td><td>Character ability</td></tr>
              <tr><td>Tab / Q / MMB</td><td>Lock on</td></tr>
              <tr><td>G</td><td>Challenge the player you're looking at</td></tr>
              <tr><td>M</td><td>Play menu (frees the cursor to click it)</td></tr>
              <tr><td>K · P</td><td>Queue ranked · Practice duel</td></tr>
              <tr><td>C · L · H</td><td>Characters · Ladder · Help</td></tr>
              <tr><td>Esc</td><td>Free the cursor (to click menus)</td></tr>
              <tr><td>Enter</td><td>Chat</td></tr>
            </table>
          </div>
          <div>
            <button class="help-tutorial">${icon('dummy')}Play the tutorial<span>The sensei shows you posture and deflects</span></button>
            ${iconHead('shield', 'Posture & deflects')}
            <p>Every fighter has <b>health</b> and <b>posture</b>. Blocking a hit costs posture. <b>Deflecting</b> (pressing guard just before the hit lands) costs almost nothing and instead hammers the attacker's posture, staggering them for a free counter.</p>
            <p>When posture fills up you are <b>posture broken</b>: helpless for a moment, and the next hit is a <b>Deathblow</b> for ${40} damage. Posture recovers slowly, and only once you stop: not while you attack, dodge or reel, and not until a while after the last posture damage (faster while guarding, slower when hurt). After a break, the guard comes back whole.</p>
            <p>Mashing guard shrinks your deflect window. Read the swing, then commit.</p>
            ${iconHead('peril', 'Perilous attacks <span class="kanji">危</span>')}
            <p>A red symbol means an unblockable attack: <b>Thrusts</b> must be deflected — or dodge <i>into</i> them for a Mikiri Counter. <b>Sweeps</b> must be jumped. <b>Grabs</b> must be dodged.</p>
          </div>
        </div>
        ${iconHead('chain', 'Cancels')}
        <p class="muted">What each attack can be cut short into, in its recovery. "On hit" needs the attack to connect (hit or blocked); "late" opens partway through.</p>
        ${cancelTable()}
        ${iconHead('torii', 'The lobby')}
        <p>You spawn in the shrine plaza (safe zone). Step outside and anyone can fight you. The training yard (east) has a passive dummy and a sparring dummy that swings at you — perfect for practising deflects.</p>
        ${iconHead('mountain', 'Arenas')}<ul class="maps">${maps}</ul>
        ${iconHead('settings', 'Settings')}
        <div class="settings">
          <label>${icon('screen')}Graphics <select id="set-gfx">${(['auto', 'low', 'medium', 'high', 'ultra'] as const).map((q) => `<option value="${q}" ${settings.graphics === q ? 'selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}</select></label>
          <label>${icon('mouse')}${this.touch ? 'Look' : 'Mouse'} sensitivity <input type="range" min="0.2" max="3" step="0.1" id="set-sens" value="${settings.sensitivity}"><span id="set-sens-v">${settings.sensitivity}</span></label>
          <label>${icon('speaker')}Volume <input type="range" min="0" max="1" step="0.05" id="set-vol" value="${settings.volume}"></label>
          <label>${icon('speaker')}Music <input type="range" min="0" max="1" step="0.05" id="set-music" value="${settings.music}"></label>
          <label>${icon('sparkle')}<input type="checkbox" id="set-cue" ${settings.parryCue ? 'checked' : ''}> Weapon glint before a hit lands</label>
          <label>${icon('updown')}<input type="checkbox" id="set-inv" ${settings.invertY ? 'checked' : ''}> Invert ${this.touch ? 'look' : 'mouse'} Y</label>
          <label>${icon('camera')}<input type="checkbox" id="set-shake" ${settings.reduceShake ? 'checked' : ''}> Reduce camera shake</label>
          <label>${icon('gauge')}<input type="checkbox" id="set-fps" ${settings.showFps ? 'checked' : ''}> Show FPS</label>
        </div>
        ${iconHead('speaker', 'Music')}
        <ul class="credits">${musicCredits()}</ul>
      </div>`,
      true,
      '心得',
      'help',
    );
    const bind = <E extends HTMLInputElement | HTMLSelectElement = HTMLInputElement>(id: string, apply: (el: E) => void) => {
      const el = this.modal.querySelector<E>(id)!;
      el.addEventListener('input', () => {
        apply(el);
        this.handlers.onSettingsChanged();
      });
    };
    bind<HTMLSelectElement>('#set-gfx', (el) => {
      settings.graphics = el.value as typeof settings.graphics;
    });
    bind('#set-sens', (el) => {
      settings.sensitivity = Number(el.value);
      this.modal.querySelector('#set-sens-v')!.textContent = el.value;
    });
    bind('#set-vol', (el) => (settings.volume = Number(el.value)));
    bind('#set-music', (el) => (settings.music = Number(el.value)));
    bind('#set-cue', (el) => (settings.parryCue = el.checked));
    bind('#set-inv', (el) => (settings.invertY = el.checked));
    bind('#set-shake', (el) => (settings.reduceShake = el.checked));
    bind('#set-fps', (el) => (settings.showFps = el.checked));
    this.modal.querySelector('.help-tutorial')!.addEventListener('click', () => {
      this.closeModal();
      this.handlers.onTutorial();
    });
  }

  // ------------------------------------------------------------------ match screens

  matchIntro(mode: MatchMode, mapId: string, players: [RosterEntry, RosterEntry], you: 0 | 1): void {
    const map = MAPS[mapId];
    const title = mode === 'ranked' ? 'Ranked duel' : mode === 'practice' ? 'Practice duel' : 'Duel';
    const titleJp = mode === 'ranked' ? '段位戦' : mode === 'practice' ? '稽古' : '決闘';
    const card = (r: RosterEntry, mine: boolean) => {
      const c = CHARACTERS[r.char];
      const rank = r.mmr !== undefined ? rankBadge(rankOf(r.mmr, r.placements ?? 0), true) : '';
      return `<div class="vs-card ${mine ? 'mine' : ''}" style="--c1:${c.palette.primary};--c2:${c.palette.accent}"><span class="vs-jp" aria-hidden="true">${c.jp}</span><span class="vs-port"><img src="${this.handlers.portrait(r.char)}" alt=""></span><div class="vs-char">${c.name}</div><div class="vs-weapon">${c.weapon}</div><div class="vs-name">${esc(r.name)}</div>${rank}</div>`;
    };
    const modeIcon: IconName = mode === 'ranked' ? 'crown' : mode === 'practice' ? 'dummy' : 'swords';
    const el = h(`<div class="match-intro"><div class="mi-mode">${icon(modeIcon)}<span class="jp">${titleJp}</span>${title}</div><div class="mi-jp">${map?.jp ?? ''}</div><div class="mi-map">${map?.name ?? ''}</div>
      <div class="mi-vs">${card(players[you], true)}<div class="vs">対</div>${card(players[you === 0 ? 1 : 0], false)}</div>
      <div class="mi-desc">${esc(map?.description ?? '')}</div></div>`);
    this.hud.appendChild(el);
    setTimeout(() => el.classList.add('out'), 1100);
    setTimeout(() => el.remove(), 1600);
  }

  /**
   * A fighter's name card at the end of their ring entrance, revealed in their own style (ink,
   * chisel, mist, lightning, blades, flourish, seal, bronze; see .nc-<id> in the styles).
   */
  nameCard(r: RosterEntry, mine: boolean, title: string, line: string, ms: number): void {
    const c = CHARACTERS[r.char];
    const el = h(`<div class="name-card nc-${r.char} ${mine ? 'mine' : 'theirs'}" style="--c1:${c.palette.primary};--c2:${c.palette.accent};--nc-ms:${ms}ms">
      <div class="nc-jp" aria-hidden="true">${c.jp}</div>
      <div class="nc-main"><div class="nc-name">${esc(c.name)}</div><div class="nc-title">${esc(title)}</div><div class="nc-player">${esc(r.name)}</div></div>
      <div class="nc-line">“${esc(line)}”</div></div>`);
    this.hud.appendChild(el);
    setTimeout(() => el.classList.add('out'), Math.max(300, ms - 350));
    setTimeout(() => el.remove(), ms);
  }

  /** Letterbox the screen and hide the duel HUD while the intro camera runs. */
  setCinematic(on: boolean): void {
    const was = this.hud.classList.contains('cinematic');
    this.hud.classList.toggle('cinematic', on);
    // coming out of it, the HUD fades back in behind the retreating bars instead of popping on
    clearTimeout(this.revealTimer);
    this.hud.classList.toggle('reveal', was && !on);
    if (was && !on) this.revealTimer = window.setTimeout(() => this.hud.classList.remove('reveal'), 900);
  }

  private revealTimer = 0;

  /**
   * The result card: the coins earned, and that an ad plays next and what it pays when it's watched
   * through. `closed` runs as the card goes (the ad plays then).
   */
  showResult(r: Extract<ServerMsg, { t: 'result' }>, me: ProfileView | null, closed?: () => void): void {
    let ratingHtml = '';
    if (r.before && r.after && r.delta !== undefined) {
      const before = rankOf(r.before.mmr, r.before.placements);
      const after = rankOf(r.after.mmr, r.after.placements);
      // only talk about promotions once you're on the ladder (placement labels change every game)
      const changed = after.placed && before.label !== after.label;
      const promo = after.placed && (!before.placed || r.delta > 0);
      ratingHtml = `<div class="res-rating">
        <div class="res-delta ${r.delta >= 0 ? 'up' : 'down'}">${icon(r.delta >= 0 ? 'up' : 'down')}${r.delta >= 0 ? '+' : ''}${r.delta} MMR</div>
        <div>${r.before.mmr} → <b>${r.after.mmr}</b></div>
        <div class="res-rank">${rankBadge(after)}</div>
        ${changed ? `<div class="res-promo ${promo ? 'up' : 'down'}">${!before.placed && after.placed ? 'PLACED!' : promo ? 'RANK UP!' : 'Demoted'}</div>` : ''}
        ${after.placed ? `<div class="pc-progress big"><div style="width:${Math.round(after.progress * 100)}%;background:${after.color}"></div></div>` : `<div class="muted">Placement ${r.after.placements}/${PLACEMENT_MATCHES}</div>`}
      </div>`;
    }
    const reason = r.reason === 'forfeit' ? (r.won ? 'Opponent forfeited' : 'You forfeited') : r.reason === 'timeout' ? 'Time' : '';
    const coinsHtml =
      (r.coins ? `<div class="res-coins">${icon('coin')}+${coinText(r.coins)} coins</div>` : '') +
      (r.ad && matchAdExpected() ? `<div class="res-ad">${icon('watch')}An ad plays next. Watch it to the end for +${coinText(r.ad)} coins.</div>` : '');
    const el = h(`<div class="result ${r.won ? 'win' : 'lose'}">
      <div class="res-jp">${r.won ? '勝利' : '敗北'}</div>
      <div class="res-icon">${icon(r.won ? 'crown' : 'skull')}</div>
      <div class="res-title">${r.won ? 'VICTORY' : 'DEFEAT'}</div>
      <div class="res-score">${r.scores.join(' - ')}${reason ? ` · ${reason}` : ''}</div>
      ${ratingHtml}
      ${coinsHtml}
      <div class="muted">Returning to the lobby…</div></div>`);
    void me;
    this.hud.appendChild(el);
    window.setTimeout(() => el.classList.add('out'), 6300);
    window.setTimeout(() => (el.remove(), closed?.()), 7000);
  }
}
