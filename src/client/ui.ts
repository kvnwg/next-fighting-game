/** DOM user interface: HUD, menus, overlays. Pure presentation; App drives it. */
import { CHARACTERS, CHARACTER_IDS, CharacterDef, CharacterId, Perilous } from '../shared/characters';
import { ARENA_MAPS, MAPS } from '../shared/maps';
import { BotDifficulty, LeaderboardEntry, MatchMode, ProfileView, RosterEntry, ServerMsg } from '../shared/protocol';
import { PLACEMENT_MATCHES, RankInfo, TIERS, rankOf } from '../shared/ranks';
import { CANCELS, CANCEL_NAMES, CancelInto, CancelWindow, MoveClass } from '../shared/cancels';
import { LobbyBar } from './lobbybar';
import { settings } from './settings';

const h = (html: string): HTMLElement => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A button label with its kanji tag in front. */
const jpLabel = (kanji: string, text: string) => `<span class="bk">${kanji}</span>${text}`;

export function rankBadge(r: RankInfo, small = false): string {
  const label = r.placed ? r.label : small ? 'Unranked' : r.label;
  return `<span class="rank-badge ${small ? 'small' : ''}" style="--rank:${r.color}"><i></i>${esc(label)}</span>`;
}

const PERILOUS_TIP: Record<Perilous, string> = {
  thrust: 'Perilous THRUST — deflect it, or dodge into it for a Mikiri Counter',
  sweep: 'Perilous SWEEP — jump over it',
  grab: 'Perilous GRAB — dodge or jump away',
};

