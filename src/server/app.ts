/** HTTP + WebSocket server. Serves the built client from dist/client in production. */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { WebSocket, WebSocketServer } from 'ws';
import { LOBBY_CAP } from '../shared/config';
import { Game } from './game';
import { Store, StorePersistence } from './store';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

/** text the build serves that's worth compressing (the scripts are most of a first load) */
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg']);
/** how often every socket is pinged; one that hasn't answered the last ping by the next is dropped */
const HEARTBEAT_MS = 10_000;

export interface ServerOptions {
  port: number;
  /** where profiles are kept (see index.ts); null keeps everything in memory */
  persistence: StorePersistence | null;
  staticDir?: string;
  /** How long the map and fighter select stays open before a match (ms; tests shorten it). */
  selectTime?: number;
  introTime?: number;
  /**
   * Pages allowed to open the game's WebSocket: exact origins ('https://deflect.example.com') or a
   * domain's subdomains ('*.crazygames.com'). Unset or empty allows any page.
   */
  allowedOrigins?: string[];
  /** Take the player's address from the proxy in front (Fly-Client-IP, X-Forwarded-For). Only set it behind one. */
  trustProxy?: boolean;
  /** Most players connected at once; anyone past it is told the server is full. */
  maxConnections?: number;
  /** Most connections open from one address (a school or a café shares one). */
  maxPerIp?: number;
  /** Most new connections from one address in a minute. */
  connectsPerMinute?: number;
  /** How often sockets are pinged (ms; tests shorten it). */
  heartbeatMs?: number;
}

export interface RunningServer {
  game: Game;
  port: number;
  close(): Promise<void>;
}

/** Does the page at `origin` get to connect? */
export function originAllowed(origin: string | undefined, allowed: string[] | undefined): boolean {
  if (!allowed?.length) return true;
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  return allowed.some((rule) => {
    if (rule.startsWith('*.')) return url.protocol === 'https:' && url.hostname.endsWith(rule.slice(1));
    return origin === rule.replace(/\/+$/, '');
  });
}

/** The player's address: the socket's, or what the proxy in front of us saw. */
function clientIp(req: http.IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const fly = req.headers['fly-client-ip'];
    if (typeof fly === 'string' && fly) return fly;
    // the last entry is the one our proxy added; anything before it the client could have sent
    const xff = req.headers['x-forwarded-for'];
    const last = (Array.isArray(xff) ? xff.join(',') : xff)?.split(',').pop()?.trim();
    if (last) return last;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);
/** compressed copies of the build's text files, made once each (off the main thread) on first request */
const packed = new Map<string, Promise<Buffer>>();

function compressed(file: string, mtime: number, enc: 'br' | 'gzip'): Promise<Buffer> {
  const key = `${enc}:${mtime}:${file}`;
  let p = packed.get(key);
  if (!p) {
    p = fs.promises
      .readFile(file)
      .then((buf) => (enc === 'br' ? brotli(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }) : gzip(buf, { level: 9 })));
    packed.set(key, p);
    p.catch(() => packed.delete(key));
  }
  return p;
}

async function serveFile(root: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://x');
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    // a malformed escape (%zz) would otherwise throw out of the request handler and take the server down
    res.writeHead(400, { 'content-type': 'text/plain' }).end('Bad request');
    return;
  }
  let file = path.join(root, pathname);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  let stat = await fs.promises.stat(file).catch(() => null);
  if (!stat || stat.isDirectory()) {
    // a file asked for by name that isn't there (an old build's chunk) is a 404, not the page
    if (path.extname(pathname)) {
      res.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-cache' }).end('Not found');
      return;
    }
    file = path.join(root, 'index.html');
    stat = await fs.promises.stat(file);
  }
  const ext = path.extname(file);
  const size = stat.size;
  const head: http.OutgoingHttpHeaders = {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    // only the build's hashed files never change; the music and the like keep their names
    'cache-control': ext === '.html' ? 'no-cache' : url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    'x-content-type-options': 'nosniff',
  };
  const send = (status: number, extra: http.OutgoingHttpHeaders, body: Buffer | fs.ReadStream | null) => {
    res.writeHead(status, { ...head, ...extra });
    if (req.method === 'HEAD' || !body) {
      if (body instanceof fs.ReadStream) body.destroy();
      res.end();
    } else if (Buffer.isBuffer(body)) res.end(body);
    else body.pipe(res);
  };

  if (COMPRESSIBLE.has(ext) && size > 1024) {
    const accept = String(req.headers['accept-encoding'] ?? '');
    const enc = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
    if (enc) {
      const body = await compressed(file, stat.mtimeMs, enc);
      send(200, { 'content-encoding': enc, 'content-length': body.length, vary: 'accept-encoding' }, body);
      return;
    }
  }
  // a byte range (Safari won't play a song without them)
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { 'content-range': `bytes */${size}` }).end();
      return;
    }
    send(206, { 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 }, fs.createReadStream(file, { start, end }));
    return;
  }
  send(200, { 'accept-ranges': 'bytes', 'content-length': size }, fs.createReadStream(file));
}

