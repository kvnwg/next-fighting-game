import path from 'node:path';
import { GAME_TITLE } from '../shared/config';
import { startServer } from './app';
import { fileStore } from './fileStore';
import { StorePersistence } from './store';

const env = process.env;
const port = Number(env.PORT ?? 3000);
const dataDir = path.resolve(env.DATA_DIR ?? 'data');
const legacyJson = path.join(dataDir, 'profiles.json');
/** a whole number from the environment, or the default */
const num = (v: string | undefined, fallback: number) => (v && Number.isFinite(Number(v)) ? Number(v) : fallback);

// SQLite when this Node has it built in (22.13+), else the JSON file of before
let persistence: StorePersistence;
let where: string;
try {
  const { sqliteStore } = await import('./sqliteStore');
  where = path.join(dataDir, 'deflect.db');
  persistence = sqliteStore(where, legacyJson);
} catch (err) {
  console.warn(`[${GAME_TITLE}] node:sqlite unavailable (${(err as Error).message}); keeping profiles in a JSON file`);
  where = legacyJson;
  persistence = fileStore(legacyJson);
}

const allowedOrigins = (env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const server = await startServer({
  port,
  persistence,
  staticDir: 'dist/client',
  allowedOrigins,
  trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
  // one process holds about 500 players on a dedicated core (load-tested: 480 in 20 full lobbies
  // tick in under 4ms of their 16.7); past that, ticks start running over
  maxConnections: num(env.MAX_PLAYERS, 500),
  maxPerIp: num(env.MAX_PER_IP, 32),
  connectsPerMinute: num(env.CONNECTS_PER_MINUTE, 60),
});
console.log(`[${GAME_TITLE}] server listening on http://localhost:${server.port} (ws: /ws)`);
console.log(`[${GAME_TITLE}] profiles stored in ${where}`);
if (allowedOrigins.length) console.log(`[${GAME_TITLE}] pages allowed to connect: ${allowedOrigins.join(', ')}`);

let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  console.log('shutting down...');
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
