/** Per-browser preferences and identity, kept in localStorage (or CrazyGames' cloud data there). */
import { CharacterId, isCharacterId } from '../shared/characters';
import { platform } from './platform';
import type { QualitySetting } from './render/gfx/quality';

export interface Settings {
  name: string;
  token: string;
  char: CharacterId;
  /** graphics tier; 'auto' picks one for the device and trims resolution when frames run slow */
  graphics: QualitySetting;
  sensitivity: number;
  invertY: boolean;
  volume: number;
  /** the music, under the master volume */
  music: number;
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
  graphics: 'auto',
  sensitivity: 1,
  invertY: false,
  volume: 0.7,
  music: 0.6,
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
    if (!['auto', 'low', 'medium', 'high', 'ultra'].includes(s.graphics)) s.graphics = 'auto';
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();

export function saveSettings(): void {
  platform.setItem(KEY, JSON.stringify(settings));
}
