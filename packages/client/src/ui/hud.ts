import { MAX_HP, MAX_POSTURE, ROUNDS_TO_WIN, type PlayerInfo } from '@nfg/shared';

export type HudMode = 'hidden' | 'practice' | 'fight';

export interface HudState {
  hp: [number, number];
  posture: [number, number];
  broken: [boolean, boolean];
  roundsWon: [number, number];
  round: number;
  /** Seconds left, or null to hide the timer (practice). */
  timer: number | null;
  dodgeCharges: number;
  critReady: boolean;
  ping: number | null;
}

const SHIELD_SVG = `<svg viewBox="0 0 50 56" xmlns="http://www.w3.org/2000/svg">
  <path d="M25 2 L46 9 L44 30 C42 42 34 50 25 54 C16 50 8 42 6 30 L4 9 Z" fill="#e9e6ee" stroke="#15121b" stroke-width="2.5"/>
  <path d="M25 8 L40 13 L38.5 30 C37 39 31.5 45 25 48.5 C18.5 45 13 39 11.5 30 L10 13 Z" fill="none" stroke="#9a96a6" stroke-width="2"/>
  <path class="crack c1" d="M25 6 L22 18 L28 24 L23 34" fill="none" stroke="#15121b" stroke-width="2.5"/>
  <path class="crack c2" d="M28 24 L37 28 M22 18 L12 21 M23 34 L18 44 M23 34 L30 43" fill="none" stroke="#15121b" stroke-width="2.2"/>
</svg>`;

interface Side {
  root: HTMLElement;
  portrait: HTMLElement;
  title: HTMLElement;
  name: HTMLElement;
  fill: HTMLElement;
  trail: HTMLElement;
  flash: HTMLElement;
  pips: HTMLElement[];
  ping: HTMLElement;
  hp: number;
  trailHp: number;
  trailHold: number;
  flashT: number;
}

function initials(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
}

