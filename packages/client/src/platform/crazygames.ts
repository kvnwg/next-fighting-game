/**
 * Thin wrapper around the CrazyGames HTML5 SDK v3. Every call is safe to make off
 * CrazyGames (the SDK throws there) and before init; it simply does nothing.
 */

export interface PlatformUser {
  name: string;
  avatar: string | null;
  loggedIn: boolean;
}

export interface PlatformSettings {
  muteAudio: boolean;
  disableChat: boolean;
}

export interface RoomInfo {
  roomId?: string;
  isJoinable?: boolean;
  inviteParams?: Record<string, string>;
}

type Sdk = any;

const STORAGE_PREFIX = 'nfg:';

export class Platform {
  env: 'none' | 'local' | 'crazygames' | 'disabled' = 'none';
  settings: PlatformSettings = { muteAudio: false, disableChat: false };
  private sdk: Sdk = null;
  private playing = false;
  private loading = false;
  private settingsListeners: ((s: PlatformSettings) => void)[] = [];

  async init(timeoutMs = 4000): Promise<void> {
    const sdk = (window as any).CrazyGames?.SDK;
    if (!sdk) return;
    try {
      await Promise.race([
        sdk.init(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SDK init timed out')), timeoutMs)),
      ]);
      this.env = sdk.environment ?? 'crazygames';
      if (this.env === 'disabled') return;
      this.sdk = sdk;
      const s = sdk.game?.settings;
      if (s) this.settings = { muteAudio: !!s.muteAudio, disableChat: !!s.disableChat };
      sdk.game?.addSettingsChangeListener?.((next: PlatformSettings) => {
        this.settings = { muteAudio: !!next.muteAudio, disableChat: !!next.disableChat };
        for (const l of this.settingsListeners) l(this.settings);
      });
    } catch (err) {
      console.warn('[platform] CrazyGames SDK unavailable:', err);
      this.sdk = null;
    }
  }

  get active(): boolean {
    return this.sdk !== null;
  }

  private call<T>(fn: (sdk: Sdk) => T): T | undefined {
    if (!this.sdk) return undefined;
    try {
      return fn(this.sdk);
    } catch (err) {
      console.warn('[platform]', err);
      return undefined;
    }
  }

  onSettingsChange(listener: (s: PlatformSettings) => void): void {
    this.settingsListeners.push(listener);
  }

  loadingStart(): void {
    if (this.loading) return;
    this.loading = true;
    this.call((s) => s.game.loadingStart());
  }

  loadingStop(): void {
    if (!this.loading) return;
    this.loading = false;
    this.call((s) => s.game.loadingStop());
  }

  /** Player is in a playable state. The first call ends CrazyGames' initial-download measurement. */
  gameplayStart(): void {
    if (this.playing) return;
    this.playing = true;
    this.call((s) => s.game.gameplayStart());
  }

  /** Menus, cutscenes, results and pauses are breaks. */
  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.call((s) => s.game.gameplayStop());
  }

  happytime(): void {
    this.call((s) => s.game.happytime());
  }

  /**
   * Requests a midgame ad. Resolves when it finishes, fails, is unfilled, blocked or
   * on cooldown; the game always carries on. `onStart` fires only if an ad really plays.
   */
  requestMidgameAd(onStart: () => void): Promise<'played' | 'skipped'> {
    const sdk = this.sdk;
    if (!sdk) return Promise.resolve('skipped');
    return new Promise((resolve) => {
      let started = false;
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(safety);
        resolve(started ? 'played' : 'skipped');
      };
      // If the SDK never calls back, don't leave the player stuck behind a blocked UI.
      const safety = setTimeout(done, 60_000);
      try {
        sdk.ad.requestAd('midgame', {
          adStarted: () => {
            started = true;
            onStart();
          },
          adFinished: done,
          adError: done,
        });
      } catch (err) {
        console.warn('[platform] requestAd failed:', err);
        done();
      }
    });
  }

  async getUser(): Promise<PlatformUser | null> {
    if (!this.sdk) return null;
    try {
      if (!this.sdk.user?.isUserAccountAvailable) return null;
      const u = await this.sdk.user.getUser();
      if (!u) return null;
      return { name: u.username, avatar: u.profilePictureUrl ?? null, loggedIn: true };
    } catch {
      return null;
    }
  }

  /** Only trusted on CrazyGames itself: the SDK's local mode always reports a demo "desktop". */
  get deviceType(): 'desktop' | 'tablet' | 'mobile' | null {
    if (this.env !== 'crazygames') return null;
    return this.call((s) => s.user?.systemInfo?.device?.type ?? null) ?? null;
  }

  get isInstantMultiplayer(): boolean {
    return !!this.call((s) => s.game.isInstantMultiplayer);
  }

  get inviteParams(): Record<string, string> | null {
    return this.call((s) => s.game.inviteParams ?? null) ?? null;
  }

  onJoinRoom(listener: (params: Record<string, string>) => void): void {
    this.call((s) => s.game.addJoinRoomListener?.(listener));
  }

  updateRoom(info: RoomInfo): void {
    this.call((s) => s.game.updateRoom?.(info));
  }

  leftRoom(): void {
    this.call((s) => s.game.leftRoom?.());
  }

  inviteLink(params: Record<string, string>): string | null {
    const link = this.call((s) => s.game.inviteLink(params));
    if (typeof link === 'string') return link;
    // Off CrazyGames, fall back to a plain link to this page.
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url.toString();
  }

  /** Progress storage: the CrazyGames Data module when available, localStorage otherwise. */
  getItem(key: string): string | null {
    if (this.sdk) {
      try {
        return this.sdk.data.getItem(key);
      } catch (err) {
        console.warn('[platform] data.getItem failed:', err);
      }
    }
    try {
      return localStorage.getItem(STORAGE_PREFIX + key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    if (this.sdk) {
      try {
        this.sdk.data.setItem(key, value);
        return;
      } catch (err) {
        console.warn('[platform] data.setItem failed:', err);
      }
    }
    try {
      localStorage.setItem(STORAGE_PREFIX + key, value);
    } catch {
      // Storage can be unavailable (private mode); progress just won't persist.
    }
  }
}
