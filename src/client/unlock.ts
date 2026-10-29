/**
 * Beating the sensei: the fighter it earns, picked and revealed on the spot, as a spectacle.
 *
 *   victory  the screen goes dark under turning rays; 勝利 VICTORY slams in, and what it paid
 *   choose   the fighters you could take fan in, one by one; tap one (it calls out), then Unlock
 *   reveal   a white flash, a burst of sparks in their colours, the screen shakes; they step out
 *            through a ring of light doing their moves (the same preview as the Fighters menu),
 *            their name stamped under them; then Fight with them, or back to the grounds
 *
 * The pick is sent as it's made (the server's free pick); the rest is only for show.
 */
import { CHARACTERS, type CharacterId } from '../shared/characters';
import { audio } from './audio';
import { icon } from './pixelicons';
import { platform } from './platform';
import type { Preview } from './ui';

export interface CeremonyOptions {
  /** the fighters on offer */
  choices: CharacterId[];
  /** coins the win paid */
  coins?: number;
  portrait(id: CharacterId): string;
  createPreview(container: HTMLElement): Preview;
  /** the pick is made: unlock it */
  onPick(id: CharacterId): void;
  /** over: fight on with the new fighter (its id), or back to the grounds (null) */
  onDone(id: CharacterId | null): void;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** sparks in the reveal's burst, and motes drifting up behind it all */
const SPARKS = 56;
const MOTES = 26;
/** the rays are drawn this small and blown up to fill the screen: soft light, cheap at any size */
const RAYS_PX = 256;
const RAY_COUNT = 22;

export class UnlockCeremony {
  readonly el: HTMLElement;
  private preview: Preview | null = null;
  private timers: number[] = [];
  private chosen: CharacterId | null = null;
  private revealed = false;
  private readonly rays: HTMLCanvasElement;
  private rayColor = '#f2c14e';
  private raf = 0;

  constructor(
    parent: HTMLElement,
    private readonly o: CeremonyOptions,
  ) {
    const card = (id: CharacterId, i: number) => {
      const c = CHARACTERS[id];
      return `<button class="uc-card" data-id="${id}" style="--c1:${c.palette.primary};--c2:${c.palette.accent};--i:${i}">
        <span class="uc-card-jp" aria-hidden="true">${c.jp}</span>
        <span class="uc-card-art"><img src="${o.portrait(id)}" alt="" draggable="false"></span>
        <span class="uc-card-name">${esc(c.name)}</span>
        <span class="uc-card-sub">${esc(c.weapon)}<i>·</i>${esc(c.role)}</span>
      </button>`;
    };
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const sparks = Array.from({ length: SPARKS }, (_, i) => {
      const tone = ['var(--c2)', 'var(--gold-hi, #ffe27a)', '#fff', 'var(--c2)'][i % 4];
      return `<i style="--a:${((i / SPARKS) * 360 + rand(-4, 4)).toFixed(1)}deg;--r:${rand(28, 52).toFixed(1)}vmin;--s:${rand(4, 11).toFixed(0)}px;--t:${rand(0.7, 1.4).toFixed(2)}s;--w:${rand(0, 0.12).toFixed(2)}s;--k:${tone}"></i>`;
    }).join('');
    const motes = Array.from({ length: MOTES }, () => `<i style="--x:${rand(0, 100).toFixed(1)}%;--d:${rand(5, 11).toFixed(1)}s;--w:${rand(-10, 0).toFixed(1)}s;--s:${rand(3, 7).toFixed(0)}px"></i>`).join('');
    this.el = document.createElement('div');
    this.el.className = 'uc';
    this.el.dataset.phase = 'victory';
    this.el.innerHTML = `
      <canvas class="uc-rays" width="${RAYS_PX}" height="${RAYS_PX}" aria-hidden="true"></canvas>
      <div class="uc-glow" aria-hidden="true"></div>
      <div class="uc-motes" aria-hidden="true">${motes}</div>
      <div class="uc-victory">
        <div class="uc-v-jp">勝利</div>
        <div class="uc-v-title">Victory</div>
        <div class="uc-v-line">The sensei bows. A fighter is yours to take.</div>
        ${o.coins ? `<div class="uc-v-coins">${icon('coin')}+${o.coins} coins</div>` : ''}
      </div>
      <div class="uc-choose">
        <h2 class="uc-c-title"><span class="jp">選べ</span>Choose your fighter</h2>
        <div class="uc-cards">${o.choices.map(card).join('')}</div>
        <button class="uc-confirm" disabled><span class="jp">解放</span><span class="uc-confirm-text">Pick one</span></button>
      </div>
      <div class="uc-reveal">
        <div class="uc-burst" aria-hidden="true">${sparks}</div>
        <div class="uc-ring" aria-hidden="true"></div>
        <div class="uc-stage"></div>
        <div class="uc-r-text">
          <div class="uc-r-kicker">Unlocked</div>
          <div class="uc-r-name"><span class="uc-r-jp"></span><b></b></div>
          <div class="uc-r-sub"></div>
        </div>
        <div class="uc-r-actions">
          <button class="uc-fight">${icon('swords')}<span>Fight with <b></b></span></button>
          <button class="uc-later">Back to the grounds</button>
        </div>
      </div>
      <div class="uc-flash" aria-hidden="true"></div>`;
    parent.appendChild(this.el);
    this.rays = this.el.querySelector<HTMLCanvasElement>('.uc-rays')!;
    this.raf = requestAnimationFrame(this.drawRays);

    for (const b of this.el.querySelectorAll<HTMLButtonElement>('.uc-card')) {
      b.addEventListener('click', () => this.select(b.dataset.id as CharacterId));
    }
    this.el.querySelector('.uc-confirm')!.addEventListener('click', () => this.chosen && this.reveal(this.chosen));
    this.el.querySelector('.uc-fight')!.addEventListener('click', () => this.finish(this.chosen));
    this.el.querySelector('.uc-later')!.addEventListener('click', () => this.finish(null));

    audio.play('victory');
    platform.happytime();
    this.later(1900, () => this.choose());
  }

