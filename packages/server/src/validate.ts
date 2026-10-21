import { MAP_IDS, WEAPON_IDS, type ClientMessage, type MapId, type PlayerInfo, type WeaponId } from '@nfg/shared';

/** Soft cap on a single message; anything larger is ignored. */
export const MAX_MESSAGE_BYTES = 2048;
const MAX_COUNT = 1_000_000_000;

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  // Collapse whitespace (tabs, newlines) to single spaces, then drop any other control
  // characters, so names can't break layouts.
  return v.replace(/\s+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

export function parsePlayer(v: unknown): PlayerInfo | null {
  if (!isObj(v)) return null;
  const name = cleanText(v.name, 24) || 'Player';
  const title = cleanText(v.title, 32);
  let avatar: string | null = null;
  if (typeof v.avatar === 'string' && v.avatar.length <= 300 && /^https:\/\/[^\s"'<>]+$/.test(v.avatar)) avatar = v.avatar;
  return { name, avatar, title };
}

function parseCounts(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length > 5) return null;
  const out = [0, 0, 0, 0, 0];
  for (let i = 0; i < v.length; i++) {
    const n = v[i];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_COUNT) return null;
    out[i] = n;
  }
  return out;
}

/** Parses and validates one client message. Returns null for anything malformed. */
export function parseClientMessage(text: string): ClientMessage | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw) || typeof raw.t !== 'string') return null;

  switch (raw.t) {
    case 'hello': {
      const v = finite(raw.v);
      const player = parsePlayer(raw.player);
      return v === null || !player ? null : { t: 'hello', v, player };
    }
    case 'queue':
      return { t: 'queue' };
    case 'create':
      return { t: 'create' };
    case 'leave':
      return { t: 'leave' };
    case 'skip':
      return { t: 'skip' };
    case 'rematch':
      return { t: 'rematch' };
    case 'join': {
      if (typeof raw.code !== 'string') return null;
      const code = raw.code.trim().toUpperCase();
      return /^[A-Z0-9]{3,8}$/.test(code) ? { t: 'join', code } : null;
    }
    case 'vote': {
      const msg: { t: 'vote'; map?: MapId | 'random'; weapon?: WeaponId } = { t: 'vote' };
      if (raw.map !== undefined) {
        if (raw.map !== 'random' && !MAP_IDS.includes(raw.map as MapId)) return null;
        msg.map = raw.map as MapId | 'random';
      }
      if (raw.weapon !== undefined) {
        if (!WEAPON_IDS.includes(raw.weapon as WeaponId)) return null;
        msg.weapon = raw.weapon as WeaponId;
      }
      return msg;
    }
    case 'progress': {
      const value = finite(raw.value);
      return value === null ? null : { t: 'progress', value: clamp(value, 0, 1) };
    }
    case 'input': {
      const seq = finite(raw.seq);
      const mx = finite(raw.mx);
      const my = finite(raw.my);
      const held = finite(raw.held);
      const counts = parseCounts(raw.counts);
      if (seq === null || mx === null || my === null || held === null || !counts) return null;
      if (!Number.isInteger(seq) || seq < 0 || seq > 2 ** 31) return null;
      return { t: 'input', seq, mx: clamp(mx, -1, 1), my: clamp(my, -1, 1), held: Math.trunc(held) & 31, counts };
    }
    case 'ping': {
      const ts = finite(raw.ts);
      return ts === null ? null : { t: 'ping', ts };
    }
    default:
      return null;
  }
}
