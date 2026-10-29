/**
 * Phones and tablets play whichever way up they're held. Upright, the stylesheet's portrait rules
 * rearrange the touch controls, HUD and menus for a tall screen, and the camera pulls back so both
 * fighters stay in frame (camera.ts); on its side the game plays as it always has.
 */

/** The screen is upright: taller than it is wide. */
export function isPortrait(): boolean {
  return window.innerHeight > window.innerWidth * 1.05;
}

/** Calls back whenever the screen turns between upright and sideways. */
export function watchOrientation(onChange: (portrait: boolean) => void): void {
  let was = isPortrait();
  const check = () => {
    const now = isPortrait();
    if (now === was) return;
    was = now;
    onChange(now);
  };
  window.addEventListener('resize', check);
  window.addEventListener('orientationchange', check);
  screen.orientation?.addEventListener?.('change', check);
}
