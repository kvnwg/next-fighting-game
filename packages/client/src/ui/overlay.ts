type Layer = 'red' | 'redglow' | 'white' | 'gold';

interface Pulse {
  peak: number;
  attack: number;
  hold: number;
  release: number;
  t: number;
}

/**
 * Full-screen color effects drawn as DOM layers over the canvas. Cheap on phones,
 * where full-screen post-processing passes are not.
 */
export class ScreenFx {
  /** 0..1, lowered by the "reduce flashes" setting. */
  intensity = 1;
  private readonly layers = new Map<Layer, HTMLElement>();
  private readonly pulses = new Map<Layer, Pulse>();
  private readonly lowHp: HTMLElement;
  private desat = 0;

  constructor(
    root: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly cssFilters: boolean,
  ) {
    const vignette = document.createElement('div');
    vignette.className = 'fx-layer fx-vignette';
    root.appendChild(vignette);
    this.lowHp = document.createElement('div');
    this.lowHp.className = 'fx-layer fx-lowhp';
    root.appendChild(this.lowHp);
    for (const name of ['red', 'redglow', 'gold', 'white'] as Layer[]) {
      const el = document.createElement('div');
      el.className = `fx-layer fx-${name}`;
      root.appendChild(el);
      this.layers.set(name, el);
    }
  }

  pulse(layer: Layer, peak: number, hold: number, release: number, attack = 0.04): void {
    this.pulses.set(layer, { peak: peak * this.intensity, attack, hold, release, t: 0 });
  }

  /** Brief desaturation when you take a heavy hit (desktop only). */
  desaturate(amount: number): void {
    if (this.cssFilters) this.desat = Math.max(this.desat, amount * this.intensity);
  }

  setLowHp(fraction: number): void {
    // Starts showing under 30% health, pulsing with a heartbeat.
    const k = Math.max(0, (0.3 - fraction) / 0.3);
    const beat = 0.75 + Math.sin(performance.now() / 160) * 0.25;
    this.lowHp.style.opacity = (k * beat * 0.9).toFixed(3);
  }

  clear(): void {
    this.pulses.clear();
    for (const el of this.layers.values()) el.style.opacity = '0';
    this.desat = 0;
    this.canvas.style.filter = '';
    this.lowHp.style.opacity = '0';
  }

  update(dt: number): void {
    for (const [name, p] of this.pulses) {
      p.t += dt;
      let v: number;
      if (p.t < p.attack) v = p.t / p.attack;
      else if (p.t < p.attack + p.hold) v = 1;
      else v = Math.max(0, 1 - (p.t - p.attack - p.hold) / p.release);
      this.layers.get(name)!.style.opacity = (v * p.peak).toFixed(3);
      if (v <= 0 && p.t > p.attack) this.pulses.delete(name);
    }
    if (this.desat > 0) {
      this.desat = Math.max(0, this.desat - dt * 2.5);
      this.canvas.style.filter = this.desat > 0.01 ? `saturate(${(1 - this.desat).toFixed(2)})` : '';
    }
  }
}
