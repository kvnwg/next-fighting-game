import { MAPS, MAP_IDS, WEAPONS, WEAPON_IDS, type MapId, type PlayerInfo, type WeaponId } from '@nfg/shared';
import { PALETTES } from '../render/arena.ts';
import { avatarHtml } from './hud.ts';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const TORII = `<svg viewBox="0 0 100 60" preserveAspectRatio="xMidYMax meet" style="position:absolute;inset:auto 0 0 0;width:100%;height:70%;opacity:.85">
  <rect x="20" y="16" width="5" height="44" fill="#0a0a10"/><rect x="75" y="16" width="5" height="44" fill="#0a0a10"/>
  <rect x="10" y="10" width="80" height="6" fill="#0a0a10"/><rect x="16" y="22" width="68" height="4" fill="#0a0a10"/></svg>`;

/** Fighter portraits, rendered from the voxel models by tools/voxel/render-portraits.mjs. */
const portrait = (id: WeaponId) => `<img class="portrait" src="fighters/${id}.png" alt="" draggable="false">`;

function mapArt(id: MapId): string {
  const p = PALETTES[id];
  return `<div class="art" style="background:linear-gradient(180deg, ${hex(p.skyTop)} 0%, ${hex(p.skyHorizon)} 58%, ${hex(p.stone)} 59%, ${hex(p.stoneLine)} 100%)">${TORII}</div>`;
}

export interface LobbyHandlers {
  quick(): void;
  bot(): void;
  invite(): void;
  cancel(): void;
}

/**
 * The practice-arena bar: quick match, bot match and invite are equally prominent.
 * Builds without a match server show only the bot match.
 */
export class LobbyBar {
  readonly root: HTMLElement;
  private status: HTMLElement;
  private quickBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private logo: HTMLElement;

  constructor(ui: HTMLElement, h: LobbyHandlers, online: boolean) {
    this.logo = el('div', 'logo', 'SHRINE <span>DUEL</span>');
    this.root = el('div', online ? 'lobby-bar panel' : 'lobby-bar panel offline');
    this.quickBtn = el('button', 'btn primary', 'Quick Match');
    const bot = el('button', 'btn', 'Play vs Bot');
    const invite = el('button', 'btn', 'Invite a Friend');
    this.cancelBtn = el('button', 'btn ghost', 'Cancel');
    this.status = el('div', 'lobby-status', 'Practice: hit the dummy, or start a match');
    this.quickBtn.onclick = h.quick;
    bot.onclick = h.bot;
    invite.onclick = h.invite;
    this.cancelBtn.onclick = h.cancel;
    this.cancelBtn.style.display = 'none';
    this.root.append(...(online ? [this.quickBtn, bot, invite] : [bot]), this.status, this.cancelBtn);
    ui.append(this.logo, this.root);
  }

  setStatus(text: string, searching: boolean): void {
    this.status.textContent = text;
    this.cancelBtn.style.display = searching ? '' : 'none';
    this.quickBtn.disabled = searching;
  }

  setVisible(visible: boolean): void {
    for (const e of [this.root, this.logo]) e.style.display = visible ? '' : 'none';
  }
}

/** The one menu button: a gear in the practice arena's corner, a pause button under the timer in a fight. */
export class MenuButton {
  private readonly root: HTMLButtonElement;
  private mode: 'hidden' | 'corner' | 'fight' = 'hidden';

  constructor(ui: HTMLElement, onClick: () => void) {
    this.root = el('button', 'menu-btn');
    this.root.onclick = onClick;
    ui.appendChild(this.root);
  }

  setMode(mode: 'hidden' | 'corner' | 'fight'): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.root.className = `menu-btn ${mode}`;
    this.root.innerHTML = mode === 'fight' ? '&#10074;&#10074;' : '&#9881;';
    this.root.setAttribute('aria-label', mode === 'fight' ? 'Pause' : 'Settings');
  }
}

