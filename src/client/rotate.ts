/**
 * The game is played sideways. On a touchscreen held upright the game turns itself: the page is
 * laid out landscape and rotated a quarter turn, so turning the phone sideways shows it the right
 * way up. That works whether or not the phone will rotate the page (rotation locked, or an app's
 * built-in browser that stays upright). Where it does rotate, the page simply becomes landscape
 * and the turn comes off again. Where the browser allows it (Android, once in fullscreen) the first
 * tap also locks the screen to landscape.
 *
 * Turned, the page's viewport is still the upright screen, so the stylesheet's viewport units and
 * media queries are answered for the landscape frame instead (see swapUnits and remapMedia), and
 * touch positions are carried into the frame (toFrame).
 */

let active = false;

/** A point on the screen (a pointer's clientX/Y) in the game's own landscape frame. */
export function toFrame(x: number, y: number): { x: number; y: number } {
  return active ? { x: y, y: window.innerWidth - x } : { x, y };
}

/** How wide the game's frame is (the screen's height while turned). */
export function frameWidth(): number {
  return active ? window.innerHeight : window.innerWidth;
}

export class Sideways {
  private readonly hint: HTMLElement;
  private hintTimer = 0;

  constructor(
    private readonly touch: boolean,
    private readonly onChange: (active: boolean) => void,
  ) {
    // a moment's prompt to turn the phone, over the game rather than in front of it
    this.hint = document.createElement('div');
    this.hint.className = 'rotate-hint hidden';
    this.hint.innerHTML = '<div class="rg-phone"><span></span></div><div class="rg-text">Turn your phone sideways</div>';
    document.body.appendChild(this.hint);
    const check = () => this.update();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    screen.orientation?.addEventListener?.('change', check);
    if (touch) window.addEventListener('pointerdown', () => void this.lockLandscape(), { once: true, capture: true });
    this.update();
  }

  get active(): boolean {
    return active;
  }

  private update(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const turn = this.touch && h > w * 1.05;
    const root = document.documentElement;
    root.style.setProperty('--sw', `${w}px`);
    root.style.setProperty('--sh', `${h}px`);
    // the frame the game lays out in: the screen, or the screen turned
    const fw = turn ? h : w;
    const fh = turn ? w : h;
    root.style.setProperty('--f-vw', `${fw / 100}px`);
    root.style.setProperty('--f-vh', `${fh / 100}px`);
    root.style.setProperty('--f-vmin', `${Math.min(fw, fh) / 100}px`);
    root.style.setProperty('--f-vmax', `${Math.max(fw, fh) / 100}px`);
    const changed = turn !== active;
    if (changed) {
      active = turn;
      root.classList.toggle('sideways', turn);
      forEachStyle((s) => swapUnits(s, turn));
      this.prompt(turn);
    }
    remapMedia(turn, fw, fh);
    if (changed) this.onChange(turn);
  }

  /** Show the turn prompt for a few seconds after the game turns. */
  private prompt(on: boolean): void {
    clearTimeout(this.hintTimer);
    this.hint.classList.toggle('hidden', !on);
    if (on) this.hintTimer = window.setTimeout(() => this.hint.classList.add('hidden'), 2600);
  }

  /** Fullscreen and a landscape lock, where they're allowed (not on iPhones, nor in some frames). */
  private async lockLandscape(): Promise<void> {
    try {
      const root = document.documentElement;
      if (!document.fullscreenElement && root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
    } catch {
      // refused: the game turns itself instead
    }
  }
}

// ------------------------------------------------------------------ the stylesheet, turned

type Rules = { cssRules: CSSRuleList };

/** Every style declaration in the page's own stylesheets (cross-origin font sheets can't be read). */
function forEachStyle(fn: (s: CSSStyleDeclaration) => void, rules?: CSSRuleList): void {
  if (!rules) {
    for (const sheet of Array.from(document.styleSheets)) {
      let list: CSSRuleList;
      try {
        list = sheet.cssRules;
      } catch {
        continue;
      }
      forEachStyle(fn, list);
    }
    return;
  }
  for (const r of Array.from(rules)) {
    if ('style' in r) fn((r as CSSStyleRule).style);
    if ('cssRules' in r) forEachStyle(fn, (r as unknown as Rules).cssRules);
  }
}

const UNITS = /(-?\d*\.?\d+)(dvw|svw|lvw|vw|dvh|svh|lvh|vh|vmin|vmax)\b/g;
const HAS_UNITS = /\d(dvw|svw|lvw|vw|dvh|svh|lvh|vh|vmin|vmax)\b/;
const unitVar = (u: string) => (u.endsWith('w') ? 'vw' : u.endsWith('h') ? 'vh' : u);
/** each declaration's viewport-unit values as written: [property, value, priority] */
const written = new WeakMap<CSSStyleDeclaration, [string, string, string][]>();

/** Viewport units measured on the frame (custom properties kept up to date) while turned, as written otherwise. */
function swapUnits(style: CSSStyleDeclaration, turned: boolean): void {
  let list = written.get(style);
  if (!list) {
    list = [];
    for (let i = 0; i < style.length; i++) {
      const p = style.item(i);
      const v = style.getPropertyValue(p);
      if (HAS_UNITS.test(v)) list.push([p, v, style.getPropertyPriority(p)]);
    }
    written.set(style, list);
  }
  for (const [p, v, pr] of list) style.setProperty(p, turned ? v.replace(UNITS, (_, n: string, u: string) => `calc(${n} * var(--f-${unitVar(u)}))`) : v, pr);
}

/** each media rule's query as written */
const queries = new WeakMap<CSSMediaRule, string>();

/** Media queries answered for the frame while turned (a phone on its side is short, not narrow). */
function remapMedia(turned: boolean, w: number, h: number): void {
  const walk = (rules: CSSRuleList) => {
    for (const r of Array.from(rules)) {
      if (r instanceof CSSMediaRule) {
        if (!queries.has(r)) queries.set(r, r.media.mediaText);
        const q = queries.get(r)!;
        const text = turned ? (matches(q, w, h) ? 'all' : 'not all') : q;
        if (r.media.mediaText !== text) r.media.mediaText = text;
        walk(r.cssRules);
      } else if ('cssRules' in r) walk((r as unknown as Rules).cssRules);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules);
    } catch {
      // a cross-origin sheet
    }
  }
}

function matches(query: string, w: number, h: number): boolean {
  return query.split(',').some((part) => part.split(/\band\b/).every((f) => feature(f.trim(), w, h)));
}

function feature(f: string, w: number, h: number): boolean {
  const size = /^\(\s*(min|max)-(width|height)\s*:\s*([\d.]+)px\s*\)$/.exec(f);
  if (size) {
    const v = size[2] === 'width' ? w : h;
    return size[1] === 'max' ? v <= Number(size[3]) : v >= Number(size[3]);
  }
  const orient = /^\(\s*orientation\s*:\s*(portrait|landscape)\s*\)$/.exec(f);
  if (orient) return (orient[1] === 'portrait') === h >= w;
  if (f === '' || f === 'all' || f === 'screen' || f === 'only screen') return true;
  // anything else (hover, pointer, motion...) is the device's own answer
  return matchMedia(f).matches;
}
