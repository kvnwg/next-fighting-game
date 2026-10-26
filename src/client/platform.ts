/**
 * Thin wrapper around the CrazyGames HTML5 SDK v3 (loaded by the CrazyGames build; see
 * scripts/build-crazygames.mjs). Every call is safe off CrazyGames and before init: it does nothing.
 *
 * What the game tells the platform:
 *   loadingStart / loadingStop  while the first scene is being built
 *   gameplayStart / gameplayStop when the player is (or stops being) in control: menus, the title
 *                                screen and match results are breaks
 *   happytime                    a rare celebration (a ranked promotion)
 *   requestMidgameAd             only at natural breaks (after a match), never mid-fight
 */

export interface PlatformSettings {
  muteAudio: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sdk = any;

class Platform {
  env: 'none' | 'local' | 'crazygames' | 'disabled' = 'none';
  settings: PlatformSettings = { muteAudio: false };
  private sdk: Sdk = null;
  private playing = false;
  private loading = false;
  private listeners: ((s: PlatformSettings) => void)[] = [];

  async init(timeoutMs = 4000): Promise<void> {
    const sdk = (window as unknown as { CrazyGames?: { SDK?: Sdk } }).CrazyGames?.SDK;
    if (!sdk) return;
    try {
      await Promise.race([sdk.init(), new Promise((_, reject) => setTimeout(() => reject(new Error('SDK init timed out')), timeoutMs))]);
      this.env = sdk.environment ?? 'crazygames';
      if (this.env === 'disabled') return;
      this.sdk = sdk;
      const s = sdk.game?.settings;
      if (s) this.settings = { muteAudio: !!s.muteAudio };
      sdk.game?.addSettingsChangeListener?.((next: PlatformSettings) => {
        this.settings = { muteAudio: !!next.muteAudio };
        for (const l of this.listeners) l(this.settings);
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
    this.listeners.push(listener);
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

  gameplayStart(): void {
    if (this.playing) return;
    this.playing = true;
    this.call((s) => s.game.gameplayStart());
  }

  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.call((s) => s.game.gameplayStop());
  }

  happytime(): void {
    this.call((s) => s.game.happytime());
  }

  /**
   * Request a midgame ad. Resolves when it finishes, fails, is unfilled or on cooldown: the game
   * always carries on. `onStart` fires only if an ad really plays (mute the game then).
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
      // if the SDK never calls back, don't leave the player stuck behind a blocked screen
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

  /**
   * A rewarded ad, the kind a player chooses to watch for a reward. Resolves 'rewarded' only if it
   * played to the end; 'skipped' if it failed, was unfilled or was closed early; 'unavailable' off
   * CrazyGames (the caller shows its own stand-in then). `onStart` fires when it really starts.
   */
  requestRewardedAd(onStart: () => void): Promise<'rewarded' | 'skipped' | 'unavailable'> {
    const sdk = this.sdk;
    if (!sdk) return Promise.resolve('unavailable');
    return new Promise((resolve) => {
      let settled = false;
      const done = (r: 'rewarded' | 'skipped') => {
        if (settled) return;
        settled = true;
        clearTimeout(safety);
        resolve(r);
      };
      const safety = setTimeout(() => done('skipped'), 90_000);
      try {
        sdk.ad.requestAd('rewarded', {
          adStarted: onStart,
          adFinished: () => done('rewarded'),
          adError: () => done('skipped'),
        });
      } catch (err) {
        console.warn('[platform] rewarded requestAd failed:', err);
        done('skipped');
      }
    });
  }

  /** The CrazyGames account name, when the player is signed in. */
  async username(): Promise<string | null> {
    if (!this.sdk?.user?.isUserAccountAvailable) return null;
    try {
      const u = await this.sdk.user.getUser();
      return u?.username ?? null;
    } catch {
      return null;
    }
  }

  /** Progress storage: CrazyGames' cloud data when available, localStorage otherwise. */
  getItem(key: string): string | null {
    if (this.sdk) {
      try {
        return this.sdk.data.getItem(key);
      } catch (err) {
        console.warn('[platform] data.getItem failed:', err);
      }
    }
    try {
      return localStorage.getItem(key);
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
      localStorage.setItem(key, value);
    } catch {
      // storage unavailable (private mode): progress just won't persist
    }
  }
}

export const platform = new Platform();
