/**
 * The map and fighter select before a match, laid out like the reference: a dark band across the
 * screen with the title and countdown over a grid of arenas (and Random), and the fighters in one
 * row of square cards along the bottom. Each side's picks carry their portrait badge, green for
 * you and red for the opponent; a pick both sides share turns gold.
 */
import { CHARACTERS, CHARACTER_IDS, CharacterId } from '../shared/characters';
import { MAPS } from '../shared/maps';
import type { SelectView } from '../shared/protocol';
import bamboo from './assets/maps/bamboo.jpg';
import bridge from './assets/maps/bridge.jpg';
import forge from './assets/maps/forge.jpg';
import ruins from './assets/maps/ruins.jpg';
import sakura from './assets/maps/sakura.jpg';
import summit from './assets/maps/summit.jpg';

/** Arena thumbnails, rendered from each map (see the viewer's map mode). */
const THUMBS: Record<string, string> = { sakura, bamboo, summit, forge, bridge, ruins };

export interface SelectVote {
  map?: string;
  char?: CharacterId;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export class SelectScreen {
  private el: HTMLElement | null = null;
  private view: SelectView | null = null;
  private count: HTMLElement | null = null;
  private lastSecs = -1;

  constructor(
    private readonly parent: HTMLElement,
    private readonly portrait: (id: CharacterId) => string,
    private readonly onVote: (v: SelectVote) => void,
  ) {}

  get open(): boolean {
    return !!this.el;
  }

  show(v: SelectView): void {
    if (!this.el) this.build(v);
    this.view = v;
    this.paint();
  }

  hide(): void {
    this.parent.classList.remove('selecting');
    this.el?.remove();
    this.el = null;
    this.view = null;
    this.count = null;
    this.lastSecs = -1;
  }

  /** Counts the vote down; returns the seconds left when the number changes (for a tick sound). */
  tick(serverNow: number): number | null {
    if (!this.view || !this.count) return null;
    const secs = Math.max(0, Math.ceil((this.view.endsAt - serverNow) / 1000));
    if (secs === this.lastSecs) return null;
    this.lastSecs = secs;
    this.count.textContent = String(secs);
    this.count.classList.toggle('urgent', secs <= 3);
    return secs;
  }

  private build(v: SelectView): void {
    const mapTile = (id: string) => {
      const m = MAPS[id];
      const art = THUMBS[id] ? `<img class="sel-art" src="${THUMBS[id]}" alt="" draggable="false">` : '';
      return `<button class="sel-tile" data-map="${id}">${art}<span class="sel-jp">${esc(m?.jp ?? '')}</span><span class="sel-label">${esc(m?.name ?? id)}</span><span class="sel-badges"></span></button>`;
    };
    const random = `<button class="sel-tile random" data-map="random"><svg class="sel-random" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/></svg><span class="sel-label">Random</span><span class="sel-badges"></span></button>`;
    const charCard = (id: CharacterId) => {
      const c = CHARACTERS[id];
      return `<button class="sel-card" data-char="${id}" title="${esc(`${c.name} · ${c.weapon}`)}"><img class="sel-art" src="${this.portrait(id)}" alt="" draggable="false"><span class="sel-jp">${c.jp}</span><span class="sel-label">${esc(c.name)}</span><span class="sel-badges"></span></button>`;
    };
    const el = document.createElement('div');
    el.className = 'select-screen';
    el.innerHTML = `
      <div class="sel-band">
        <h2 class="sel-title"><span class="jp">選択</span>Select Map &amp; Fighter</h2>
        <div class="sel-count"></div>
        <div class="sel-maps">${random}${v.maps.map(mapTile).join('')}</div>
      </div>
      <div class="sel-chars">${CHARACTER_IDS.map(charCard).join('')}</div>`;
    for (const t of el.querySelectorAll<HTMLElement>('[data-map]')) t.addEventListener('click', () => this.onVote({ map: t.dataset.map }));
    for (const t of el.querySelectorAll<HTMLElement>('[data-char]')) t.addEventListener('click', () => this.onVote({ char: t.dataset.char as CharacterId }));
    this.parent.appendChild(el);
    this.parent.classList.add('selecting');
    this.el = el;
    this.count = el.querySelector('.sel-count');
  }

  /** Borders and voter badges for the current picks. */
  private paint(): void {
    const v = this.view;
    if (!v || !this.el) return;
    const me = v.you;
    const them = me === 0 ? 1 : 0;
    const badge = (side: 0 | 1) => {
      const s = v.sides[side];
      const char = v.votes.char[side] ?? s.char;
      const label = side === me ? '<b>You</b>' : '';
      return `<span class="sel-badge ${side === me ? 'mine' : 'theirs'}" title="${esc(s.name)}"><img src="${this.portrait(char)}" alt="">${label}</span>`;
    };
    const mark = (tile: HTMLElement, mine: boolean, theirs: boolean) => {
      tile.classList.toggle('mine', mine);
      tile.classList.toggle('theirs', theirs);
      const html = (mine ? badge(me) : '') + (theirs ? badge(them) : '');
      const box = tile.querySelector('.sel-badges')!;
      if (box.innerHTML !== html) box.innerHTML = html;
    };
    for (const t of this.el.querySelectorAll<HTMLElement>('[data-map]')) {
      mark(t, v.votes.map[me] === t.dataset.map, v.votes.map[them] === t.dataset.map);
    }
    for (const t of this.el.querySelectorAll<HTMLElement>('[data-char]')) {
      const id = t.dataset.char;
      mark(t, (v.votes.char[me] ?? v.sides[me].char) === id, (v.votes.char[them] ?? (v.sides[them].bot ? null : v.sides[them].char)) === id);
    }
  }
}
