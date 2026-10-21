/**
 * Pixel-art icons, drawn in code so they cost next to nothing in the bundle. Each icon is a small
 * grid of letters; every letter is a material (gold, steel, red lacquer, wood, paper...) with a
 * three-tone ramp. The shading is automatic and shared by every icon: pixels on a material's
 * top-left edge take its light tone, pixels on its bottom-right edge its shadow, and the rest its
 * base, all under a one-pixel ink outline and a hard drop shadow. A capital letter forces the light
 * tone; the material's digit forces the shadow; `k` is a plain ink pixel. The result is an inline
 * SVG of crisp-edged rects, sized by CSS (.pi).
 */

/** light, base, shadow */
type Ramp = readonly [string, string, string];

const INK = '#16121a';
const DROP = 'rgba(0,0,0,0.38)';

const RAMPS: Record<string, Ramp> = {
  g: ['#ffe9a0', '#f2c14e', '#b8801e'], // gold
  s: ['#f4f6fa', '#b4bac4', '#6c7280'], // steel
  r: ['#ff8a76', '#e8323c', '#9a1620'], // red lacquer
  w: ['#d8975c', '#9a5f34', '#5e3820'], // wood
  p: ['#fffaf0', '#efe4cf', '#c4b08c'], // paper
  e: ['#c8f4a0', '#5fc45a', '#2a7a3a'], // green
  b: ['#c8ecff', '#5aaef0', '#2a5aa8'], // blue
  c: ['#d8fbff', '#4ad8c8', '#1f8a80'], // cyan
  d: ['#6a6474', '#433d4c', '#2a2530'], // dark iron
  h: ['#ffffff', '#e8e6ee', '#a8a6b4'], // white
  u: ['#e8c0ff', '#a466e0', '#5e2e94'], // purple
  n: ['#ffd49a', '#f08a2a', '#a8501a'], // orange
  m: ['#ffd6c0', '#e8a07a', '#a8664a'], // skin
};
/** the shadow-tone letter for each material */
const LO: Record<string, string> = { g: '1', s: '2', r: '3', w: '4', p: '5', e: '6', b: '7', c: '8', d: '9', h: '0', u: '!', n: '?', m: '$' };
const LO_OF: Record<string, string> = Object.fromEntries(Object.entries(LO).map(([k, v]) => [v, k]));

/** Parses one grid cell: its material and, if fixed, its tone (0 light, 2 shadow). */
function cell(ch: string): { mat: string; tone: number | null } | null {
  if (ch === '.' || ch === ' ') return null;
  if (ch === 'k') return { mat: 'k', tone: null };
  if (RAMPS[ch]) return { mat: ch, tone: null };
  const low = ch.toLowerCase();
  if (RAMPS[low]) return { mat: low, tone: 0 };
  if (LO_OF[ch]) return { mat: LO_OF[ch], tone: 2 };
  return null;
}

const svgCache = new Map<string, string>();