/** Skippable controls overlay shown in the practice arena. */
export class ControlsCard {
  private root: HTMLElement | null = null;

  show(ui: HTMLElement, touch: boolean, onClose: () => void): void {
    this.hide();
    const rows = touch
      ? [
          ['Stick', 'Move'],
          ['LIGHT', 'Light chain (hold)'],
          ['HEAVY', 'Heavy (hold: critical)'],
          ['PARRY', 'Tap: parry, hold: block'],
          ['DODGE', 'Dodge (+ stick)'],
          ['JUMP', 'Jump'],
          ['Drag', 'Look around'],
          ['&#9881; / &#10074;&#10074;', 'Menu'],
        ]
      : [
          ['WASD', 'Move'],
          ['Click / J', 'Light chain'],
          ['R-Click / K', 'Heavy (hold: critical)'],
          ['F / L', 'Tap: parry, hold: block'],
          ['Shift', 'Dodge'],
          ['Space', 'Jump'],
          ['P', 'Menu'],
        ];
    const html = rows.map(([k, v]) => `<span class="k">${k}</span><span>${v}</span>`).join('');
    this.root = el('div', 'controls-card panel', `<h3>CONTROLS</h3>${html}<button class="btn close">Got it</button>`);
    this.root.querySelector<HTMLButtonElement>('.close')!.onclick = () => {
      this.hide();
      onClose();
    };
    ui.appendChild(this.root);
  }

  hide(): void {
    this.root?.remove();
    this.root = null;
  }

  get visible(): boolean {
    return this.root !== null;
  }
}

export interface VoteView {
  you: 0 | 1;
  players: [PlayerInfo, PlayerInfo];
  votes: { map: (MapId | null)[]; weapon: (WeaponId | null)[] };
  secondsLeft: number;
}

/** "Select Map & Fighter": shared map vote, personal fighter pick, picks shown live with avatars. */
export class VoteScreen {
  private root: HTMLElement | null = null;
  private count: HTMLElement | null = null;
  private lastCount = -1;

  show(ui: HTMLElement, view: VoteView, onVote: (v: { map?: MapId | 'random'; weapon?: WeaponId }) => void): void {
    this.hide();
    const mapTiles = [
      `<button class="tile" data-map="random"><div class="art" style="background:#1a1622;display:grid;place-items:center;font-size:calc(5*var(--u))">&#x21bb;</div><div class="label">Random</div><div class="badges"></div></button>`,
      ...MAP_IDS.map((id) => `<button class="tile" data-map="${id}">${mapArt(id)}<div class="label">${MAPS[id].name}</div><div class="badges"></div></button>`),
    ].join('');
    const weaponTiles = WEAPON_IDS.map(
      (id) =>
        `<button class="tile fighter" data-weapon="${id}" title="${WEAPONS[id].blurb}"><div class="art">${portrait(id)}</div><div class="sub">${WEAPONS[id].weapon}</div><div class="label">${WEAPONS[id].name}</div><div class="badges"></div></button>`,
    ).join('');
    this.root = el(
      'div',
      'screen dim',
      `<div class="vote panel"><h2>Select Map &amp; Fighter</h2><div class="count"></div>
        <div class="tiles maps">${mapTiles}</div><div class="tiles weapons">${weaponTiles}</div></div>`,
    );
    this.count = this.root.querySelector('.count');
    for (const t of this.root.querySelectorAll<HTMLElement>('[data-map]')) {
      t.onclick = () => onVote({ map: t.dataset.map as MapId | 'random' });
    }
    for (const t of this.root.querySelectorAll<HTMLElement>('[data-weapon]')) {
      t.onclick = () => onVote({ weapon: t.dataset.weapon as WeaponId });
    }
    ui.appendChild(this.root);
    this.lastCount = -1;
    this.update(view);
  }

