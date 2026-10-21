import './styles.css';
import { App } from './game/app.ts';
import { Platform } from './platform/crazygames.ts';

async function main(): Promise<void> {
  const platform = new Platform();
  // The SDK must be initialized on the loading screen before anything else uses it.
  await platform.init();
  const app = new App(platform);
  await app.boot();
  (window as unknown as { __game: App }).__game = app;
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div style="position:fixed;inset:0;display:grid;place-items:center;color:#fff;font:16px system-ui;background:#000">
      Something went wrong starting the game. Please reload.</div>`,
  );
});
