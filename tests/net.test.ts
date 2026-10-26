/** The client's connection: clock sync against the server, across reconnects. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Net, SocketLike } from '../src/client/net';

/** A socket to a server whose clock runs `ahead` ms of ours; it answers pings at once. */
function fakeServer(ahead: number) {
  const ws: SocketLike = {
    readyState: 0,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send(data: string) {
      const m = JSON.parse(data);
      if (m.t === 'ping') queueMicrotask(() => ws.onmessage?.({ data: JSON.stringify({ t: 'pong', c: m.c, s: performance.now() + ahead }) }));
    },
    close() {
      ws.readyState = 3;
      ws.onclose?.({ reason: '' });
    },
  };
  queueMicrotask(() => {
    ws.readyState = 1;
    ws.onopen?.();
  });
  return ws;
}

describe('net', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('syncs its clock afresh on a new connection (a redeployed server starts its clock over)', async () => {
    vi.stubGlobal('window', globalThis);
    const net = new Net();
    const first = fakeServer(5_000_000);
    await net.connect(() => first);
    await new Promise((r) => setTimeout(r, 0));
    expect(Math.abs(net.serverNow() - performance.now() - 5_000_000)).toBeLessThan(50);
    first.close();

    const second = fakeServer(3000);
    await net.connect(() => second);
    second.onmessage!({ data: JSON.stringify({ t: 'welcome', id: 'x', token: 'y', profile: {}, online: 1, serverTime: performance.now() + 3000 }) });
    await new Promise((r) => setTimeout(r, 0));
    expect(Math.abs(net.serverNow() - performance.now() - 3000)).toBeLessThan(50);
    second.close();
  });
});