  /** Returns true when the visible countdown number changed (for the tick sound). */
  update(view: VoteView): boolean {
    if (!this.root) return false;
    const seconds = Math.max(0, Math.ceil(view.secondsLeft));
    const changed = seconds !== this.lastCount;
    if (changed && this.count) {
      this.count.textContent = String(seconds);
      this.count.classList.toggle('urgent', seconds <= 3);
      this.lastCount = seconds;
    }
    const them = view.you === 0 ? 1 : 0;
    const paint = (selector: string, attr: 'map' | 'weapon') => {
      for (const t of this.root!.querySelectorAll<HTMLElement>(selector)) {
        const key = t.dataset[attr];
        const mine = view.votes[attr][view.you] === key;
        const theirs = view.votes[attr][them] === key;
        t.classList.toggle('mine', mine);
        t.classList.toggle('theirs', theirs);
        const badges = t.querySelector('.badges');
        if (!badges) continue;
        const html =
          (mine ? `<div class="badge">${avatarHtml(view.players[view.you], '#c9a21e')}<span class="you">You</span></div>` : '') +
          (theirs ? `<div class="badge theirs">${avatarHtml(view.players[them], '#a8346f')}</div>` : '');
        if (badges.innerHTML !== html) badges.innerHTML = html;
      }
    };
    paint('[data-map]', 'map');
    paint('[data-weapon]', 'weapon');
    return changed;
  }

  hide(): void {
    this.root?.remove();
    this.root = null;
  }
}

export class LoadingScreen {
  private root: HTMLElement | null = null;
  private rows: HTMLElement | null = null;

  show(ui: HTMLElement, mapId: MapId, mode: string, names: [string, string]): void {
    this.hide();
    this.root = el(
      'div',
      'screen',
      `<div class="loading"><div class="title">Loading World</div><div class="rows"></div>
        <div class="map">${MAPS[mapId].name}</div><div class="mode">${esc(mode)}</div></div>`,
    );
    this.rows = this.root.querySelector('.rows');
    this.root.dataset.names = JSON.stringify(names);
    ui.appendChild(this.root);
    this.setProgress([0, 0]);
  }

  setProgress(progress: number[]): void {
    if (!this.root || !this.rows) return;
    const names = JSON.parse(this.root.dataset.names!) as string[];
    this.rows.innerHTML = names.map((n, i) => `<div>${esc(n)} - ${Math.round((progress[i] ?? 0) * 100)}%</div>`).join('');
  }

  fadeOut(): void {
    const r = this.root;
    if (!r) return;
    this.root = null;
    r.classList.add('fade-out');
    setTimeout(() => r.remove(), 300);
  }

  hide(): void {
    this.root?.remove();
    this.root = null;
  }
}

/** Entrance name card: username, then title, then rank, revealed one step at a time. */
export class NameCard {
  private root: HTMLElement | null = null;

  show(ui: HTMLElement, p: PlayerInfo, rank: { tier: string; rating: string; mark: string }, skippable: boolean): void {
    this.hide();
    this.root = el(
      'div',
      '',
      `<div class="namecard"><div class="nc-title">${esc(p.title)}</div><div class="nc-name">${esc(p.name)}</div>
        <div class="nc-rank"><div class="nc-emblem"><span>${esc(rank.mark)}</span></div><div><div class="nc-tier">${esc(rank.tier)}</div><div class="nc-rating">${esc(rank.rating)}</div></div></div></div>
        ${skippable ? '<div class="skip-hint">Press any key or tap to skip</div>' : ''}`,
    );
    ui.appendChild(this.root);
    const card = this.root.querySelector('.namecard')!;
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('show')));
  }

  hide(): void {
    this.root?.remove();
    this.root = null;
  }
}

export interface ResultsHandlers {
  rematch(): void;
  leave(): void;
}

export class ResultsScreen {
  private root: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private rematchBtn: HTMLButtonElement | null = null;

