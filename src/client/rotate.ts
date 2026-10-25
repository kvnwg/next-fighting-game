/**
 * The game is played sideways. On a phone or tablet held upright (or a window taller than it is
 * wide and small enough to be one) a screen over everything, the title and menus included, asks
 * for the device to be turned, and the game takes no input until it is. Where the browser allows
 * it (Android, once in fullscreen) the first tap also locks the screen to landscape.
 */
export class RotateGuard {
  blocked = false;
  private readonly el: HTMLElement;

  constructor(
    private readonly touch: boolean,
    private readonly onChange: (blocked: boolean) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'rotate-guard hidden';
    this.el.innerHTML = '<div class="rg-phone"><span></span></div><div class="rg-text">Turn your device sideways to play</div>';
    // nothing gets through to the game underneath
    for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'contextmenu']) this.el.addEventListener(ev, (e) => e.stopPropagation());
    document.body.appendChild(this.el);
    const check = () => this.update();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    screen.orientation?.addEventListener?.('change', check);
    if (touch) window.addEventListener('pointerdown', () => void this.lockLandscape(), { once: true, capture: true });
    this.update();
  }

  private update(): void {
    const portrait = window.innerHeight > window.innerWidth * 1.05;
    const small = Math.min(window.innerWidth, window.innerHeight) < 900;
    const blocked = portrait && (this.touch || small);
    if (blocked === this.blocked) return;
    this.blocked = blocked;
    this.el.classList.toggle('hidden', !blocked);
    this.onChange(blocked);
  }

  /** Fullscreen and a landscape lock, where they're allowed (not on iPhones, nor in some frames). */
  private async lockLandscape(): Promise<void> {
    try {
      const root = document.documentElement;
      if (!document.fullscreenElement && root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
    } catch {
      // refused: the guard screen still covers portrait
    }
  }
}
