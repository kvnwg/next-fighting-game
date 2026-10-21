import { DEFAULT_SERVER_PORT } from '@nfg/shared';
import { createGameServer } from './server.ts';

const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);
const server = await createGameServer({ port, log: process.env.LOG !== '0' });
console.log(`Match server listening on ws://localhost:${server.port} (health: http://localhost:${server.port}/health)`);

const shutdown = () => {
  server.close().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
