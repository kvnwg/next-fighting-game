/** Player profiles + ranked ratings. Persistence is pluggable (a JSON file on the server, localStorage offline). */
import { LeaderboardEntry, ProfileView } from '../shared/protocol';
import { PLACEMENT_MATCHES, START_MMR } from '../shared/ranks';

export interface Profile extends ProfileView {
  token: string;
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
  };
}

export interface StorePersistence {
  load(): Profile[];
  /** Write these profiles: every one, or with `incremental` only those that changed since the last save. */
  save(profiles: Profile[]): void;
  /** the backend keeps profiles it isn't handed again (a database), so saves can skip the unchanged */
  incremental?: boolean;
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
  /** profiles changed since the last save */
  private dirty = new Set<Profile>();
  /** placed profiles, best first, until a profile changes */
  private ladder: Profile[] | null = null;
  /** loading failed: never save over what's there, or it would be lost */
  private readOnly = false;

  /** `persist` null = in-memory only (tests). */
  constructor(private readonly persist: StorePersistence | null) {
    if (persist) {
      try {
        for (const p of persist.load()) this.index(p);
      } catch (err) {
        this.readOnly = true;
        console.error('[store] could not load profiles; nothing will be saved until this is fixed:', err);
      }
    }
  }

  private index(p: Profile): void {
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
    const p: Profile = {
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
    this.index(p);
    this.markDirty(p);
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
    this.ladder ??= [...this.byId.values()].filter((p) => p.placements >= PLACEMENT_MATCHES).sort((a, b) => b.mmr - a.mmr || b.wins - a.wins);
    return this.ladder;
  }

  /** `p` changed (a rating, a name, a kill): save it soon. */
  markDirty(p: Profile): void {
    this.ladder = null;
    if (!this.persist) return;
    this.dirty.add(p);
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 1500);
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.persist || this.readOnly || !this.dirty.size) return;
    const changed = [...this.dirty];
    this.dirty.clear();
    try {
      this.persist.save(this.persist.incremental ? changed : [...this.byId.values()]);
    } catch (err) {
      // keep them for the next try
      for (const p of changed) this.dirty.add(p);
      console.error('[store] save failed:', err);
    }
  }
}
