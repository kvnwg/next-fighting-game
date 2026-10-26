import path from 'node:path';
import { GAME_TITLE } from '../shared/config';
import { startServer } from './app';

const port = Number(process.env.PORT ?? 3000);
const dataFile = path.resolve(process.env.DATA_DIR ?? 'data', 'profiles.json');

const server = await startServer({ port, dataFile, staticDir: 'dist/client' });
console.log(`[${GAME_TITLE}] server listening on http://localhost:${server.port} (ws: /ws)`);
console.log(`[${GAME_TITLE}] profiles stored in ${dataFile}`);

const shutdown = () => {
  console.log('shutting down...');
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
