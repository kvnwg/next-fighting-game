/**
 * Thin wrapper around the platform SDKs: CrazyGames' HTML5 SDK v3 (loaded by the CrazyGames build;
 * see scripts/build-crazygames.mjs) and Poki's (the Poki build; scripts/build-poki.mjs). Every call
 * is safe off them and before init: it does nothing.
 *
 * What the game tells the platform:
 *   loadingStart / loadingStop  while the first scene is being built (Poki: gameLoadingFinished)
 *   gameplayStart / gameplayStop when the player is (or stops being) in control: menus, the title
 *                                screen and match results are breaks
 *   happytime                    a rare celebration (a ranked promotion; CrazyGames only)
 *   requestMidgameAd             only at natural breaks (after a match), never mid-fight (Poki: its
 *                                commercialBreak, as the player goes back to playing)
 */

/** The Poki build: Poki's SDK and its rules (no chat between players, no blood), SDK or not. */
export const POKI = import.meta.env.VITE_PLATFORM === 'poki';

export interface PlatformSettings {
  muteAudio: boolean;
  /** the player (or a parent) has turned chat off on CrazyGames */
  disableChat: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sdk = any;

class Platform {
  env: 'none' | 'local' | 'crazygames' | 'disabled' | 'poki' = 'none';
  // Poki allows no chat between players at all
  settings: PlatformSettings = { muteAudio: false, disableChat: POKI };
  /** CrazyGames' SDK */
  private sdk: Sdk = null;
  /** Poki's SDK */
  private poki: Sdk = null;
  private playing = false;
  private loading = false;
  /** an ad is on screen: Poki wants no gameplay events till it's over, so the last one waits */
  private inAd = false;
  private afterAd: boolean | null = null;
  /** Poki's shareable link for the private lobby the player is in (it comes back async) */
  private shareLink: { code: string; url: string } | null = null;
  private listeners: ((s: PlatformSettings) => void)[] = [];

  async init(timeoutMs = 4000): Promise<void> {
    if (POKI) return this.initPoki(timeoutMs);
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

  private async initPoki(timeoutMs: number): Promise<void> {
    // Poki allows no plain links out of the game: every one (the credits, the privacy policy) goes
    // through its SDK
    document.addEventListener(
      'click',
      (e) => {
        const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
        if (!a || !/^https?:/.test(a.href)) return;
        e.preventDefault();
        this.openExternalLink(a.href);
      },
      true,
    );
    // nor may the game scroll Poki's page: no arrow keys, space or wheel reach it (text boxes and
    // the menus that scroll keep theirs)
    window.addEventListener('keydown', (e) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
    });
    window.addEventListener(
      'wheel',
      (e) => {
        for (let el = e.target as HTMLElement | null; el && el !== document.body; el = el.parentElement) {
          const y = getComputedStyle(el).overflowY;
          if ((y === 'auto' || y === 'scroll') && el.scrollHeight > el.clientHeight) return;
        }
        e.preventDefault();
      },
      { passive: false },
    );
    const sdk = (window as unknown as { PokiSDK?: Sdk }).PokiSDK;
    // the script didn't load (an adblocker can stop it): the game plays on without it
    if (!sdk) return;
    try {
      await Promise.race([sdk.init(), new Promise((_, reject) => setTimeout(() => reject(new Error('SDK init timed out')), timeoutMs))]);
    } catch (err) {
      // usually an adblocker: Poki asks for the game to carry on, events and all (ads just won't play)
      console.warn('[platform] Poki SDK init failed:', err);
    }
    this.env = 'poki';
    this.poki = sdk;
  }

  get active(): boolean {
    return this.sdk !== null || this.poki !== null;
  }

