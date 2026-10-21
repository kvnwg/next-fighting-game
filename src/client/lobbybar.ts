/**
 * The lobby's bottom bar, laid out like the reference: your fighter's portrait beside a big PLAY
 * button, and a row of illustrated icons under it (Fighters, Ladder, Help, Settings). PLAY opens
 * the mode panel: Casual practice against a bot of your chosen difficulty, or a Ranked duel; while
 * the panel is open PLAY turns into CLOSE, and while you're queued it shows the search and cancels it.
 */
import type { BotDifficulty } from '../shared/protocol';
import type { CharacterId } from '../shared/characters';
import bamboo from './assets/maps/bamboo.jpg';
import forge from './assets/maps/forge.jpg';

export interface LobbyBarHandlers {
  onPractice(diff: BotDifficulty): void;
  onRanked(): void;
  onCancelQueue(): void;
  onFighters(): void;
  onLadder(): void;
  onHelp(): void;
  onSettings(): void;
  portrait(id: CharacterId): string;
}

// Hand-drawn icons: flat colour with a dark ink outline, a lit edge and a soft shadow, each on a
// dark disc like the reference's.
const INK = '#16121a';
const ICONS = {
  // a katana crossed over a warhammer
  fighters: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="34" cy="36" r="22" fill="#1d1a22" opacity=".85"/>
    <g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
      <path d="M15 52 L41 18" stroke="#6b4a2a" stroke-width="5"/>
      <path d="M15 52 L41 18" stroke="${INK}" stroke-width="8" opacity=".35"/>
      <path d="M15 52 L41 18" stroke="#8a5f34" stroke-width="4.4"/>
      <rect x="32" y="6" width="22" height="15" rx="2.5" transform="rotate(37 43 13.5)" fill="#8c8f96"/>
      <path d="M36 9.5 L52 21.5" stroke="#c9ccd2" stroke-width="2"/>
      <rect x="40.5" y="9" width="4" height="15" transform="rotate(37 42.5 16.5)" fill="#d8b45a"/>
      <path d="M50 52 L19 12" stroke="#e9eef4" stroke-width="5"/>
      <path d="M50 52 L19 12" stroke="#ffffff" stroke-width="1.6"/>
      <path d="M44 44 L53 37" stroke="#d8b45a" stroke-width="4"/>
      <path d="M49 49 L56 58" stroke="#2a2230" stroke-width="5.5"/>
      <path d="M50.5 51 L52.5 53.5 M53 54 L55 56.5" stroke="#e8323c" stroke-width="1.6"/>
    </g>
  </svg>`,
  // a gold trophy cup with a red ribbon
  ladder: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="36" r="22" fill="#1d1a22" opacity=".85"/>
    <g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round">
      <path d="M18 16 C8 16 9 30 21 31 M46 16 C56 16 55 30 43 31" fill="none" stroke="#e0a830" stroke-width="4"/>
      <path d="M18 16 C8 16 9 30 21 31 M46 16 C56 16 55 30 43 31" fill="none"/>
      <path d="M17 10 H47 V22 C47 33 40 39 32 39 C24 39 17 33 17 22 Z" fill="#f2c14e"/>
      <path d="M22 13 V22 C22 29 26 33 30 34" fill="none" stroke="#ffe9a0" stroke-width="2.4"/>
      <path d="M28 39 H36 L37 46 H27 Z" fill="#d89a2a"/>
      <rect x="20" y="46" width="24" height="8" rx="1.5" fill="#7a2a1c"/>
      <path d="M24 49.5 H40" stroke="#f2c14e" stroke-width="2"/>
      <path d="M32 16 L34 21 L39 21 L35 24 L36.5 29 L32 26 L27.5 29 L29 24 L25 21 L30 21 Z" fill="#fff3c4" stroke-width="1.4"/>
    </g>
  </svg>`,
  // an open scroll with brush strokes
  help: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="36" r="22" fill="#1d1a22" opacity=".85"/>
    <g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
      <path d="M14 14 H50 V48 H14 Z" fill="#efe4cf"/>
      <path d="M17 17 H47" stroke="#fffaf0" stroke-width="2"/>
      <rect x="9" y="10" width="7" height="44" rx="3.5" fill="#8a3a22"/>
      <rect x="48" y="10" width="7" height="44" rx="3.5" fill="#8a3a22"/>
      <path d="M12.5 10 V54 M51.5 10 V54" stroke="#c8643a" stroke-width="1.6"/>
      <path d="M22 22 C27 20 31 24 36 21 M22 29 C28 27 33 31 41 28 M22 36 C27 34 30 38 37 35" fill="none" stroke="#1a1418" stroke-width="2.6"/>
      <circle cx="40" cy="42" r="4.5" fill="#c8202a" stroke-width="1.6"/>
    </g>
  </svg>`,
  // a steel gear with a wrench through it
  settings: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="36" r="22" fill="#1d1a22" opacity=".85"/>
    <g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
      <path d="M29 8 H35 L36.5 14 L41 15.8 L46 12.3 L50.3 16.6 L46.8 21.6 L48.6 26.1 L54.6 27.6 V33.6 L48.6 35.1 L46.8 39.6 L50.3 44.6 L46 48.9 L41 45.4 L36.5 47.2 L35 53.2 H29 L27.5 47.2 L23 45.4 L18 48.9 L13.7 44.6 L17.2 39.6 L15.4 35.1 L9.4 33.6 V27.6 L15.4 26.1 L17.2 21.6 L13.7 16.6 L18 12.3 L23 15.8 L27.5 14 Z" fill="#a8adb6"/>
      <path d="M22 18 C26 15 31 14 36 15" fill="none" stroke="#e4e8ee" stroke-width="2"/>
      <circle cx="32" cy="30.6" r="8" fill="#3a3c44"/>
      <path d="M40 42 L55 57" stroke="#d8b45a" stroke-width="6"/>
      <path d="M40 42 L55 57" stroke="${INK}" stroke-width="1" opacity=".5"/>
      <path d="M36 36 C33 40 36 45 41 44 L44 41 L41 38 L42.5 36.5 L45.5 39.5 L48.5 36.5 C49.5 31.5 44.5 28.5 40.5 31.5 Z" fill="#c9ccd2"/>
    </g>
  </svg>`,
};

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export class LobbyBar {
  readonly el: HTMLElement;
  readonly panel: HTMLElement;
  private play: HTMLButtonElement;
  private portraitImg: HTMLImageElement;
  private diff: BotDifficulty = 'normal';
  private queued = false;
  private shownChar: CharacterId | null = null;

  constructor(
    parent: HTMLElement,
    private readonly h: LobbyBarHandlers,
    offline: boolean,
  ) {
    const icon = (id: string, svg: string, label: string, key: string) =>
      `<button class="lb-icon" id="lb-${id}" title="${esc(label)} [${key}]">${svg}<span>${esc(label)}</span></button>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="lobby-bar">
        <div class="lb-row">
          <img class="lb-portrait" alt="" draggable="false">
          <button class="lb-play" id="lb-play"><span class="lb-play-text">Play</span></button>
        </div>
        <div class="lb-icons">
          ${icon('fighters', ICONS.fighters, 'Fighters', 'C')}
          ${icon('ladder', ICONS.ladder, 'Ladder', 'L')}
          ${icon('help', ICONS.help, 'Help', 'H')}
          ${icon('settings', ICONS.settings, 'Settings', 'H')}
        </div>
      </div>
      <div class="mode-panel hidden">
        <div class="mp-col casual">
          <div class="mp-head">Casual</div>
          <button class="mp-card" id="mp-practice">
            <img src="${bamboo}" alt="" draggable="false">
            <span class="mp-diff">
              <i data-diff="easy">Easy</i><i data-diff="normal" class="on">Normal</i><i data-diff="hard">Hard</i>
            </span>
            <span class="mp-small">1v1</span><span class="mp-big">Practice</span><span class="mp-sub">Unranked, against a bot</span>
          </button>
        </div>
        <div class="mp-col ranked">
          <div class="mp-head">Ranked</div>
          <button class="mp-card ranked" id="mp-ranked">
            <img src="${forge}" alt="" draggable="false">
            <span class="mp-small">1v1</span><span class="mp-big">Duel</span><span class="mp-sub">${offline ? 'Against an AI near your rating' : 'Matched by rating'}</span>
          </button>
        </div>
      </div>`;
    this.el = wrap.firstElementChild as HTMLElement;
    this.panel = wrap.lastElementChild as HTMLElement;
    parent.append(this.panel, this.el);
    this.play = this.el.querySelector('#lb-play')!;
    this.portraitImg = this.el.querySelector('.lb-portrait')!;

    this.play.addEventListener('click', () => {
      if (this.queued) this.h.onCancelQueue();
      else this.setPanel(!this.isOpen);
    });
    const on = (sel: string, f: () => void) => this.el.querySelector(sel)!.addEventListener('click', f);
    on('#lb-fighters', () => this.h.onFighters());
    on('#lb-ladder', () => this.h.onLadder());
    on('#lb-help', () => this.h.onHelp());
    on('#lb-settings', () => this.h.onSettings());
    for (const chip of this.panel.querySelectorAll<HTMLElement>('[data-diff]')) {
      chip.addEventListener('click', (e) => {
        // picking a difficulty doesn't start the match: the card does
        e.stopPropagation();
        this.diff = chip.dataset.diff as BotDifficulty;
        for (const c of this.panel.querySelectorAll('[data-diff]')) c.classList.toggle('on', c === chip);
      });
    }
    this.panel.querySelector('#mp-practice')!.addEventListener('click', () => {
      this.setPanel(false);
      this.h.onPractice(this.diff);
    });
    this.panel.querySelector('#mp-ranked')!.addEventListener('click', () => {
      this.setPanel(false);
      this.h.onRanked();
    });
    // a tap on the dim backdrop closes it
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.setPanel(false);
    });
  }

  get isOpen(): boolean {
    return !this.panel.classList.contains('hidden');
  }

  get difficulty(): BotDifficulty {
    return this.diff;
  }

  setPanel(open: boolean): void {
    this.panel.classList.toggle('hidden', !open);
    this.syncPlay();
  }

  /** Only in the lobby. */
  setVisible(on: boolean): void {
    this.el.classList.toggle('hidden', !on);
    if (!on) this.setPanel(false);
  }

  setChar(id: CharacterId): void {
    if (id === this.shownChar) return;
    this.shownChar = id;
    this.portraitImg.src = this.h.portrait(id);
  }

  /** While queued, PLAY shows the search and cancels it. */
  setQueue(searching: boolean, seconds: number): void {
    this.queued = searching;
    if (searching) this.setPanel(false);
    this.syncPlay(seconds);
  }

  private syncPlay(seconds = 0): void {
    const text = this.play.querySelector('.lb-play-text')!;
    this.play.classList.toggle('close', this.isOpen);
    this.play.classList.toggle('searching', this.queued);
    text.textContent = this.queued ? `Searching ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : this.isOpen ? 'Close' : 'Play';
  }
}
