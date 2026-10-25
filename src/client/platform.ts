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
 *   updateRoom / leftRoom        which lobby the player is in and whether friends can join it, so
 *                                CrazyGames can offer Join and Invite (the lobby is the room)
 *
 * And what it hears back: the platform's settings (mute, chat off), the invite a player arrived
 * with, a friend's room to join from in the game, and whether to drop straight into multiplayer.
 */

export interface PlatformSettings {
  muteAudio: boolean;
  /** the player (or their parent) has turned chat off on CrazyGames */
  disableChat: boolean;
}

/** What a friend needs to join: the lobby's id. */
export type InviteParams = Record<string, string>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sdk = any;

class Platform {
  env: 'none' | 'local' | 'crazygames' | 'disabled' = 'none';
  settings: PlatformSettings = { muteAudio: false, disableChat: false };
  private sdk: Sdk = null;
  private playing = false;
  private loading = false;
  private listeners: ((s: PlatformSettings) => void)[] = [];
  /** the room last reported, so a lobby's every coming and going isn't sent on */
  private room = '';

  async init(timeoutMs = 4000): Promise<void> {
    const sdk = (window as unknown as { CrazyGames?: { SDK?: Sdk } }).CrazyGames?.SDK;
    if (!sdk) return;
    try {
      await Promise.race([sdk.init(), new Promise((_, reject) => setTimeout(() => reject(new Error('SDK init timed out')), timeoutMs))]);
      this.env = sdk.environment ?? 'crazygames';
      if (this.env === 'disabled') return;
      this.sdk = sdk;
      const s = sdk.game?.settings;
      if (s) this.settings = { muteAudio: !!s.muteAudio, disableChat: !!s.disableChat };
      sdk.game?.addSettingsChangeListener?.((next: PlatformSettings) => {
        this.settings = { muteAudio: !!next.muteAudio, disableChat: !!next.disableChat };
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

  // ------------------------------------------------------------------ multiplayer

  /** Started from CrazyGames' multiplayer UI: go straight into a joinable game, no menus. */
  get instantMultiplayer(): boolean {
    return !!this.call((s) => s.game.isInstantMultiplayer);
  }

  /** The invite the game was opened from (a friend's room), if any. */
  inviteParams(): InviteParams | null {
    return this.call((s) => s.game.inviteParams as InviteParams | null) ?? null;
  }

  /** A friend's room picked in CrazyGames' UI while already playing. */
  onJoinRoom(listener: (params: InviteParams) => void): void {
    this.call((s) => s.game.addJoinRoomListener(listener));
  }

  /** The player is in this room, and friends can (or can't) join it. */
  updateRoom(roomId: string, isJoinable: boolean, inviteParams: InviteParams): void {
    const key = `${roomId}|${isJoinable}`;
    if (key === this.room) return;
    this.room = key;
    this.call((s) => s.game.updateRoom({ roomId, isJoinable, inviteParams }));
  }

  leftRoom(): void {
    if (!this.room) return;
    this.room = '';
    this.call((s) => s.game.leftRoom());
  }

  /** A link to this game on CrazyGames that opens with these invite params. */
  inviteLink(params: InviteParams): string | null {
    return this.call((s) => s.game.inviteLink(params) as string) ?? null;
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
