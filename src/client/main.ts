import './styles.css';
import { platform } from './platform';

// the pixel fonts are also drawn into canvas textures (the 危 perilous glyph, the ladder board), and
// the title screen sets its logo in them the moment it opens: fetch them early
for (const f of [`22px 'DotGothic16'`, `600 18px 'Pixelify Sans'`, `700 64px 'Silkscreen'`]) void document.fonts?.load(f, '危弾DEFLECT').catch(() => undefined);

const root = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
// single-player build (artifact) or ?offline: run the game server inside the page
const offline = import.meta.env.VITE_OFFLINE === '1' || params.has('offline');

// (the model viewer is a dev tool: the Poki build ships without it, as Poki asks)
if (import.meta.env.VITE_PLATFORM !== 'poki' && params.has('viewer')) {
  void import('./viewer').then((m) => m.startViewer(root));
} else {
  // the platform SDK first: settings and progress load from its storage on CrazyGames
  void platform.init().then(async () => {
    platform.loadingStart();
    const m = await import('./app');
    m.startApp(root, offline);
  });
}