export interface UIHandlers {
  onEnter(name: string): void;
  onRanked(): void;
  onPractice(diff: BotDifficulty): void;
  onCancelQueue(): void;
  onSelectChar(id: CharacterId): void;
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
}

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
            <div class="fc-hp"><div class="fc-track"><i class="fc-trail"></i><i class="fc-fill"></i></div></div>
            <div class="fc-po"><div class="fc-track"><i class="fc-pofill"></i></div><b class="fc-brk">BROKEN</b></div>
            <div class="fc-bot"><span class="fc-handle"></span><span class="fc-sp" title="Perilous art"><i class="fc-spfill"></i></span><span class="fc-pips"></span></div>
          </div>
        </div>
        <div class="fcard opp hidden">
          <div class="fc-port"><img class="fc-portrait" alt="" /></div>
          <div class="fc-main">
            <div class="fc-top"><span class="fc-n"></span><span class="fc-title"></span><span class="fc-ping"></span></div>
            <div class="fc-hp"><div class="fc-track"><i class="fc-trail"></i><i class="fc-fill"></i></div></div>
            <div class="fc-po"><div class="fc-track"><i class="fc-pofill"></i></div><b class="fc-brk">BROKEN</b></div>
            <div class="fc-bot"><span class="fc-handle"></span><span class="fc-sp" title="Perilous art"><i class="fc-spfill"></i></span><span class="fc-pips"></span></div>
          </div>
        </div>
        <div class="top-center">
          <div class="match-round hidden"></div>
          <div class="match-timer hidden">0:00</div>
          <div class="zone-indicator hidden"><span class="jp">安全地帯</span>Safe zone · PvP disabled</div>
          <div class="net-info"><span id="online"></span><span id="fps"></span></div>
        </div>
        <div class="side-menu">
          <button class="btn ranked" id="btn-ranked">${jpLabel('段位戦', offline ? 'Ranked vs AI' : 'Ranked')}<span class="key"> [K]</span></button>
          <div class="practice-group">
            <button class="btn" id="btn-practice">${jpLabel('稽古', 'Practice')}<span class="key"> [P]</span></button>
            <select id="practice-diff" aria-label="Bot difficulty"><option value="easy">Easy</option><option value="normal" selected>Normal</option><option value="hard">Hard</option></select>
          </div>
          <button class="btn small" id="btn-chars">${jpLabel('武者', 'Characters')}<span class="key"> [C]</span></button>
          <button class="btn small" id="btn-ladder">${jpLabel('番付', 'Ladder')}<span class="key"> [L]</span></button>
          <button class="btn small" id="btn-help">${jpLabel('心得', 'Help')}<span class="key"> [H]</span></button>
          <button class="btn small danger hidden" id="btn-forfeit">${jpLabel('降参', 'Forfeit')}</button>
          <div class="queue-panel hidden">
            <div class="queue-jp">対戦相手探索中</div>
            <div class="queue-title">${offline ? 'Finding an opponent near your rating…' : 'Searching for a ranked duel…'}</div>
            <div class="queue-time">0:00</div>
            <div class="queue-count"></div>
            <button class="btn small" id="btn-cancel">${jpLabel('取消', 'Cancel')}</button>
          </div>
          <div class="esc-hint hidden">Esc to free the cursor</div>
        </div>
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
          <input class="chat-input hidden" maxlength="140" placeholder="Say something… (Enter to send, Esc to cancel)" />
        </div>
        <div class="posture-main">
          <div class="pm-bar left"><div class="pm-fill"></div></div>
          <svg class="pm-shield" viewBox="0 0 32 38" aria-hidden="true">
            <path class="pm-shield-body" d="M16 1 L30 6 V17 C30 27 23 33 16 37 C9 33 2 27 2 17 V6 Z" />
            <path class="pm-shield-line" d="M16 6 V32" />
            <path class="pm-crack" d="M9 7 L13 15 L8 21 L12 29 M23 9 L19 17 L24 24" />
          </svg>
          <div class="pm-bar right"><div class="pm-fill"></div></div>
        </div>
        <div class="posture-main foe hidden">
          <div class="pm-bar left"><div class="pm-fill"></div></div>
          <svg class="pm-shield" viewBox="0 0 32 38" aria-hidden="true">
            <path class="pm-shield-body" d="M16 1 L30 6 V17 C30 27 23 33 16 37 C9 33 2 27 2 17 V6 Z" />
            <path class="pm-shield-line" d="M16 6 V32" />
            <path class="pm-crack" d="M9 7 L13 15 L8 21 L12 29 M23 9 L19 17 L24 24" />
          </svg>
          <div class="pm-bar right"><div class="pm-fill"></div></div>
        </div>
        <div class="hints left">
          <div class="hint" id="h-dodge"><kbd>Shift</kbd><span class="h-label">Dodge</span><span class="h-cd"></span></div>
          <div class="hint" id="h-jump"><kbd>Space</kbd><span class="h-label">Jump</span></div>
          <div class="hint" id="h-special"><kbd>E</kbd><span class="h-label"></span><span class="h-cd"></span></div>
          <div class="hint" id="h-ability"><kbd>R</kbd><span class="h-label"></span><span class="h-cd"></span></div>
        </div>
        <div class="hints right">
          <div class="hint"><span class="h-label">Parry / (Hold) Block</span><kbd>F</kbd></div>
          <div class="hint"><span class="h-label">Light / Heavy</span><kbd>M1</kbd><kbd>M2</kbd></div>
          <div class="hint"><span class="h-label">Lock on</span><kbd>Tab</kbd></div>
        </div>
        <div class="click-hint hidden">Click the game to capture the mouse</div>
        <div class="rotate-hint">Turn your device sideways to play</div>
      </div>`);
    this.root.appendChild(this.hud);
    this.lobbyBar = new LobbyBar(this.hud, {
      onPractice: (d) => this.handlers.onPractice(d),
      onRanked: () => this.handlers.onRanked(),
      onCancelQueue: () => this.handlers.onCancelQueue(),
      onFighters: () => this.toggleModal('chars'),
      onLadder: () => this.toggleModal('ladder'),
      onHelp: () => this.toggleModal('help'),
      onSettings: () => {
        this.openModal('help');
        this.modal.querySelector('.settings')?.scrollIntoView({ block: 'center' });
      },
      portrait: (id) => this.handlers.portrait(id),
    }, offline);
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
    })) {
      this.els[k] = q(sel);
    }

    q('#btn-ranked').addEventListener('click', () => this.handlers.onRanked());
    q('#btn-practice').addEventListener('click', () => this.handlers.onPractice(q<HTMLSelectElement>('#practice-diff').value as BotDifficulty));
    q('#btn-cancel').addEventListener('click', () => this.handlers.onCancelQueue());
    q('#btn-chars').addEventListener('click', () => this.toggleModal('chars'));
    q('#btn-ladder').addEventListener('click', () => this.toggleModal('ladder'));
    q('#btn-help').addEventListener('click', () => this.toggleModal('help'));
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
        forfeit.innerHTML = jpLabel('降参', 'Forfeit');
        this.handlers.onForfeit();
        return;
      }
      armedUntil = performance.now() + 3000;
      forfeit.innerHTML = jpLabel('降参', this.touch ? 'Tap again to forfeit' : 'Click again to forfeit');
      setTimeout(() => {
        if (performance.now() >= armedUntil) forfeit.innerHTML = jpLabel('降参', 'Forfeit');
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
    // touch keyboards have no Escape: tapping away closes the chat
    this.chatInput.addEventListener('blur', () => {
      if (this.touch && this.chatOpen) this.closeChat();
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
  }

  /** Small, dim connection line: players online, round-trip time, fps. */
  setNetInfo(online: number, rtt: number | null, fps: number | null): void {
    const parts = [this.offline ? 'Single player' : `${online} online`];
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

  /** The same bar above the opponent's head (null hides it). */
  setBrokenMark(at: { x: number; y: number } | null): void {
    let el = this.hud.querySelector<HTMLElement>('.broken-mark');
    if (!el) {
      el = document.createElement('div');
      el.className = 'broken-mark hidden';
      el.innerHTML = '<i></i><i></i>';
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
    this.els.timer.classList.toggle('hidden', !m);
    this.els.round.classList.toggle('hidden', !m);
    if (!m) return;
    let secs = 0;
    if (m.phase === 'fight') secs = Math.max(0, Math.ceil((m.endsAt - serverNow) / 1000));
    this.setText(this.els.round, `Round ${m.round}`);
    this.setText(this.els.timer, m.phase === 'fight' ? (secs >= 100 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : String(secs)) : '—');
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
    const el = h(`<div class="toast ${kind}">${esc(text)}</div>`);
    this.toastBox.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }

  killFeed(killer: string, victim: string, how: string): void {
    const el = h(`<div class="feed-row">${killer ? `<b>${esc(killer)}</b> ` : ''}<span class="muted">${esc(how)}</span> <b>${esc(victim)}</b></div>`);
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

  showChallenge(from: string, name: string, char: CharacterId): void {
    this.challengeFrom = from;
    const el = this.els.challenge;
    el.innerHTML = `<div class="ch-seal" aria-hidden="true">挑</div><div class="ch-head">挑戦状 · A challenge</div>
      <div><b>${esc(name)}</b> (${CHARACTERS[char].name}) challenges you to a duel!</div>
      <div class="row"><button class="btn small" data-a="1">${jpLabel('受', 'Accept')}<span class="key"> [Y]</span></button><button class="btn small danger" data-a="0">${jpLabel('断', 'Decline')}<span class="key"> [N]</span></button></div>`;
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

  toggleModal(kind: 'chars' | 'ladder' | 'help'): void {
    if (this.modalOpen === kind) this.closeModal();
    else this.openModal(kind);
  }

  closeModal(): void {
    if (!this.modalOpen) return;
    this.modalOpen = null;
    this.modal.classList.add('hidden');
    this.preview?.dispose();
    this.preview = null;
    this.modal.innerHTML = '';
    this.handlers.onModalChange(false);
  }

  private frame(title: string, body: string, wide = false, kanji = ''): void {
    this.preview?.dispose();
    this.preview = null;
    this.modal.innerHTML = `<div class="modal-box ${wide ? 'wide' : ''}"><div class="modal-head"><h2>${kanji ? `<span class="mk">${kanji}</span>` : ''}${title}</h2><button class="btn small close">✕<span class="key"> Esc</span></button></div><div class="modal-body">${body}</div></div>`;
    this.modal.classList.remove('hidden');
    this.modal.querySelector('.close')!.addEventListener('click', () => this.closeModal());
  }

  openModal(kind: 'chars' | 'ladder' | 'help', currentChar: CharacterId = settings.char): void {
    this.modalOpen = kind;
    this.handlers.onModalChange(true);
    if (kind === 'chars') this.renderChars(currentChar);
    else if (kind === 'ladder') {
      this.frame('Ranked Ladder', `<div class="ladder">Loading…</div>`, false, '番付');
      this.handlers.onLeaderboard();
    } else this.renderHelp();
  }

  private renderChars(selected: CharacterId): void {
    const cards = CHARACTER_IDS.map((id) => {
      const c = CHARACTERS[id];
      return `<button class="char-card ${id === selected ? 'sel' : ''}" data-id="${id}" style="--c1:${c.palette.primary};--c2:${c.palette.accent}">
        <div class="cc-swatch"></div><span class="cc-jp" aria-hidden="true">${c.jp}</span><div class="cc-name">${c.name}</div><div class="cc-weapon">${c.weapon}</div></button>`;
    }).join('');
    this.frame('Choose your fighter', `<div class="char-select"><div class="char-grid">${cards}</div><div class="char-detail"></div></div>`, true, '武者');
    const detail = this.modal.querySelector<HTMLElement>('.char-detail')!;
    const show = (id: CharacterId) => {
      const c = CHARACTERS[id];
      const bar = (label: string, v: number) => `<div class="rating"><span>${label}</span><div>${'<i class="on"></i>'.repeat(v)}${'<i></i>'.repeat(5 - v)}</div></div>`;
      const atkRow = (name: string, dmg: number, extra = '') => `<li><b>${esc(name)}</b> <span class="muted">${dmg} dmg${extra}</span></li>`;
      detail.innerHTML = `
        <div class="cd-top">
          <div class="cd-preview"></div>
          <div class="cd-info">
            <h3><span class="cd-jp">${c.jp}</span>${c.name} <span class="muted">· ${c.weapon}</span></h3>
            <div class="role">${c.role}</div>
            <p>${esc(c.description)}</p>
            <div class="cd-stats">HP ${c.stats.hp} · Posture ${c.stats.posture} · Speed ${c.stats.speed}</div>
            ${bar('Power', c.ratings.power)}${bar('Speed', c.ratings.speed)}${bar('Reach', c.ratings.reach)}${bar('Defense', c.ratings.defense)}${bar('Difficulty', c.ratings.difficulty)}
          </div>
        </div>
        <div class="moves">
          <div><h4>Light chain [LMB ×3]</h4><ul>${c.lights.map((l) => atkRow(l.name, l.damage * (l.hits ?? 1))).join('')}</ul>
            <h4>Heavy chain [RMB ×3]</h4><ul>${[c.heavy, c.extra.h1, c.extra.h2].map((h, i) => atkRow(h.name, h.damage * (h.hits ?? 1), i === 0 && h.feintable ? ' · feint with F' : '')).join('')}</ul></div>
          <div><h4>Dash [dodge forward, then LMB / RMB]</h4><ul>${atkRow(c.extra.dl.name, c.extra.dl.damage * (c.extra.dl.hits ?? 1))}${atkRow(c.extra.dh.name, c.extra.dh.damage)}</ul>
            <h4>Backstep [walk away + LMB / RMB]</h4><ul>${atkRow(c.extra.bl.name, c.extra.bl.damage)}${atkRow(c.extra.bh.name, c.extra.bh.damage)}</ul>
            <h4>Air [jump, then LMB / RMB]</h4><ul>${atkRow(c.extra.jl.name, c.extra.jl.damage)}${atkRow(c.extra.jh.name, c.extra.jh.damage)}</ul>
            <h4>Perilous [E]</h4><ul>${atkRow(c.special.name, c.special.damage, ` · ${c.special.cooldown / 1000}s`)}<li class="tip">${PERILOUS_TIP[c.special.perilous!]}</li></ul></div>
          <div><h4>Ability [R] · ${c.ability.name}</h4><p>${esc(c.ability.description)} <span class="muted">(${c.ability.cooldown / 1000}s)</span></p>
            <h4>Passive · ${c.passive.name}</h4><p>${esc(c.passive.description)}</p></div>
        </div>
        <div class="cd-actions"><button class="btn big" id="pick-char">${jpLabel('選', `Play ${c.name}`)}</button><span class="muted">Switch characters inside the lobby safe zone.</span></div>`;
      detail.querySelector('#pick-char')!.addEventListener('click', () => {
        this.handlers.onSelectChar(id);
        this.closeModal();
      });
      const pv = detail.querySelector<HTMLElement>('.cd-preview')!;
      if (!this.preview) this.preview = this.handlers.createPreview(pv);
      else pv.appendChild(this.preview.el);
      this.preview.setChar(id);
    };
    this.modal.querySelectorAll<HTMLElement>('.char-card').forEach((b) =>
      b.addEventListener('click', () => {
        this.modal.querySelectorAll('.char-card').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        show(b.dataset.id as CharacterId);
      }),
    );
    show(selected);
  }

  showLeaderboard(entries: LeaderboardEntry[], you: number | null, total: number, me: ProfileView | null): void {
    if (this.modalOpen !== 'ladder') return;
    const box = this.modal.querySelector('.ladder');
    if (!box) return;
    const rows = entries
      .map((e, i) => {
        const r = rankOf(e.mmr, e.placements);
        const mine = me && e.name === me.name && e.mmr === me.mmr;
        return `<tr class="${mine ? 'mine' : ''}"><td>${i + 1}</td><td>${esc(e.name)}</td><td>${rankBadge(r, true)}</td><td>${e.mmr}</td><td>${e.wins}-${e.losses}</td></tr>`;
      })
      .join('');
    const tiers = TIERS.map((t) => `<span class="rank-badge small" style="--rank:${t.color}"><i></i>${t.name} ${t.min}+</span>`).join(' ');
    const meRank = me ? rankOf(me.mmr, me.placements) : null;
    box.innerHTML = `
      <div class="ladder-you">${me && meRank ? `You: ${rankBadge(meRank)} ${meRank.placed ? `${me.mmr} MMR · #${you ?? '?'} of ${total}` : `play ${PLACEMENT_MATCHES - me.placements} more ranked match(es) to place`}` : ''}</div>
      ${entries.length ? `<table><thead><tr><th>#</th><th>Name</th><th>Rank</th><th>MMR</th><th>W-L</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">Nobody has finished placements yet. Be the first!</p>'}
      <div class="tiers">${tiers}</div>
      <p class="muted">${
        this.offline
          ? 'Single player: you climb by beating AI opponents matched to your rating, and your record is saved in this browser. Run the game server to play ranked against other people.'
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
            <h4>Controls</h4>
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
              <tr><td>☰</td><td>Menu: ranked, practice, characters, ladder</td></tr>
            </table>`
                : ''
            }
            <table class="keys${this.touch ? ' hidden' : ''}">
              <tr><td>WASD</td><td>Move (Shift tap: dodge, hold: sprint)</td></tr>
              <tr><td>Mouse</td><td>Look / aim (click to capture; locked on, the camera holds still)</td></tr>
              <tr><td>LMB</td><td>Light attack, three in a row (after a forward dodge: dash attack; walking away: backstep attack; in the air: air attack)</td></tr>
              <tr><td>RMB</td><td>Heavy attack, three in a row, with the same dash, backstep and air versions (press F during windup to feint)</td></tr>
              <tr><td>F</td><td>Guard — tap right before a hit to DEFLECT</td></tr>
              <tr><td>Space</td><td>Jump (evades perilous sweeps)</td></tr>
              <tr><td>E</td><td>Perilous special (unblockable)</td></tr>
              <tr><td>R</td><td>Character ability</td></tr>
              <tr><td>Tab / Q / MMB</td><td>Lock on</td></tr>
              <tr><td>G</td><td>Challenge the player you're looking at</td></tr>
              <tr><td>K · P</td><td>Queue ranked · Practice vs bot</td></tr>
              <tr><td>C · L · H</td><td>Characters · Ladder · Help</td></tr>
              <tr><td>Esc</td><td>Free the cursor (to click menus)</td></tr>
              <tr><td>Enter</td><td>Chat</td></tr>
            </table>
          </div>
          <div>
            <h4>Posture & deflects</h4>
            <p>Every fighter has <b>health</b> and <b>posture</b>. Blocking a hit costs posture. <b>Deflecting</b> (pressing guard just before the hit lands) costs almost nothing and instead hammers the attacker's posture, staggering them for a free counter.</p>
            <p>When posture fills up you are <b>posture broken</b>: helpless for a moment, and the next hit is a <b>Deathblow</b> for ${40} damage. Posture recovers slowly, and only once you stop: not while you attack, dodge or reel, and not until a while after the last posture damage (faster while guarding, slower when hurt). After a break, the guard comes back whole.</p>
            <p>Mashing guard shrinks your deflect window. Read the swing, then commit.</p>
            <h4>Perilous attacks <span class="kanji">危</span></h4>
            <p>A red symbol means an unblockable attack: <b>Thrusts</b> must be deflected — or dodge <i>into</i> them for a Mikiri Counter. <b>Sweeps</b> must be jumped. <b>Grabs</b> must be dodged.</p>
          </div>
        </div>
        <h4>Cancels</h4>
        <p class="muted">What each attack can be cut short into, in its recovery. "On hit" needs the attack to connect (hit or blocked); "late" opens partway through.</p>
        ${cancelTable()}
        <h4>The lobby</h4>
        <p>You spawn in the shrine plaza (safe zone). Step outside and anyone can fight you. The training yard (east) has a passive dummy and a sparring dummy that swings at you — perfect for practising deflects.</p>
        <h4>Arenas</h4><ul class="maps">${maps}</ul>
        <h4>Settings</h4>
        <div class="settings">
          <label>Graphics <select id="set-gfx">${(['auto', 'low', 'medium', 'high', 'ultra'] as const).map((q) => `<option value="${q}" ${settings.graphics === q ? 'selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}</select></label>
          <label>${this.touch ? 'Look' : 'Mouse'} sensitivity <input type="range" min="0.2" max="3" step="0.1" id="set-sens" value="${settings.sensitivity}"><span id="set-sens-v">${settings.sensitivity}</span></label>
          <label>Volume <input type="range" min="0" max="1" step="0.05" id="set-vol" value="${settings.volume}"></label>
          <label><input type="checkbox" id="set-cue" ${settings.parryCue ? 'checked' : ''}> Weapon glint before a hit lands</label>
          <label><input type="checkbox" id="set-inv" ${settings.invertY ? 'checked' : ''}> Invert ${this.touch ? 'look' : 'mouse'} Y</label>
          <label><input type="checkbox" id="set-shake" ${settings.reduceShake ? 'checked' : ''}> Reduce camera shake</label>
          <label><input type="checkbox" id="set-fps" ${settings.showFps ? 'checked' : ''}> Show FPS</label>
        </div>
      </div>`,
      true,
      '心得',
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
    bind('#set-cue', (el) => (settings.parryCue = el.checked));
    bind('#set-inv', (el) => (settings.invertY = el.checked));
    bind('#set-shake', (el) => (settings.reduceShake = el.checked));
    bind('#set-fps', (el) => (settings.showFps = el.checked));
  }

  // ------------------------------------------------------------------ match screens

  matchIntro(mode: MatchMode, mapId: string, players: [RosterEntry, RosterEntry], you: 0 | 1): void {
    const map = MAPS[mapId];
    const title = mode === 'ranked' ? 'Ranked duel' : mode === 'practice' ? 'Practice duel' : 'Duel';
    const titleJp = mode === 'ranked' ? '段位戦' : mode === 'practice' ? '稽古' : '決闘';
    const card = (r: RosterEntry, mine: boolean) => {
      const c = CHARACTERS[r.char];
      const rank = r.mmr !== undefined ? rankBadge(rankOf(r.mmr, r.placements ?? 0), true) : '<span class="muted">AI</span>';
      return `<div class="vs-card ${mine ? 'mine' : ''}" style="--c1:${c.palette.primary};--c2:${c.palette.accent}"><span class="vs-jp" aria-hidden="true">${c.jp}</span><div class="vs-char">${c.name}</div><div class="vs-weapon">${c.weapon}</div><div class="vs-name">${esc(r.name)}</div>${rank}</div>`;
    };
    const el = h(`<div class="match-intro"><div class="mi-mode"><span class="jp">${titleJp}</span>${title}</div><div class="mi-jp">${map?.jp ?? ''}</div><div class="mi-map">${map?.name ?? ''}</div>
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
    this.hud.classList.toggle('cinematic', on);
  }

  showResult(r: Extract<ServerMsg, { t: 'result' }>, me: ProfileView | null): void {
    let ratingHtml = '';
    if (r.before && r.after && r.delta !== undefined) {
      const before = rankOf(r.before.mmr, r.before.placements);
      const after = rankOf(r.after.mmr, r.after.placements);
      // only talk about promotions once you're on the ladder (placement labels change every game)
      const changed = after.placed && before.label !== after.label;
      const promo = after.placed && (!before.placed || r.delta > 0);
      ratingHtml = `<div class="res-rating">
        <div class="res-delta ${r.delta >= 0 ? 'up' : 'down'}">${r.delta >= 0 ? '+' : ''}${r.delta} MMR</div>
        <div>${r.before.mmr} → <b>${r.after.mmr}</b></div>
        <div class="res-rank">${rankBadge(after)}</div>
        ${changed ? `<div class="res-promo ${promo ? 'up' : 'down'}">${!before.placed && after.placed ? 'PLACED!' : promo ? 'RANK UP!' : 'Demoted'}</div>` : ''}
        ${after.placed ? `<div class="pc-progress big"><div style="width:${Math.round(after.progress * 100)}%;background:${after.color}"></div></div>` : `<div class="muted">Placement ${r.after.placements}/${PLACEMENT_MATCHES}</div>`}
      </div>`;
    }
    const reason = r.reason === 'forfeit' ? (r.won ? 'Opponent forfeited' : 'You forfeited') : r.reason === 'timeout' ? 'Time' : '';
    const el = h(`<div class="result ${r.won ? 'win' : 'lose'}">
      <div class="res-jp">${r.won ? '勝利' : '敗北'}</div>
      <div class="res-title">${r.won ? 'VICTORY' : 'DEFEAT'}</div>
      <div class="res-score">${r.scores.join(' - ')}${reason ? ` · ${reason}` : ''}</div>
      ${ratingHtml}
      <div class="muted">Returning to the lobby…</div></div>`);
    void me;
    this.hud.appendChild(el);
    setTimeout(() => el.classList.add('out'), 6300);
    setTimeout(() => el.remove(), 7000);
  }
}
