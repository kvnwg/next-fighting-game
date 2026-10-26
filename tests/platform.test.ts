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