  show(ui: HTMLElement, verdict: 'win' | 'lose' | 'draw', score: [number, number], h: ResultsHandlers): void {
    this.hide();
    const word = verdict === 'win' ? 'VICTORY' : verdict === 'lose' ? 'DEFEAT' : 'DRAW';
    this.root = el(
      'div',
      'screen dim',
      `<div class="results panel"><div class="verdict ${verdict}">${word}</div><div class="score">${score[0]} - ${score[1]}</div>
        <div class="row"><button class="btn primary rematch">Rematch</button><button class="btn leave">Back to Practice</button></div>
        <div class="status"></div></div>`,
    );
    this.statusEl = this.root.querySelector('.status');
    this.rematchBtn = this.root.querySelector('.rematch');
    this.rematchBtn!.onclick = h.rematch;
    this.root.querySelector<HTMLButtonElement>('.leave')!.onclick = h.leave;
    ui.appendChild(this.root);
  }

  setStatus(text: string, rematchEnabled = true): void {
    if (this.statusEl) this.statusEl.textContent = text;
    if (this.rematchBtn) this.rematchBtn.disabled = !rematchEnabled;
  }

  /** Blocks the buttons while an ad plays (CrazyGames: no progress during an ad). */
  setBlocked(blocked: boolean): void {
    for (const b of this.root?.querySelectorAll<HTMLButtonElement>('button') ?? []) b.disabled = blocked;
  }

  hide(): void {
    this.root?.remove();
    this.root = null;
  }
}

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  reduceEffects: boolean;
  lefty: boolean;
  quality: 'auto' | 'high' | 'medium' | 'low';
}

export interface MenuHandlers {
  change(s: Settings): void;
  resume(): void;
  leave: (() => void) | null;
  controls(): void;
}

export class MenuScreen {
  private root: HTMLElement | null = null;

  get open(): boolean {
    return this.root !== null;
  }

  show(ui: HTMLElement, s: Settings, h: MenuHandlers, touch: boolean): void {
    this.hide();
    this.root = el(
      'div',
      'screen dim',
      `<div class="menu panel"><h3>Settings</h3>
        <label>Master volume <input type="range" min="0" max="1" step="0.05" data-k="master"></label>
        <label>Music <input type="range" min="0" max="1" step="0.05" data-k="music"></label>
        <label>Effects <input type="range" min="0" max="1" step="0.05" data-k="sfx"></label>
        <label>Reduce shake &amp; flashes <input type="checkbox" data-k="reduceEffects"></label>
        ${touch ? '<label>Left-handed controls <input type="checkbox" data-k="lefty"></label>' : ''}
        <label>Graphics <select data-k="quality"><option value="auto">Auto</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
        <button class="btn controls">Controls</button>
        ${h.leave ? '<button class="btn leave">Leave Match</button>' : ''}
        <button class="btn primary resume">Resume</button></div>`,
    );
    const current = { ...s };
    for (const input of this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]')) {
      const k = input.dataset.k as keyof Settings;
      if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = current[k] as boolean;
      else input.value = String(current[k]);
      input.oninput = input.onchange = () => {
        const v = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input instanceof HTMLInputElement ? Number(input.value) : input.value;
        (current as any)[k] = v;
        h.change({ ...current });
      };
    }
    this.root.querySelector<HTMLButtonElement>('.resume')!.onclick = h.resume;
    this.root.querySelector<HTMLButtonElement>('.controls')!.onclick = h.controls;
    const leave = this.root.querySelector<HTMLButtonElement>('.leave');
    if (leave && h.leave) leave.onclick = h.leave;
    ui.appendChild(this.root);
  }

  hide(): void {
    this.root?.remove();
    this.root = null;
  }
}

let toastEl: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(ui: HTMLElement, text: string, seconds = 2.5): void {
  if (!toastEl) {
    toastEl = el('div', 'toast');
    ui.appendChild(toastEl);
  }
  toastEl.textContent = text;
  toastEl.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (toastEl) toastEl.style.opacity = '0';
  }, seconds * 1000);
}