function staticHandler(dir: string | undefined): http.RequestListener {
  const root = dir ? path.resolve(dir) : null;
  const hasBuild = !!root && fs.existsSync(path.join(root, 'index.html'));
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    if (!root || !hasBuild) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        '<body style="font-family:monospace;background:#111;color:#eee;padding:2em">' +
          '<h2>Game server running.</h2><p>No client build found. In development run <b>npm run dev</b> and open ' +
          '<a style="color:#8cf" href="http://localhost:5173">http://localhost:5173</a>, or run <b>npm run build</b> first.</p></body>',
      );
      return;
    }
    serveFile(root, req, res).catch((err) => {
      console.error('[http]', req.url, err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  };
}

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const store = new Store(opts.persistence);
  const game = new Game(store, undefined, { selectTime: opts.selectTime, introTime: opts.introTime });
  const serveStatic = staticHandler(opts.staticDir);
  const started = Date.now();
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz') {
      // for the host's health checks and a quick look at how busy it is
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, players: game.players.size, lobbies: game.lobbies.length, matches: game.arenas.size, lobbyCap: LOBBY_CAP, uptime: Math.round((Date.now() - started) / 1000) }));
      return;
    }
    serveStatic(req, res);
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });
  const maxConnections = opts.maxConnections ?? Infinity;
  const maxPerIp = opts.maxPerIp ?? Infinity;
  const connectsPerMinute = opts.connectsPerMinute ?? Infinity;
  /** open connections, and connections made this minute, by address */
  const open = new Map<string, number>();
  const recent = new Map<string, number>();
  const live = new WeakSet<WebSocket>();

  server.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/ws')) {
      socket.destroy();
      return;
    }
    if (!originAllowed(req.headers.origin, opts.allowedOrigins)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    const ip = clientIp(req, !!opts.trustProxy);
    wss.handleUpgrade(req, socket, head, (ws) => {
      // turned away on an open socket, so the player is told why (1013: try again later)
      const attempts = (recent.get(ip) ?? 0) + 1;
      recent.set(ip, attempts);
      const refusal =
        game.closing ? 'The server is restarting. Try again in a moment.'
        : wss.clients.size > maxConnections ? 'The server is full right now. Try again in a minute.'
        : (open.get(ip) ?? 0) >= maxPerIp ? 'Too many players connected from your network.'
        : attempts > connectsPerMinute ? 'Too many connection attempts. Wait a minute and try again.'
        : null;
      if (refusal) {
        ws.close(1013, refusal);
        return;
      }
      open.set(ip, (open.get(ip) ?? 0) + 1);
      live.add(ws);
      ws.on('pong', () => live.add(ws));
      ws.on('message', () => live.add(ws));
      ws.on('close', () => {
        const n = (open.get(ip) ?? 1) - 1;
        if (n > 0) open.set(ip, n);
        else open.delete(ip);
      });
      game.handleConnection(ws);
    });
  });

  // a phone that lost signal or a laptop that slept never says goodbye: without this its fighter
  // would stand in the lobby (or hold a match hostage) until TCP gave up, minutes later
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!live.has(ws)) {
        ws.terminate();
        continue;
      }
      live.delete(ws);
      ws.ping();
    }
  }, opts.heartbeatMs ?? HEARTBEAT_MS);
  const minute = setInterval(() => recent.clear(), 60_000);
  heartbeat.unref();
  minute.unref();

  game.start();
  return new Promise((resolve) => {
    server.listen(opts.port, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : opts.port;
      resolve({
        game,
        port,
        close: async () => {
          clearInterval(heartbeat);
          clearInterval(minute);
          // a restart (a deploy) isn't anyone walking out: matches end without a result
          game.shutdown();
          for (const c of wss.clients) c.close(1012, 'The server is restarting. Reconnect in a moment.');
          // give the goodbyes a moment to go out, then cut whoever's left
          await new Promise((r) => setTimeout(r, 250));
          for (const c of wss.clients) c.terminate();
          wss.close();
          await new Promise<void>((done) => {
            server.close(() => done());
            server.closeAllConnections();
          });
          game.store.flush();
        },
      });
    });
  });
}
