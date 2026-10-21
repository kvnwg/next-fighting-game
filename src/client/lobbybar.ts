/**
 * The lobby's bottom bar, laid out like the reference: your fighter's portrait beside a big PLAY
 * button, and a row of pixel-art icons under it (Fighters, Ladder, Help, Settings). PLAY opens
 * the mode panel: Casual practice against a bot of your chosen difficulty, or a Ranked duel; while
 * the panel is open PLAY turns into CLOSE, and while you're queued it shows the search and cancels it.
 */
import type { BotDifficulty } from '../shared/protocol';
import { CHARACTERS, type CharacterId } from '../shared/characters';
import { icon } from './pixelicons';
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

// pixel-art icons in the shared style (see pixelicons.ts)
const ICONS = {
  fighters: icon('fighters'),
  ladder: icon('ladder'),
  help: icon('help'),
  settings: icon('settings'),
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
    const tile = (id: string, svg: string, label: string, key: string) =>
      `<button class="lb-icon" id="lb-${id}" title="${esc(label)} [${key}]">${svg}<span>${esc(label)}</span></button>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="lobby-bar">
        <div class="lb-row">
          <span class="lb-portrait"><img alt="" draggable="false"></span>
          <button class="lb-play" id="lb-play"><span class="lb-play-ico">${icon('swords')}</span><span class="lb-play-text">Play</span></button>
        </div>
        <div class="lb-icons">
          ${tile('fighters', ICONS.fighters, 'Fighters', 'C')}
          ${tile('ladder', ICONS.ladder, 'Ladder', 'L')}
          ${tile('help', ICONS.help, 'Help', 'H')}
          ${tile('settings', ICONS.settings, 'Settings', 'H')}
        </div>
      </div>
      <div class="mode-panel hidden">
        <div class="mp-col casual">
          <div class="mp-head">${icon('dummy')}Casual</div>
          <button class="mp-card" id="mp-practice">
            <img src="${bamboo}" alt="" draggable="false">
            <span class="mp-diff">
              <i data-diff="easy"><b>${icon('skull')}</b>Easy</i><i data-diff="normal" class="on"><b>${icon('skull')}${icon('skull')}</b>Normal</i><i data-diff="hard"><b>${icon('skull')}${icon('skull')}${icon('skull')}</b>Hard</i>
            </span>
            <span class="mp-small">1v1</span><span class="mp-big">Practice</span><span class="mp-sub">Unranked, against a bot</span>
          </button>
        </div>
        <div class="mp-col ranked">
          <div class="mp-head">${icon('crown')}Ranked</div>
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
    this.portraitImg = this.el.querySelector('.lb-portrait img')!;

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
    (this.portraitImg.parentElement as HTMLElement).style.setProperty('--accent', CHARACTERS[id].palette.accent);
  }

  /** While queued, PLAY shows the search and cancels it. */
  setQueue(searching: boolean, seconds: number): void {
    this.queued = searching;
    if (searching) this.setPanel(false);
    this.syncPlay(seconds);
  }

  private syncPlay(seconds = 0): void {
    const text = this.play.querySelector('.lb-play-text')!;
    const ico = this.play.querySelector('.lb-play-ico')!;
    const want = this.queued ? 'hourglass' : this.isOpen ? 'close' : 'swords';
    if (ico.getAttribute('data-i') !== want) {
      ico.setAttribute('data-i', want);
      ico.innerHTML = icon(want);
    }
    this.play.classList.toggle('close', this.isOpen);
    this.play.classList.toggle('searching', this.queued);
    text.textContent = this.queued ? `Searching ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : this.isOpen ? 'Close' : 'Play';
  }
}
