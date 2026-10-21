import './styles.css';
import { platform } from './platform';

// the kanji font is also drawn into canvas textures (the 危 perilous glyph), so fetch it early
void document.fonts?.load(`800 22px 'Shippori Mincho B1'`, '危').catch(() => undefined);

const root = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
// single-player build (artifact) or ?offline: run the game server inside the page
const offline = import.meta.env.VITE_OFFLINE === '1' || params.has('offline');

if (params.has('viewer')) {
  void import('./viewer').then((m) => m.startViewer(root));
} else {
  // the platform SDK first: settings and progress load from its storage on CrazyGames
  void platform.init().then(async () => {
    platform.loadingStart();
    const m = await import('./app');
    m.startApp(root, offline);
  });
}