  /** Builds that run ads (CrazyGames, Poki): songs with non-commercial licences stay out of them. */
  get commercial(): boolean {
    return POKI || this.env === 'crazygames';
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

  private callPoki<T>(fn: (sdk: Sdk) => T): T | undefined {
    if (!this.poki) return undefined;
    try {
      return fn(this.poki);
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
    this.callPoki((s) => s.gameLoadingFinished());
  }

  gameplayStart(): void {
    if (this.inAd) {
      this.afterAd = true;
      return;
    }
    if (this.playing) return;
    this.playing = true;
    this.call((s) => s.game.gameplayStart());
    this.callPoki((s) => s.gameplayStart());
  }

  gameplayStop(): void {
    if (this.inAd) {
      this.afterAd = false;
      return;
    }
    if (!this.playing) return;
    this.playing = false;
    this.call((s) => s.game.gameplayStop());
    this.callPoki((s) => s.gameplayStop());
  }

  /** Runs an ad: gameplay events asked for meanwhile wait until it's over (the last one counts). */
  private async duringAd<T>(run: () => Promise<T>): Promise<T> {
    this.inAd = true;
    try {
      return await run();
    } finally {
      this.inAd = false;
      const next = this.afterAd;
      this.afterAd = null;
      if (next === true) this.gameplayStart();
      else if (next === false) this.gameplayStop();
    }
  }

  happytime(): void {
    this.call((s) => s.game.happytime());
  }

  /** There's an ad network to ask (CrazyGames, Poki): off them, the game shows a stand-in break instead. */
  get hasAds(): boolean {
    return !!this.sdk || !!this.poki;
  }

  /**
   * Request a midgame ad. Resolves when it finishes, fails, is unfilled or on cooldown: the game
   * always carries on. `onStart` fires only if an ad really plays (mute the game then).
   */
  requestMidgameAd(onStart: () => void): Promise<'played' | 'skipped'> {
    if (this.poki) return this.duringAd(() => this.pokiBreak(onStart));
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
    if (this.poki) return this.duringAd(() => this.pokiRewarded(onStart));
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

  /**
   * Poki's commercial break: Poki decides whether an ad plays (often none does). Its callback
   * fires only when one really starts.
   */
  private pokiBreak(onStart: () => void): Promise<'played' | 'skipped'> {
    return new Promise((resolve) => {
      let started = false;
      const done = () => {
        clearTimeout(safety);
        resolve(started ? 'played' : 'skipped');
      };
      const safety = setTimeout(done, 60_000);
      try {
        Promise.resolve(
          this.poki.commercialBreak(() => {
            started = true;
            onStart();
          }),
        ).then(done, done);
      } catch (err) {
        console.warn('[platform] commercialBreak failed:', err);
        done();
      }
    });
  }

  /** Poki's rewarded break: true only if it was watched through (never with an adblocker). */
  private pokiRewarded(onStart: () => void): Promise<'rewarded' | 'skipped'> {
    return new Promise((resolve) => {
      const done = (ok: unknown) => {
        clearTimeout(safety);
        resolve(ok === true ? 'rewarded' : 'skipped');
      };
      const safety = setTimeout(() => done(false), 90_000);
      try {
        Promise.resolve(this.poki.rewardedBreak(onStart)).then(done, () => done(false));
      } catch (err) {
        console.warn('[platform] rewardedBreak failed:', err);
        done(false);
      }
    });
  }

  /**
   * Opens a page outside the game. Poki allows no plain links out of it: they go through its SDK.
   */
  openExternalLink(url: string): void {
    if (this.poki) {
      this.callPoki((s) => s.openExternalLink(url));
      return;
    }
    window.open(url, '_blank', 'noopener');
  }

  /**
   * A link that brings a friend straight into a private lobby: CrazyGames' own invite link there,
   * Poki's shareable link to the game's page there, else this page with ?room=CODE.
   */
  inviteLink(code: string): string {
    const link = this.call((s) => s.game.inviteLink({ room: code }) as string);
    if (typeof link === 'string' && link) return link;
    if (this.shareLink?.code === code) return this.shareLink.url;
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('room', code);
    return url.toString();
  }

  /** The private lobby the game was opened to join (an invite link), if any. */
  inviteRoom(): string | null {
    const fromSdk = this.call((s) => s.game.getInviteParam('room') as string | null) ?? this.callPoki((s) => s.getURLParam('room') as string | null);
    if (fromSdk) return fromSdk;
    return new URLSearchParams(location.search).get('room');
  }

  /** An invite link opened while the game is already running (CrazyGames). */
  onInvite(listener: (room: string) => void): void {
    this.call((s) =>
      s.game.addJoinRoomListener?.((params: Record<string, string> | null) => {
        if (params?.room) listener(params.room);
      }),
    );
  }

  /** Started from CrazyGames' "play with friends": the game opens a private lobby straight away. */
  get instantMultiplayer(): boolean {
    return !!this.call((s) => s.game.isInstantMultiplayer);
  }

  /** the private lobby CrazyGames was last told the player is in */
  private room: { code: string; joinable: boolean } | null = null;

  /**
   * Tells CrazyGames which private lobby the player is in (its Room Data), so friends can join it
   * from CrazyGames' side too: the invite button, notifications. null: not in one any more (back on
   * the public grounds, or disconnected).
   */
  setRoom(code: string | null, joinable = true): void {
    // Poki: have the lobby's shareable link ready for the invite button (it's copied on a click,
    // and the clipboard wants that done there and then)
    if (code && this.poki && this.shareLink?.code !== code) {
      const sdk = this.poki;
      void Promise.resolve()
        .then(() => sdk.shareableURL({ room: code }))
        .then((url: unknown) => {
          if (typeof url === 'string' && url) this.shareLink = { code, url };
        })
        .catch((err: unknown) => console.warn('[platform] shareableURL failed:', err));
    }
    if (!code) {
      if (!this.room) return;
      this.room = null;
      this.call((s) => s.game.leftRoom());
      return;
    }
    if (this.room?.code === code && this.room.joinable === joinable) return;
    this.room = { code, joinable };
    this.call((s) => s.game.updateRoom({ roomId: code, isJoinable: joinable, inviteParams: { room: code } }));
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
