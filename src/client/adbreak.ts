/**
 * Watching an ad for a reward. On CrazyGames it's their rewarded ad; anywhere without an ad network
 * (this preview, local play) a stand-in ad break plays out instead, the same length as a short ad,
 * so the whole flow can be played. The game is muted while either runs.
 */
import { AD_MIN_GAP_MS } from '../shared/progress';
import { audio } from './audio';
import { platform } from './platform';

/** how long the stand-in runs (no shorter than the server will pay for) */
const STAND_IN_MS = AD_MIN_GAP_MS + 1000;

let running: Promise<boolean> | null = null;

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
