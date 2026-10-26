/** Player profiles + ranked ratings. Persistence is pluggable (a JSON file on the server, localStorage offline). */
import { withProgress } from '../shared/progress';
import { LeaderboardEntry, ProfileView } from '../shared/protocol';
import { PLACEMENT_MATCHES, START_MMR } from '../shared/ranks';

export interface Profile extends ProfileView {
  token: string;
  /** matches finished since the last after-match ad (see MATCH_AD_EVERY) */
  sinceAd?: number;
  createdAt: number;
  lastSeen: number;
}

export function profileView(p: Profile): ProfileView {
  return {
    id: p.id,
    name: p.name,
    mmr: p.mmr,
    peak: p.peak,
    wins: p.wins,
    losses: p.losses,
    placements: p.placements,
    streak: p.streak,
    kills: p.kills,
    coins: p.coins,
    chars: [...p.chars],
    maps: [...p.maps],
    games: p.games,
    freePicked: p.freePicked,
    tutorial: p.tutorial,
  };
}

export interface StorePersistence {
  load(): Profile[];
  save(profiles: Profile[]): void;
}

function randomId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class Store {
  private byId = new Map<string, Profile>();
  private byToken = new Map<string, Profile>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** the ladder, sorted, until something changes (sorting every profile on each ask is slow) */
  private ladder: Profile[] | null = null;

  /** `persist` null = in-memory only (tests). */
  constructor(private readonly persist: StorePersistence | null) {
    if (persist) {
      try {
        // profiles saved before coins and unlocks existed start with the starter set
        for (const p of persist.load()) this.index(withProgress(p));
      } catch (err) {
        console.error('[store] could not load profiles:', err);
      }
    }
  }

  private index(p: Profile): void {
    this.ladder = null;
    this.byId.set(p.id, p);
    this.byToken.set(p.token, p);
  }

  get size(): number {
    return this.byId.size;
  }

  byTokenOrNull(token: string | undefined): Profile | null {
    if (!token || typeof token !== 'string') return null;
    return this.byToken.get(token) ?? null;
  }

  get(id: string): Profile | null {
    return this.byId.get(id) ?? null;
  }

  create(name: string): Profile {
    const now = Date.now();
    const base = {
      id: randomId(),
      token: randomToken(),
      name,
      mmr: START_MMR,
      peak: START_MMR,
      wins: 0,
      losses: 0,
      placements: 0,
      streak: 0,
      kills: 0,
      createdAt: now,
      lastSeen: now,
    };
    const p: Profile = withProgress(base);
    this.index(p);
    this.markDirty();
    return p;
  }

  leaderboard(limit = 25): LeaderboardEntry[] {
    return this.placed()
      .slice(0, limit)
      .map((p) => ({ name: p.name, mmr: p.mmr, wins: p.wins, losses: p.losses, placements: p.placements }));
  }

  /** 1-based ladder position, or null while still in placements. */
  position(p: Profile): number | null {
    if (p.placements < PLACEMENT_MATCHES) return null;
    return this.placed().indexOf(p) + 1 || null;
  }

  placedCount(): number {
    return this.placed().length;
  }

  private placed(): Profile[] {
    return (this.ladder ??= [...this.byId.values()]
      .filter((p) => p.placements >= PLACEMENT_MATCHES)
      .sort((a, b) => b.mmr - a.mmr || b.wins - a.wins));
  }

  /** Something in a profile changed: the ladder is sorted again when next asked for, and it's saved soon. */
  markDirty(): void {
    this.ladder = null;
    if (!this.persist || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 1500);
  }

  flush(): void {
    if (!this.persist) return;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      this.persist.save([...this.byId.values()]);
    } catch (err) {
      console.error('[store] save failed:', err);
    }
  }
}
