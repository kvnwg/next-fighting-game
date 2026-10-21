import { WEAPON_IDS, type PlayerInfo, type WeaponId } from '@nfg/shared';
import type { Platform } from '../platform/crazygames.ts';
import type { Settings } from '../ui/screens.ts';

export interface Profile {
  name: string;
  avatar: string | null;
  loggedIn: boolean;
  wins: number;
  losses: number;
  weapon: WeaponId;
  seenControls: boolean;
  seenEntrance: boolean;
  seenTelegraphHint: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.85,
  music: 0.6,
  sfx: 0.9,
  reduceEffects: false,
  lefty: false,
  quality: 'auto',
};

const TITLES: [number, string][] = [
  [50, 'Blade Saint'],
  [25, 'Relentless'],
  [10, 'Duelist'],
  [3, 'Challenger'],
  [0, 'Newcomer'],
];

export function titleFor(wins: number): string {
  return TITLES.find(([n]) => wins >= n)![1];
}

export function playerInfo(p: Profile): PlayerInfo {
  return { name: p.name, avatar: p.avatar, title: titleFor(p.wins) };
}

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

/** Progress lives in the CrazyGames Data module (synced per account) or localStorage. */
export async function loadProfile(platform: Platform): Promise<Profile> {
  const stored = parse<Partial<Profile>>(platform.getItem('profile'), {});
  const user = await platform.getUser();
  const guestName = stored.name && !stored.loggedIn ? stored.name : `Guest${Math.floor(1000 + Math.random() * 9000)}`;
  const profile: Profile = {
    name: user?.name ?? guestName,
    avatar: user?.avatar ?? null,
    loggedIn: !!user,
    wins: stored.wins ?? 0,
    losses: stored.losses ?? 0,
    weapon: stored.weapon && WEAPON_IDS.includes(stored.weapon) ? stored.weapon : 'ronin',
    seenControls: stored.seenControls ?? false,
    seenEntrance: stored.seenEntrance ?? false,
    seenTelegraphHint: stored.seenTelegraphHint ?? false,
  };
  saveProfile(platform, profile);
  return profile;
}

export function saveProfile(platform: Platform, p: Profile): void {
  platform.setItem('profile', JSON.stringify(p));
}

export function loadSettings(platform: Platform): Settings {
  return parse(platform.getItem('settings'), DEFAULT_SETTINGS);
}

export function saveSettings(platform: Platform, s: Settings): void {
  platform.setItem('settings', JSON.stringify(s));
}
