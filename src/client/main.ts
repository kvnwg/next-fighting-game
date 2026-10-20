import './styles.css';

const root = document.getElementById('app')!;
const params = new URLSearchParams(location.search);

if (params.has('viewer')) {
  void import('./viewer').then((m) => m.startViewer(root));
} else {
  void import('./app').then((m) => m.startApp(root));
}