/** Percent-encodes anything that could break out of a CSS url() inside an HTML attribute. */
function cssUrl(url: string): string {
  return encodeURI(url).replace(/['"()\\]/g, (c) => `%${c.charCodeAt(0).toString(16)}`);
}

export function avatarHtml(p: PlayerInfo, color: string): string {
  if (p.avatar && /^https:\/\//.test(p.avatar)) return `<div style="background-image:url('${cssUrl(p.avatar)}')"></div>`;
  return `<div style="background:${color}">${initials(p.name)}</div>`;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly sides: [Side, Side];
  private readonly roundEl: HTMLElement;
  private readonly timerEl: HTMLElement;
  private readonly postureL: HTMLElement;
  private readonly postureR: HTMLElement;
  private readonly postureGlow: HTMLElement;
  private readonly postureRoot: HTMLElement;
  private readonly shield: HTMLElement;
  private readonly charges: HTMLElement[];
  private readonly crit: HTMLElement;
  private readonly enemyBar: HTMLElement;
  private readonly enemyPosture: HTMLElement;
  private readonly enemyL: HTMLElement;
  private readonly enemyR: HTMLElement;
  private readonly enemyHp: HTMLElement;
  private mode: HudMode = 'hidden';
  private topIn = true;
  private readonly banner: HTMLElement;
  private readonly hintEl: HTMLElement;
  private bannerTimer = 0;
  private hintTimer = 0;
  private glowT = 0;
  private you: 0 | 1 = 0;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud hidden';
    const side = (cls: string) => `
      <div class="hud-side ${cls}">
        <div class="portrait"><div></div></div>
        <div class="side-info">
          <div class="side-title"></div>
          <div class="side-name"></div>
          <div class="hp"><div class="hp-trail"></div><div class="hp-fill"></div><div class="hp-flash"></div></div>
          <div class="side-meta"><div class="pips">${'<div class="pip"></div>'.repeat(ROUNDS_TO_WIN)}</div><span class="ping"></span></div>
        </div>
      </div>`;
    this.root.innerHTML = `
      <div class="hud-top">
        ${side('left')}${side('right')}
        <div class="hud-center"><div class="hud-round"></div><div class="hud-timer"></div></div>
      </div>
      <div class="posture">
        <div class="posture-glow"></div>
        <div class="posture-bar l"><div></div></div>
        <div class="posture-bar r"><div></div></div>
        <div class="shield">${SHIELD_SVG}</div>
        <div class="charges"><div class="charge"></div><div class="charge"></div></div>
        <div class="crit-ready" title="Hold HEAVY for a critical">!</div>
      </div>
      <div class="enemy-bar">
        <div class="enemy-hp"><div></div></div>
        <div class="enemy-posture"><div class="half"><div></div></div><div class="half"><div></div></div><div class="shield mini">${SHIELD_SVG}</div></div>
      </div>
      <div class="banner"></div>
      <div class="hint"></div>`;
    container.appendChild(this.root);

    const mk = (el: HTMLElement): Side => ({
      root: el,
      portrait: el.querySelector('.portrait')!,
      title: el.querySelector('.side-title')!,
      name: el.querySelector('.side-name')!,
      fill: el.querySelector('.hp-fill')!,
      trail: el.querySelector('.hp-trail')!,
      flash: el.querySelector('.hp-flash')!,
      pips: [...el.querySelectorAll<HTMLElement>('.pip')],
      ping: el.querySelector('.ping')!,
      hp: MAX_HP,
      trailHp: MAX_HP,
      trailHold: 0,
      flashT: 1,
    });
    this.sides = [mk(this.root.querySelector('.hud-side.left')!), mk(this.root.querySelector('.hud-side.right')!)];
    this.roundEl = this.root.querySelector('.hud-round')!;
    this.timerEl = this.root.querySelector('.hud-timer')!;
    this.postureL = this.root.querySelector('.posture-bar.l > div')!;
    this.postureR = this.root.querySelector('.posture-bar.r > div')!;
    this.postureGlow = this.root.querySelector('.posture-glow')!;
    this.postureRoot = this.root.querySelector('.posture')!;
    this.shield = this.root.querySelector('.shield')!;
    this.charges = [...this.root.querySelectorAll<HTMLElement>('.charge')];
    this.crit = this.root.querySelector('.crit-ready')!;
    this.enemyBar = this.root.querySelector('.enemy-bar')!;
    this.enemyPosture = this.root.querySelector('.enemy-posture')!;
    this.enemyL = this.root.querySelector('.enemy-posture > .half:first-child > div')!;
    this.enemyR = this.root.querySelector('.enemy-posture > .half:nth-child(2) > div')!;
    this.enemyHp = this.root.querySelector('.enemy-hp > div')!;
    this.banner = this.root.querySelector('.banner')!;
    this.hintEl = this.root.querySelector('.hint')!;
  }

  /**
   * 'practice' keeps only the posture strip and the floating bar (the arena's lobby buttons own the
   * top of the screen); 'fight' is the full HUD. The HUD never shows outside those two.
   */
  setMode(mode: HudMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.root.classList.toggle('hidden', mode === 'hidden');
    this.root.classList.toggle('practice', mode === 'practice');
  }

  /** Health bars and the posture strip slide in when the first round's "Fight" lands. */
  setTopIn(topIn: boolean): void {
    if (topIn === this.topIn) return;
    this.topIn = topIn;
    this.root.classList.toggle('top-out', !topIn);
  }

  /** The local player is always drawn on the left. */
  setPlayers(you: 0 | 1, players: [PlayerInfo, PlayerInfo]): void {
    this.you = you;
    const order: [PlayerInfo, PlayerInfo] = you === 0 ? players : [players[1], players[0]];
    order.forEach((p, i) => {
      const s = this.sides[i]!;
      s.portrait.innerHTML = avatarHtml(p, i === 0 ? '#c9a21e' : '#a8346f');
      s.title.textContent = p.title;
      s.name.textContent = p.name;
      s.hp = s.trailHp = MAX_HP;
    });
  }

  private sideOf(fighter: 0 | 1): Side {
    return this.sides[fighter === this.you ? 0 : 1]!;
  }

  /** White flash on a health bar when that fighter takes damage. */
  hpHit(fighter: 0 | 1): void {
    const s = this.sideOf(fighter);
    s.flashT = 0;
    s.trailHold = 0.5;
  }

  postureFlash(kind: 'red' | 'gold'): void {
    this.postureGlow.classList.toggle('gold', kind === 'gold');
    this.glowT = 0.45;
  }

  showBanner(text: string, seconds: number, small = false): void {
    this.banner.textContent = text;
    this.banner.classList.toggle('small', small);
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    this.bannerTimer = seconds;
  }

  hideBanner(): void {
    this.banner.classList.remove('show');
    this.bannerTimer = 0;
  }

  clearHint(): void {
    this.hintEl.classList.remove('show');
    this.hintTimer = 0;
  }

  hint(text: string, seconds = 3): void {
    this.hintEl.textContent = text;
    this.hintEl.classList.add('show');
    this.hintTimer = seconds;
  }

  /**
   * Places the opponent's posture bar (and, in practice, their health) above their head;
   * pass null to hide it.
   */
  placeEnemyBar(screen: { x: number; y: number } | null, posture: number, broken: boolean, hp: number | null = null): void {
    if (!screen) {
      this.enemyBar.style.display = 'none';
      return;
    }
    // Keep it below the health bars when a punch-in pushes their head to the top of the frame.
    const u = Math.min(window.innerWidth / 100, window.innerHeight * 0.0178);
    this.enemyBar.style.display = 'flex';
    this.enemyBar.style.left = `${screen.x}px`;
    this.enemyBar.style.top = `${Math.max(screen.y, 19 * u)}px`;
    const pct = `${Math.min(100, (posture / MAX_POSTURE) * 100).toFixed(1)}%`;
    this.enemyL.style.width = pct;
    this.enemyR.style.width = pct;
    this.enemyPosture.classList.toggle('broken', broken);
    this.enemyBar.classList.toggle('with-hp', hp !== null);
    if (hp !== null) this.enemyHp.style.width = `${Math.max(0, (hp / MAX_HP) * 100).toFixed(1)}%`;
  }

  update(state: HudState, dt: number): void {
    const order: [0 | 1, 0 | 1] = this.you === 0 ? [0, 1] : [1, 0];
    order.forEach((fighter, i) => {
      const s = this.sides[i]!;
      const hp = state.hp[fighter];
      if (hp > s.hp) s.trailHp = hp;
      s.hp = hp;
      // The yellow chunk holds for half a second, then drains at 40% of the bar per second.
      if (s.trailHold > 0) s.trailHold -= dt;
      else s.trailHp = Math.max(hp, s.trailHp - MAX_HP * 0.4 * dt);
      s.fill.style.width = `${(hp / MAX_HP) * 100}%`;
      s.trail.style.width = `${(s.trailHp / MAX_HP) * 100}%`;
      s.flashT += dt;
      s.flash.style.width = s.trail.style.width;
      s.flash.style.opacity = s.flashT < 0.033 ? '1' : Math.max(0, 1 - (s.flashT - 0.033) / 0.12).toFixed(2);
      s.pips.forEach((p, k) => p.classList.toggle('won', k < state.roundsWon[fighter]));
      s.ping.textContent = i === 0 && state.ping !== null ? `${Math.round(state.ping)}ms` : '';
    });

    this.roundEl.textContent = state.timer === null ? 'PRACTICE' : `ROUND ${state.round}`;
    this.timerEl.textContent = state.timer === null ? '' : String(Math.ceil(state.timer));

    const mine = state.posture[this.you];
    const pct = `${Math.min(100, (mine / MAX_POSTURE) * 100).toFixed(1)}%`;
    this.postureL.style.width = pct;
    this.postureR.style.width = pct;
    const frac = mine / MAX_POSTURE;
    const shattered = frac >= 0.85;
    this.shield.classList.toggle('broken', shattered);
    this.shield.classList.toggle('cracked', !shattered && frac >= 0.6);
    this.postureRoot.classList.toggle('broken', state.broken[this.you]);
    this.charges.forEach((c, k) => c.classList.toggle('empty', k >= state.dodgeCharges));
    this.crit.classList.toggle('cooling', !state.critReady);

    if (this.glowT > 0) {
      this.glowT -= dt;
      this.postureGlow.style.opacity = Math.max(0, this.glowT / 0.45).toFixed(2);
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('show');
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hintEl.classList.remove('show');
    }
  }
}
