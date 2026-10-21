/** Per-browser preferences and identity, kept in localStorage (or CrazyGames' cloud data there). */
import { CharacterId, isCharacterId } from '../shared/characters';
import { platform } from './platform';

export interface Settings {
  name: string;
  token: string;
  char: CharacterId;
  /** 'clean' renders at full resolution with cel shading; 'pixel' is the chunky 3D pixel look */
  artStyle: 'clean' | 'pixel';
  /** size of one "pixel" in screen pixels (pixel style only) */
  pixelSize: number;
  sensitivity: number;
  invertY: boolean;
  volume: number;
  /** flash on weapons just before an attack lands */
  parryCue: boolean;
  /** calmer camera: smaller shakes, no punch-ins */
  reduceShake: boolean;
  showFps: boolean;
}

const KEY = 'deflect.settings.v1';

const DEFAULTS: Settings = {
  name: '',
  token: '',
  char: 'ronin',
  artStyle: 'clean',
  pixelSize: 3,
  sensitivity: 1,
  invertY: false,
  volume: 0.7,
  parryCue: true,
  reduceShake: false,
  showFps: false,
};

function load(): Settings {
  try {
    const raw = platform.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const s = { ...DEFAULTS, ...JSON.parse(raw) } as Settings;
    if (!isCharacterId(s.char)) s.char = 'ronin';
    if (s.artStyle !== 'pixel') s.artStyle = 'clean';
    s.pixelSize = Math.max(1, Math.min(6, Math.round(s.pixelSize)));
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();

export function saveSettings(): void {
  platform.setItem(KEY, JSON.stringify(settings));
}
