import { defineConfig } from 'vite';

export default defineConfig({
  // CrazyGames requires relative paths inside the bundle.
  base: './',
  server: { port: 5173 },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
});
