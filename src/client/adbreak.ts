/**
 * Ads that pay. Chosen in the shop it's CrazyGames' rewarded ad; the one that plays by itself after
 * every match is their midgame ad (a rewarded ad must be the player's own choice there). Anywhere
 * without an ad network (this preview, local play) a stand-in ad break plays out instead, the same
 * length as a short ad, so the whole flow can be played. The game is muted while any of them runs.
 */
import { AD_MIN_GAP_MS } from '../shared/progress';
import { audio } from './audio';
import { platform } from './platform';

/** how long the stand-in runs (no shorter than the server will pay for) */
const STAND_IN_MS = AD_MIN_GAP_MS + 1000;

/** CrazyGames plays at most one midgame ad every 3 minutes and ignores requests sooner */
const MIDGAME_GAP_MS = 3 * 60_000;

let running: Promise<boolean> | null = null;
let lastPlayed = -Infinity;
let lastFailed = false;

/**
 * Whether an ad will most likely play after this match, so the result card only promises one when
 * it's coming: not inside CrazyGames' 3-minute gap, nor while ads aren't being served (the first
 * weeks on CrazyGames, unfilled, an adblocker). The ad is still asked for either way.
 */
export function matchAdExpected(): boolean {
  if (!platform.hasAds) return true;
  return !lastFailed && performance.now() - lastPlayed > MIDGAME_GAP_MS;
}

/** Show an ad; true if it was watched to the end (the reward is earned). */
export function watchAd(): Promise<boolean> {
  if (running) return running;
  running = (async () => {
    audio.setMuted('ad', true);
    try {
      const r = await platform.requestRewardedAd(() => undefined);
      if (r === 'unavailable') return await standIn();
      return r === 'rewarded';
    } finally {
      audio.setMuted('ad', false);
      running = null;
    }
  })();
  return running;
}

/** The ad after a match, played without asking; true if it ran to the end (its coins are earned). */
export function matchAd(): Promise<boolean> {
  if (running) return running;
  running = (async () => {
    audio.setMuted('ad', true);
    try {
      if (!platform.hasAds) return await standIn();
      const played = (await platform.requestMidgameAd(() => undefined)) === 'played';
      const now = performance.now();
      if (played) {
        lastPlayed = now;
        lastFailed = false;
      } else if (now - lastPlayed > MIDGAME_GAP_MS) lastFailed = true; // inside the gap a refusal says nothing
      return played;
    } finally {
      audio.setMuted('ad', false);
      running = null;
    }
  })();
  return running;
}

function standIn(): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'adbreak';
    el.innerHTML = `
      <div class="ab-box">
        <div class="ab-jp">広告</div>
        <div class="ab-title">Ad break</div>
        <div class="ab-bar"><i></i></div>
        <div class="ab-count"></div>
        <div class="ab-note">A real ad plays here in the released game.</div>
      </div>`;
    (document.getElementById('app') ?? document.body).appendChild(el);
    const bar = el.querySelector<HTMLElement>('.ab-bar i')!;
    const count = el.querySelector<HTMLElement>('.ab-count')!;
    const start = performance.now();
    const tick = () => {
      const left = Math.max(0, STAND_IN_MS - (performance.now() - start));
      bar.style.width = `${(1 - left / STAND_IN_MS) * 100}%`;
      count.textContent = left > 0 ? `Your reward in ${Math.ceil(left / 1000)}` : 'Reward earned';
      if (left > 0) {
        requestAnimationFrame(tick);
        return;
      }
      el.classList.add('out');
      setTimeout(() => el.remove(), 250);
      resolve(true);
    };
    tick();
  });
}