  /** The rays, turning: slowly at first, faster once the fighter is out. */
  private drawRays = (t: number): void => {
    this.raf = requestAnimationFrame(this.drawRays);
    const ctx = this.rays.getContext('2d');
    if (!ctx) return;
    const c = RAYS_PX / 2;
    ctx.clearRect(0, 0, RAYS_PX, RAYS_PX);
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate((t / 1000) * (this.revealed ? 0.45 : 0.14));
    ctx.fillStyle = this.rayColor;
    ctx.globalAlpha = 0.34;
    const wedge = (Math.PI * 2) / RAY_COUNT;
    for (let i = 0; i < RAY_COUNT; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, c * 1.5, i * wedge, i * wedge + wedge * 0.36);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // brightest at the middle, gone toward the edges
    ctx.globalCompositeOperation = 'destination-in';
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.4, 'rgba(0,0,0,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, RAYS_PX, RAYS_PX);
    ctx.globalCompositeOperation = 'source-over';
  };

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private choose(): void {
    if (this.revealed) return;
    this.el.dataset.phase = 'choose';
    audio.cardSlam();
  }

  /** A card tapped: it lifts and calls out, and Unlock names it. A second tap on it unlocks it. */
  private select(id: CharacterId): void {
    if (this.revealed) return;
    if (this.el.dataset.phase !== 'choose') this.choose();
    if (this.chosen === id) return this.reveal(id);
    this.chosen = id;
    for (const b of this.el.querySelectorAll<HTMLElement>('.uc-card')) b.classList.toggle('sel', b.dataset.id === id);
    const c = CHARACTERS[id];
    const confirm = this.el.querySelector<HTMLButtonElement>('.uc-confirm')!;
    confirm.disabled = false;
    confirm.style.setProperty('--c2', c.palette.accent);
    confirm.querySelector('.uc-confirm-text')!.textContent = `Unlock ${c.name}`;
    audio.fighterPick(id);
  }

  private reveal(id: CharacterId): void {
    if (this.revealed) return;
    this.revealed = true;
    this.o.onPick(id);
    const c = CHARACTERS[id];
    this.rayColor = c.palette.accent;
    this.el.style.setProperty('--c1', c.palette.primary);
    this.el.style.setProperty('--c2', c.palette.accent);
    this.el.querySelector('.uc-r-jp')!.textContent = c.jp;
    this.el.querySelector('.uc-r-name b')!.textContent = c.name;
    this.el.querySelector('.uc-r-sub')!.textContent = `${c.weapon} · ${c.role}`;
    this.el.querySelector('.uc-fight b')!.textContent = c.name;
    this.el.dataset.phase = 'reveal';
    audio.unlocked();
    audio.cardSlam();
    this.later(350, () => audio.fighterPick(id));
    // they step out through the ring a moment after the flash
    this.later(260, () => {
      const stage = this.el.querySelector<HTMLElement>('.uc-stage')!;
      this.preview = this.o.createPreview(stage);
      this.preview.setChar(id);
    });
    this.later(1700, () => this.el.classList.add('ready'));
  }

  private finish(id: CharacterId | null): void {
    if (this.el.classList.contains('out')) return;
    this.el.classList.add('out');
    this.later(450, () => {
      this.destroy();
      this.o.onDone(id);
    });
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.preview?.dispose();
    this.preview = null;
    this.el.remove();
  }
}
