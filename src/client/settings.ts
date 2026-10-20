/** Per-browser preferences and identity, kept in localStorage. */
import { CharacterId, isCharacterId } from '../shared/characters';

export interface Settings {
  name: string;
  token: string;
  char: CharacterId;
  /** size of one "pixel" in screen pixels */
  pixelSize: number;
  sensitivity: number;
  invertY: boolean;
  volume: number;
  /** flash on weapons just before an attack lands */
  parryCue: boolean;
  showFps: boolean;
}

const KEY = 'deflect.settings.v1';

const DEFAULTS: Settings = {
  name: '',
  token: '',
  char: 'ronin',
  pixelSize: 3,
  sensitivity: 1,
  invertY: false,
  volume: 0.7,
  parryCue: true,
  showFps: false,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const s = { ...DEFAULTS, ...JSON.parse(raw) } as Settings;
    if (!isCharacterId(s.char)) s.char = 'ronin';
    s.pixelSize = Math.max(1, Math.min(6, Math.round(s.pixelSize)));
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable (private mode): settings just won't persist
  }
}
