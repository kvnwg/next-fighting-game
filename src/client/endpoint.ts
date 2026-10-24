/**
 * Where the game server is. The server's own site connects back to itself; a build served from
 * somewhere else (CrazyGames hosts the files on its own CDN) has the server's address baked in at
 * build time with VITE_SERVER_URL.
 *
 * A ?server= link only works in development: the client hands its account token to whatever
 * server it connects to, so a link that could point it anywhere could steal accounts.
 */
export function serverURL(): string {
  const dev = import.meta.env.DEV ? new URLSearchParams(location.search).get('server') : null;
  const fixed = dev || (import.meta.env.VITE_SERVER_URL as string | undefined) || '';
  if (fixed) return toSocketURL(fixed);
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

/** 'deflect.fly.dev', 'https://deflect.fly.dev' or 'wss://deflect.fly.dev/ws' → the WebSocket URL */
export function toSocketURL(raw: string): string {
  const u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `wss://${raw}`);
  if (u.protocol === 'https:') u.protocol = 'wss:';
  else if (u.protocol === 'http:') u.protocol = 'ws:';
  if (u.pathname === '/' || u.pathname === '') u.pathname = '/ws';
  return u.toString();
}

/** The build talks to a server somewhere (it isn't the single-player build). */
export const hasServer = import.meta.env.VITE_OFFLINE !== '1';

/**
 * Reload into single player (the server is down) or back online. It goes in the address, so it
 * lasts through a reload, and needs no storage (which an embedding page can block).
 */
export function reloadAs(single: boolean): void {
  const u = new URL(location.href);
  if (single) u.searchParams.set('offline', '');
  else u.searchParams.delete('offline');
  location.replace(u.toString());
}