/** An icon grid as an SVG string (cached). `drop: false` leaves out the hard drop shadow. */
export function pixelSVG(rows: readonly string[], opts: { drop?: boolean; cls?: string } = {}): string {
  const drop = opts.drop ?? true;
  const key = rows.join('/') + (drop ? '+' : '-') + (opts.cls ?? '');
  const hit = svgCache.get(key);
  if (hit) return hit;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  // a one-pixel margin all round for the outline, and one more right and down for the shadow
  const W = w + 3;
  const H = h + 3;
  const grid: ({ mat: string; tone: number | null } | null)[] = new Array(W * H).fill(null);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) grid[(y + 1) * W + x + 1] = cell(rows[y][x] ?? '.');
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? null : grid[y * W + x]);
  const colors: (string | null)[] = new Array(W * H).fill(null);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = at(x, y);
      if (!c) continue;
      if (c.mat === 'k') {
        colors[y * W + x] = INK;
        continue;
      }
      let tone = c.tone;
      if (tone === null) {
        const edge = (dx: number, dy: number) => at(x + dx, y + dy)?.mat !== c.mat;
        const lit = edge(-1, 0) || edge(0, -1);
        const shaded = edge(1, 0) || edge(0, 1);
        tone = lit && !shaded ? 0 : shaded && !lit ? 2 : 1;
      }
      colors[y * W + x] = RAMPS[c.mat][tone];
    }
  }
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && colors[y * W + x] !== null;
  const outline: boolean[] = new Array(W * H).fill(false);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) outline[y * W + x] = true;
    }
  }
  for (let i = 0; i < outline.length; i++) if (outline[i]) colors[i] = INK;
  if (drop) {
    for (let y = H - 1; y > 0; y--) {
      for (let x = W - 1; x > 0; x--) {
        if (colors[y * W + x] === null && colors[(y - 1) * W + x - 1] !== null && colors[(y - 1) * W + x - 1] !== DROP) colors[y * W + x] = DROP;
      }
    }
  }
  // one rect per horizontal run of a colour
  let body = '';
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const col = colors[y * W + x];
      if (!col) {
        x++;
        continue;
      }
      let e = x + 1;
      while (e < W && colors[y * W + e] === col) e++;
      body += `<rect x="${x}" y="${y}" width="${e - x}" height="1" fill="${col}"/>`;
      x = e;
    }
  }
  const svg = `<svg class="pi${opts.cls ? ` ${opts.cls}` : ''}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;
  svgCache.set(key, svg);
  return svg;
}

/** The same icon as a CSS url() for backgrounds. */
export function pixelURL(rows: readonly string[], drop = true): string {
  const svg = pixelSVG(rows, { drop }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// ---------------------------------------------------------------------------- the icon set

export const ICON = {
  /** a kabuto helm with a gold crest: the roster */
  fighters: [
    'g..............g',
    'gg............gg',
    '.gg..........gg.',
    '..ggg......ggg..',
    '....gggggggg....',
    '.....rrGGrr.....',
    '...rrrrggrrrr...',
    '..rrrrrrrrrrrr..',
    '..rrrrrrrrrrrr..',
    '.ssssssssssssss.',
    'sssddddddddddsss',
    'ss.dhhddddhhd.ss',
    'ss.dddddddddd.ss',
    's...ddrrrrdd...s',
    '....dddddddd....',
    '.....dddddd.....',
  ],
  /** a gold cup on a wooden plinth: the ladder */
  ladder: [
    '..gggggggggggg..',
    'gggggggggggggggg',
    'g..ggggggggggg.g',
    'g..ggggrrggggg.g',
    '.g.gggrrrrgggg.g',
    '..ggggrrrrgggg..',
    '...ggggrrgggg...',
    '....gggggggg....',
    '.....gggggg.....',
    '......gggg......',
    '.......gg.......',
    '.......gg.......',
    '.....gggggg.....',
    '....wwwwwwww....',
    '....wwwwwwww....',
    '...wwwwwwwwww...',
  ],
  /** a scroll with brushed lines and a red seal: help */
  help: [
    '.wwwwwwwwwwwwww.',
    'wwwwwwwwwwwwwwww',
    '.pppppppppppppp.',
    '.pppppppppppppp.',
    '.ppkkkkkkkkpppp.',
    '.pppppppppppppp.',
    '.ppkkkkkkkkkkpp.',
    '.pppppppppppppp.',
    '.ppkkkkkkpppppp.',
    '.pppppppppppppp.',
    '.ppkkkkkpprrrpp.',
    '.pppppppprrrrrp.',
    '.pppppppprrrrrp.',
    '.ppppppppprrrpp.',
    'wwwwwwwwwwwwwwww',
    '.wwwwwwwwwwwwww.',
  ],
  /** a steel gear */
  settings: [
    '......ssss......',
    '..ss.ssssss.ss..',
    '.ssssssssssssss.',
    '.ssssssssssssss.',
    '..ssssssssssss..',
    '..ssssssssssss..',
    'sssssss..sssssss',
    'ssssss....ssssss',
    'ssssss....ssssss',
    'sssssss..sssssss',
    '..ssssssssssss..',
    '..ssssssssssss..',
    '.ssssssssssssss.',
    '.ssssssssssssss.',
    '..ss.ssssss.ss..',
    '......ssss......',
  ],
  /** two crossed katanas: play / duel */
  swords: [
    'h..............h',
    'hh............hh',
    '.hh..........hh.',
    '..hh........hh..',
    '...hh......hh...',
    '....hh....hh....',
    '.....hh..hh.....',
    '......hhhh......',
    '......hhhh......',
    '.....hh..hh.....',
    '..g.hh....hh.g..',
    '...ghg....ghg...',
    '...rgg....ggr...',
    '..rr.g....g.rr..',
    '.rr..........rr.',
    'rr............rr',
  ],
  /** a pixel X: close */
  close: [
    'rr........rr',
    'rrr......rrr',
    '.rrr....rrr.',
    '..rrr..rrr..',
    '...rrrrrr...',
    '....rrrr....',
    '....rrrr....',
    '...rrrrrr...',
    '..rrr..rrr..',
    '.rrr....rrr.',
    'rrr......rrr',
    'rr........rr',
  ],
  /** an hourglass: searching, timers */
  hourglass: [
    'wwwwwwwwwwww',
    'wwwwwwwwwwww',
    '.hpppppppph.',
    '.hgggggggph.',
    '..hgggggph..',
    '...hgggph...',
    '....hggh....',
    '....hgph....',
    '...hppgph...',
    '..hpppgpph..',
    '.hppggggpph.',
    '.hgggggggph.',
    'wwwwwwwwwwww',
    'wwwwwwwwwwww',
  ],
  /** a heart: health */
  heart: [
    '.rrr...rrr.',
    'rRRrr.rrrrr',
    'rRrrrrrrrrr',
    'rrrrrrrrrrr',
    'rrrrrrrrrrr',
    '.rrrrrrrrr.',
    '..rrrrrrr..',
    '...rrrrr...',
    '....rrr....',
    '.....r.....',
  ],
  /** a kite shield: posture, defense */
  shield: [
    'ssssssssssss',
    'sddddssdddds',
    'sdddds2dddds',
    'sdddds2dddds',
    'sgggggggggs.',
    'sdddds2dddds',
    'sdddds2dddds',
    '.sdddsddds..',
    '.sddds2ddds.',
    '..sdds2dds..',
    '...sds2ds...',
    '....ssss....',
    '.....ss.....',
  ],
  /** the shield cracked through: a broken guard */
  shieldCracked: [
    'ssssssssssss',
    'sdddd.sdddds',
    'sddddd.dddds',
    'sddddd.dddds',
    'sggggg.gggs.',
    'sdddd.ddddds',
    'sdddd.ddddds',
    '.sddd.dddds.',
    '.sdddd.ddds.',
    '..sdd.ddds..',
    '...sd.dds...',
    '....s.ss....',
    '.....ss.....',
  ],
  /** a perilous warning: red diamond with a white bang */
  peril: [
    '.....rr.....',
    '....rrrr....',
    '...rrhhrr...',
    '..rrrhhrrr..',
    '.rrrrhhrrrr.',
    'rrrrrhhrrrrr',
    'rrrrrhhrrrrr',
    '.rrrrrrrrrr.',
    '..rrrhhrrr..',
    '...rrhhrr...',
    '....rrrr....',
    '.....rr.....',
  ],
  /** a lightning bolt: abilities, speed */
  bolt: [
    '......bbbb',
    '.....bbbb.',
    '....bbbb..',
    '...bbbb...',
    '..bbbbbbbb',
    '.bbbbbbbb.',
    '.....bbb..',
    '....bbb...',
    '...bbb....',
    '..bbb.....',
    '.bb.......',
    'b.........',
  ],
  /** a flame: specials */
  flame: [
    '.....r......',
    '....rr......',
    '....rrr..r..',
    '...rrrr.rr..',
    '..rrrnrrrr..',
    '..rrnnnrrrr.',
    '.rrnnnnnrrr.',
    '.rrnngnnnrr.',
    'rrnnggggnnrr',
    'rrnggGGggnrr',
    'rrnggGGggnrr',
    '.rnngggggnr.',
    '..rnnnnnnr..',
    '...rrrrrr...',
  ],
  /** a sandal / boot with a dash line: dodge, speed */
  dash: [
    '........wwww',
    '.......wwwww',
    '.......wwwww',
    'hhh....wwwww',
    '.......wwwww',
    'hhhhh..wwwww',
    '.....wwwwwww',
    'hhh.wwwwwwww',
    '...wwwwwwwww',
    '..wwwwwwwwww',
    '..4444444444',
  ],
  /** an up arrow: jump, air */
  jump: [
    '.....hh.....',
    '....hhhh....',
    '...hhhhhh...',
    '..hhhhhhhh..',
    '.hhhhhhhhhh.',
    'hhhhhhhhhhhh',
    '....hhhh....',
    '....hhhh....',
    '....hhhh....',
    '....hhhh....',
    '....hhhh....',
    '....hhhh....',
  ],
  /** a back arrow: backstep */
  back: [
    '.....h......',
    '....hh......',
    '...hhh......',
    '..hhhhhhhhhh',
    '.hhhhhhhhhhh',
    'hhhhhhhhhhhh',
    '.hhhhhhhhhhh',
    '..hhhhhhhhhh',
    '...hhh......',
    '....hh......',
    '.....h......',
  ],
  /** a target reticle: lock on, reach */
  target: [
    '....rrrr....',
    '..rr....rr..',
    '.r...hh...r.',
    '.r...hh...r.',
    'r..........r',
    'rhh..rr..hhr',
    'rhh..rr..hhr',
    'r..........r',
    '.r...hh...r.',
    '.r...hh...r.',
    '..rr....rr..',
    '....rrrr....',
  ],
  /** one katana: light attacks, power */
  sword: [
    '..........hh',
    '.........hhh',
    '........hhh.',
    '.......hhh..',
    '......hhh...',
    '.....hhh....',
    '....hhh.....',
    '.g.hhh......',
    '..ghh.......',
    '..rgg.......',
    '.rr..g......',
    'rr..........',
  ],
  /** a war hammer: heavy attacks */
  hammer: [
    '...ssssss...',
    '..ssssssss..',
    '..ssssssss..',
    '..ssssssss..',
    '...sswwss...',
    '.....ww.....',
    '.....ww.....',
    '.....ww.....',
    '.....ww.....',
    '.....ww.....',
    '.....gg.....',
    '.....ww.....',
  ],
  /** a fist: power */
  fist: [
    '..mm.mm.mm..',
    '.mmmmmmmmmm.',
    '.mmmmmmmmmm.',
    '.m$m$m$m$mm.',
    'mmmmmmmmmmm.',
    'mm$$$$mmmmm.',
    'mmmmmmmmmmm.',
    '.mmmmmmmmm..',
    '..rrrrrrr...',
    '..rrrrrrr...',
  ],
  /** a skull: difficulty, defeat */
  skull: [
    '...hhhhhh...',
    '.hhhhhhhhhh.',
    'hhhhhhhhhhhh',
    'hhhhhhhhhhhh',
    'hhkkkhhkkkhh',
    'hhkkkhhkkkhh',
    'hhhhhkkhhhhh',
    '.hhhhhhhhhh.',
    '..hhhhhhhh..',
    '..hkhkhkhh..',
    '...hhhhhh...',
  ],
  /** a gold star: ability, passives, rank */
  star: [
    '.....gg.....',
    '.....gg.....',
    '....gggg....',
    'gggggggggggg',
    '.gggggggggg.',
    '..gggggggg..',
    '...gggggg...',
    '...gggggg...',
    '..ggg..ggg..',
    '..gg....gg..',
  ],
  /** a crown: rank, victory */
  crown: [
    'g....g....g.',
    'gg..ggg..gg.',
    'ggg.ggg.ggg.',
    'gggggggggggg',
    'ggrggbggrggg',
    'gggggggggggg',
    '111111111111',
  ],
  /** a training dummy: practice vs a bot */
  dummy: [
    '....wwww....',
    '...wwwwww...',
    '...wwwwww...',
    '....wwww....',
    'pppppppppppp',
    'pppppppppppp',
    '....pppp....',
    '....pppp....',
    '....pppp....',
    '....pppp....',
    '.....ww.....',
    '.....ww.....',
    '...wwwwww...',
  ],
  /** a gold medal on a red ribbon: ladder places */
  medal: [
    '.rr....rr.',
    '.rrr..rrr.',
    '..rrrrrr..',
    '...rrrr...',
    '..gggggg..',
    '.gggggggg.',
    '.ggg11ggg.',
    '.gg1gg1gg.',
    '.gggggggg.',
    '..gggggg..',
  ],
  /** a speech bubble: chat */
  chat: [
    'hhhhhhhhhhhh',
    'hhhhhhhhhhhh',
    'hhkkkkkkkkhh',
    'hhhhhhhhhhhh',
    'hhkkkkkkhhhh',
    'hhhhhhhhhhhh',
    'hhhhhhhhhhhh',
    '..hhh.......',
    '..hh........',
    '..h.........',
  ],
  /** three bars: menu */
  menu: [
    'hhhhhhhhhhhh',
    'hhhhhhhhhhhh',
    '............',
    '............',
    'hhhhhhhhhhhh',
    'hhhhhhhhhhhh',
    '............',
    '............',
    'hhhhhhhhhhhh',
    'hhhhhhhhhhhh',
  ],
  /** a monitor: graphics */
  screen: [
    'dddddddddddd',
    'dbbbbbbbbbbd',
    'dbbbbbbbbbbd',
    'dbbbbbbebbbd',
    'dbbbbbeeebbd',
    'dbeebeeeeebd',
    'deeeeeeeeeed',
    'dddddddddddd',
    '....dddd....',
    '..dddddddd..',
  ],
  /** a speaker: volume */
  speaker: [
    '......d.....',
    '.....dd..h..',
    '....ddd...h.',
    'ddddddd.h..h',
    'ddddddd..h.h',
    'ddddddd..h.h',
    'ddddddd.h..h',
    '....ddd...h.',
    '.....dd..h..',
    '......d.....',
  ],
  /** a mouse: sensitivity */
  mouse: [
    '...hhkhh...',
    '..hhhkhhh..',
    '.hhhhkhhhh.',
    '.hhhhkhhhh.',
    '.kkkkkkkkk.',
    '.hhhhhhhhh.',
    '.hhhhhhhhh.',
    '.hhhhhhhhh.',
    '..hhhhhhh..',
    '...hhhhh...',
  ],
  /** a sparkle: the weapon glint */
  sparkle: [
    '.....h.....',
    '.....h.....',
    '....hhh....',
    '...hhHhh...',
    'hhhhHHHhhhh',
    '...hhHhh...',
    '....hhh....',
    '.....h.....',
    '.....h.....',
  ],
  /** up and down arrows: invert */
  updown: [
    '...hh...',
    '..hhhh..',
    '.hhhhhh.',
    '...hh...',
    '...hh...',
    '...hh...',
    '...hh...',
    '.hhhhhh.',
    '..hhhh..',
    '...hh...',
  ],
  /** a wobbly camera: shake */
  camera: [
    '..ddd.......',
    'dddddddddddd',
    'ddddddhhhddd',
    'dddddhhbbhdd',
    'dddddhbbbhdd',
    'ddddddhhhddd',
    'dddddddddddd',
  ],
  /** rising bars: fps */
  gauge: [
    '.........ee.',
    '.........ee.',
    '......ee.ee.',
    '......ee.ee.',
    '...ee.ee.ee.',
    '...ee.ee.ee.',
    'ee.ee.ee.ee.',
    'ee.ee.ee.ee.',
    'dddddddddddd',
  ],
  /** a torii gate: the lobby, the safe zone */
  torii: [
    'rrrrrrrrrrrr',
    '.rrrrrrrrrr.',
    '..r......r..',
    'rrrrrrrrrrrr',
    '..r......r..',
    '..r......r..',
    '..r......r..',
    '..r......r..',
    '.ddd....ddd.',
  ],
  /** a mountain: arenas */
  mountain: [
    '......h.....',
    '.....hhh....',
    '....hhssh...',
    '...ssssss...',
    '..ssssssse..',
    '..sssss.eee.',
    '.sssss.eeeee',
    'sssss.eeeeee',
  ],
  /** a keycap: controls */
  keys: [
    'hhhhhhhhhhhh',
    'hdddhdddhddh',
    'hdddhdddhddh',
    'hhhhhhhhhhhh',
    'hddhddddhddh',
    'hddhddddhddh',
    'hhhhhhhhhhhh',
  ],
  /** skip chevrons: cancels */
  chain: [
    'g.....g.....',
    'gg....gg....',
    'ggg...ggg...',
    'gggg..gggg..',
    'ggggg.ggggg.',
    'gggg..gggg..',
    'ggg...ggg...',
    'gg....gg....',
    'g.....g.....',
  ],
  /** a check mark: accept, good */
  check: [
    '..........ee',
    '.........eee',
    '........eee.',
    'ee.....eee..',
    'eee...eee...',
    '.eee.eee....',
    '..eeeee.....',
    '...eee......',
  ],
  /** an info mark */
  info: [
    '....bbbb....',
    '..bbbbbbbb..',
    '.bbbbHHbbbb.',
    'bbbbbHHbbbbb',
    'bbbbbbbbbbbb',
    'bbbbHHHbbbbb',
    'bbbbbHHbbbbb',
    'bbbbbHHbbbbb',
    '.bbbHHHHbbb.',
    '..bbbbbbbb..',
    '....bbbb....',
  ],
  /** a die: random */
  dice: [
    'hhhhhhhhhhhh',
    'hkkhhhhhhkkh',
    'hkkhhhhhhkkh',
    'hhhhhhhhhhhh',
    'hhhhhkkhhhhh',
    'hhhhhkkhhhhh',
    'hhhhhhhhhhhh',
    'hkkhhhhhhkkh',
    'hkkhhhhhhkkh',
    'hhhhhhhhhhhh',
  ],
  /** up and down chevrons: rating changes */
  up: ['...ee...', '..eeee..', '.eeeeee.', 'eeeeeeee', '...ee...', '...ee...'],
  down: ['...rr...', '...rr...', 'rrrrrrrr', '.rrrrrr.', '..rrrr..', '...rr...'],
  /** an eye: passive */
  eye: [
    '...hhhhhh...',
    '.hhhhhhhhhh.',
    'hhhhcccchhhh',
    'hhhcckkcchhh',
    'hhhcckkcchhh',
    'hhhhcccchhhh',
    '.hhhhhhhhhh.',
    '...hhhhhh...',
  ],
  /** a broken blade: defeat */
  broken: [
    '..........hh',
    '.........hhh',
    '........hhh.',
    '.......hhh..',
    '............',
    '.....hh.....',
    '....hhh.....',
    '.g.hhh......',
    '..ghh.......',
    '..rgg.......',
    '.rr..g......',
    'rr..........',
  ],
} satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof ICON;

/** An icon from the set as inline SVG. */
export function icon(name: IconName, cls = ''): string {
  return pixelSVG(ICON[name], { cls });
}

/** The grid with one material swapped for another (all three of its tones). */
export function recolor(rows: readonly string[], from: string, to: string): string[] {
  const map: Record<string, string> = { [from]: to, [from.toUpperCase()]: to.toUpperCase(), [LO[from]]: LO[to] };
  return rows.map((r) => r.replace(/./g, (ch) => map[ch] ?? ch));
}
