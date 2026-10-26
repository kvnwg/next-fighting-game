/** What the game tells CrazyGames about rooms (its Room Data), and the "play with friends" start. */
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The platform wrapper, freshly loaded against a stand-in for the CrazyGames SDK. */
async function withSdk(game: Record<string, unknown>) {
  const calls: unknown[][] = [];
  const sdk = {
    init: async () => {},
    environment: 'crazygames',
    game: {
      settings: { muteAudio: false, disableChat: false },
      updateRoom: (r: unknown) => calls.push(['updateRoom', r]),
      leftRoom: () => calls.push(['leftRoom']),
      ...game,
    },
  };
  vi.stubGlobal('window', { CrazyGames: { SDK: sdk } });
  vi.resetModules();
  const { platform } = await import('../src/client/platform');
  await platform.init();
  return { platform, calls };
}

describe('platform', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('tells CrazyGames the private lobby the player is in, once per change, and when they leave it', async () => {
    const { platform, calls } = await withSdk({});
    platform.setRoom(null); // the public grounds, before any private lobby: nothing to say
    platform.setRoom('K7M2Q');
    platform.setRoom('K7M2Q'); // someone else joined: no change for CrazyGames
    platform.setRoom('K7M2Q', false); // the lobby filled up
    platform.setRoom(null);
    platform.setRoom(null);
    expect(calls).toEqual([
      ['updateRoom', { roomId: 'K7M2Q', isJoinable: true, inviteParams: { room: 'K7M2Q' } }],
      ['updateRoom', { roomId: 'K7M2Q', isJoinable: false, inviteParams: { room: 'K7M2Q' } }],
      ['leftRoom'],
    ]);
  });

  it('reads whether the game was started from "play with friends"', async () => {
    expect((await withSdk({ isInstantMultiplayer: true })).platform.instantMultiplayer).toBe(true);
    expect((await withSdk({ isInstantMultiplayer: false })).platform.instantMultiplayer).toBe(false);
  });

  it('does nothing off CrazyGames', async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { platform } = await import('../src/client/platform');
    await platform.init();
    expect(platform.instantMultiplayer).toBe(false);
    expect(() => platform.setRoom('K7M2Q')).not.toThrow();
  });
});

/** The platform wrapper in the Poki build, freshly loaded against a stand-in for Poki's SDK. */
async function withPoki(over: Record<string, unknown> = {}) {
  const calls: unknown[][] = [];
  const sdk = {
    init: async () => {},
    gameLoadingFinished: () => calls.push(['gameLoadingFinished']),
    gameplayStart: () => calls.push(['gameplayStart']),
    gameplayStop: () => calls.push(['gameplayStop']),
    commercialBreak: async () => calls.push(['commercialBreak']),
    rewardedBreak: async () => true,
    shareableURL: async (p: Record<string, string>) => `https://poki.com/en/g/deflect?gdroom=${p.room}`,
    getURLParam: () => '',
    openExternalLink: (url: string) => calls.push(['openExternalLink', url]),
    ...over,
  };
  vi.stubEnv('VITE_PLATFORM', 'poki');
  vi.stubGlobal('window', { PokiSDK: sdk, addEventListener: () => {} });
  vi.stubGlobal('document', { addEventListener: () => {} });
  vi.resetModules();
  const { platform } = await import('../src/client/platform');
  await platform.init();
  return { platform, calls };
}

describe('platform on Poki', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('says loading is done once, and each change of gameplay once', async () => {
    const { platform, calls } = await withPoki();
    platform.loadingStart();
    platform.loadingStop();
    platform.loadingStop();
    platform.gameplayStart();
    platform.gameplayStart();
    platform.gameplayStop();
    platform.gameplayStop();
    expect(calls).toEqual([['gameLoadingFinished'], ['gameplayStart'], ['gameplayStop']]);
  });

  it('holds gameplay events back while an ad plays, then sends the last one', async () => {
    let finish: () => void = () => {};
    const { platform, calls } = await withPoki({
      commercialBreak: (onStart: () => void) =>
        new Promise<void>((resolve) => {
          onStart();
          finish = resolve;
        }),
    });
    let started = false;
    const ad = platform.requestMidgameAd(() => (started = true));
    platform.gameplayStart();
    platform.gameplayStop();
    platform.gameplayStart();
    expect(calls).toEqual([]);
    finish();
    expect(await ad).toBe('played');
    expect(started).toBe(true);
    expect(calls).toEqual([['gameplayStart']]);
  });

  it("knows a commercial break that played no ad, and pays a rewarded one only when it's watched", async () => {
    const { platform } = await withPoki();
    let started = false;
    expect(await platform.requestMidgameAd(() => (started = true))).toBe('skipped');
    expect(started).toBe(false);
    expect(await platform.requestRewardedAd(() => undefined)).toBe('rewarded');
    const closed = await withPoki({ rewardedBreak: async () => false });
    expect(await closed.platform.requestRewardedAd(() => undefined)).toBe('skipped');
  });

  it('carries on when the SDK fails to start (an adblocker), events and all', async () => {
    const { platform, calls } = await withPoki({ init: () => Promise.reject(new Error('adblock')) });
    expect(platform.env).toBe('poki');
    platform.gameplayStart();
    expect(calls).toEqual([['gameplayStart']]);
  });

  it('has no chat, and shares private lobbies through Poki links', async () => {
    const { platform, calls } = await withPoki({ getURLParam: (k: string) => (k === 'room' ? 'K7M2Q' : '') });
    expect(platform.settings.disableChat).toBe(true);
    expect(platform.commercial).toBe(true);
    expect(platform.inviteRoom()).toBe('K7M2Q');
    platform.setRoom('AB12C');
    await new Promise((r) => setTimeout(r, 0));
    expect(platform.inviteLink('AB12C')).toBe('https://poki.com/en/g/deflect?gdroom=AB12C');
    platform.openExternalLink('https://example.com/credits');
    expect(calls).toEqual([['openExternalLink', 'https://example.com/credits']]);
  });
});
