/** HTTP + WebSocket server. Serves the built client from dist/client in production. */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { fileStore } from './fileStore';
import { Game } from './game';
import { Store } from './store';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

export interface ServerOptions {
  port: number;
  /** profiles file; null keeps everything in memory */
  dataFile: string | null;
  staticDir?: string;
  /** How long the map and fighter select stays open before a match (ms; tests shorten it). */
  selectTime?: number;
  introTime?: number;
  /** wandering computer-run fighters in each public lobby (none by default: tests) */
  roamers?: number;
}

export interface RunningServer {
  game: Game;
  port: number;
  close(): Promise<void>;
}

function staticHandler(dir: string | undefined): http.RequestListener {
  const root = dir ? path.resolve(dir) : null;
  const hasBuild = !!root && fs.existsSync(path.join(root, 'index.html'));
  return (req, res) => {
    if (!root || !hasBuild) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        '<body style="font-family:monospace;background:#111;color:#eee;padding:2em">' +
          '<h2>Game server running.</h2><p>No client build found. In development run <b>npm run dev</b> and open ' +
          '<a style="color:#8cf" href="http://localhost:5173">http://localhost:5173</a>, or run <b>npm run build</b> first.</p></body>',
      );
      return;
    }
    const url = new URL(req.url ?? '/', 'http://x');
    let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    const ext = path.extname(file);
    const size = fs.statSync(file).size;
    const head = {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      // only the build's hashed files never change; the music and the like keep their names
      'cache-control': ext === '.html' ? 'no-cache' : url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      'accept-ranges': 'bytes',
    };
    // a byte range (Safari won't play a song without them)
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
      if (start > end || start >= size) {
        res.writeHead(416, { 'content-range': `bytes */${size}` }).end();
        return;
      }
      res.writeHead(206, { ...head, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...head, 'content-length': size });
    fs.createReadStream(file).pipe(res);
  };
}

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const store = new Store(opts.dataFile ? fileStore(opts.dataFile) : null);
  const game = new Game(store, undefined, { selectTime: opts.selectTime, introTime: opts.introTime, roamers: opts.roamers });
  const server = http.createServer(staticHandler(opts.staticDir));
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/ws')) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => game.handleConnection(ws));
  });

  game.start();
  return new Promise((resolve) => {
    server.listen(opts.port, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : opts.port;
      resolve({
        game,
        port,
        close: () =>
          new Promise<void>((done) => {
            game.stop();
            for (const c of wss.clients) c.terminate();
            wss.close();
            server.close(() => done());
          }),
      });
    });
  });
}
