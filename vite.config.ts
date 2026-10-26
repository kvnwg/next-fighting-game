import { defineConfig } from 'vite';

const SERVER_PORT = Number(process.env.PORT ?? 3000);

export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/ws': { target: `ws://localhost:${SERVER_PORT}`, ws: true },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
} as any);
