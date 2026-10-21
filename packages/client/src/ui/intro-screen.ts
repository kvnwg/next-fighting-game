/**
 * Full-screen effects for the ring entrances: flashes, fades, an ink bloom from the edges,
 * slash streaks, letterbox bars and colour grading on the game canvas. All of it is DOM
 * and CSS, so it costs nothing in the 3D scene.
 */
export class IntroScreen {
  private root: HTMLElement | null = null;
  private fill: HTMLElement | null = null;
  private bloomEl: HTMLElement | null = null;
  private fillOpacity = 0;

  constructor(
    private readonly canvas: HTMLElement,
    private readonly ui: HTMLElement,
    private readonly cssFilters: boolean,
  ) {}

  mount(): void {
    const ui = this.ui;
    this.clear();
    const root = document.createElement('div');
    root.className = 'intro-fx';
    root.innerHTML = '<div class="ifx-bloom"></div><div class="ifx-fill"></div><div class="ifx-bar top"></div><div class="ifx-bar bottom"></div>';
    ui.appendChild(root);
    this.root = root;
    this.fill = root.querySelector('.ifx-fill');
    this.bloomEl = root.querySelector('.ifx-bloom');
    this.fillOpacity = 0;
  }

  /** Letterbox bars slide in (or out). */
  bars(on: boolean): void {
    this.root?.classList.toggle('bars', on);
  }

  /** A flash of colour that fades out. */
  flash(color: string, seconds = 0.3, peak = 1): void {
    const el = this.layer(`background:${color}`);
    el?.animate([{ opacity: peak }, { opacity: 0 }], { duration: seconds * 1000, easing: 'ease-out' }).finished.then(() => el.remove(), () => el.remove());
  }

  /** Fades a solid layer of `color` to `opacity` (0 clears it). */
  fade(color: string, opacity: number, seconds: number): void {
    const el = this.fill;
    if (!el) return;
    el.style.background = color;
    el.animate([{ opacity: this.fillOpacity }, { opacity }], { duration: Math.max(1, seconds * 1000), fill: 'forwards', easing: 'ease-in-out' });
    this.fillOpacity = opacity;
  }

  /** Colour bleeds in from the screen edges (`amount` 1 nearly covers it, 0 clears it). */
  bloom(color: string, amount: number, seconds: number): void {
    const el = this.bloomEl;
    if (!el) return;
    const shadow = (k: number) => `inset 0 0 ${18 * k}vmax ${55 * k}vmax ${color}`;
    const from = getComputedStyle(el).boxShadow;
    el.animate([{ boxShadow: from === 'none' ? shadow(0) : from }, { boxShadow: shadow(amount) }], {
      duration: Math.max(1, seconds * 1000),
      fill: 'forwards',
      easing: 'ease-in-out',
    });
  }

  /** A bright streak across the frame at `angle` degrees, like a blade cutting the shot. */
  slash(color: string, angle = -24, seconds = 0.22): void {
    const el = this.layer(
      `inset:-50%;background:linear-gradient(${angle + 90}deg, transparent 49.2%, ${color} 49.8%, #fff 50%, ${color} 50.2%, transparent 50.8%)`,
    );
    if (!el) return;
    const rad = (angle * Math.PI) / 180;
    const dx = Math.cos(rad) * 60;
    const dy = Math.sin(rad) * 60;
    el.animate(
      [
        { transform: `translate(${-dx}%, ${-dy}%)`, opacity: 1 },
        { transform: `translate(${dx}%, ${dy}%)`, opacity: 1 },
      ],
      { duration: seconds * 1000, easing: 'ease-in' },
    ).finished.then(() => el.remove(), () => el.remove());
  }

  /** A glowing point at screen position (x, y) in CSS pixels, above any fade: eyes opening in the dark. */
  glow(x: number, y: number, color: string, size: number, seconds: number): void {
    const el = this.layer(
      `inset:auto;left:${x - size}px;top:${y - size / 2}px;width:${size * 2}px;height:${size}px;border-radius:50%;` +
        `background:radial-gradient(closest-side, #fff 0, ${color} 35%, transparent 100%);filter:drop-shadow(0 0 ${size}px ${color})`,
    );
    el?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: seconds * 1000, easing: 'ease-out' }).finished.then(
      () => el.remove(),
      () => el.remove(),
    );
  }

  /** CSS filter on the game canvas (monochrome, desaturation), eased over `seconds`. Skipped on devices without cheap CSS filters. */
  grade(filter: string, seconds: number): void {
    if (!this.cssFilters) return;
    this.canvas.style.transition = `filter ${seconds}s ease-in-out`;
    this.canvas.style.filter = filter;
  }

  clear(): void {
    this.root?.remove();
    this.root = this.fill = this.bloomEl = null;
    this.canvas.style.transition = '';
    this.canvas.style.filter = '';
  }

  private layer(style: string): HTMLElement | null {
    if (!this.root) return null;
    const el = document.createElement('div');
    el.setAttribute('style', style);
    this.root.appendChild(el);
    return el;
  }
}
