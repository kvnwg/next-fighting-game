/** Player profiles + ranked ratings, persisted to a JSON file. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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

export class Store {
  private byId = new Map<string, Profile>();
  private byToken = new Map<string, Profile>();
  private saveTimer: NodeJS.Timeout | null = null;

  /** `file` null = in-memory only (tests). */
  constructor(private readonly file: string | null) {
    if (file && fs.existsSync(file)) {
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { profiles: Profile[] };
        for (const p of data.profiles ?? []) this.index(p);
      } catch (err) {
        console.error(`[store] could not read ${file}:`, err);
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
      id: crypto.randomUUID(),
      token: crypto.randomBytes(24).toString('hex'),
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
    return [...this.byId.values()]
      .filter((p) => p.placements >= PLACEMENT_MATCHES)
      .sort((a, b) => b.mmr - a.mmr || b.wins - a.wins);
  }

  markDirty(): void {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 1500);
  }

  flush(): void {
    if (!this.file) return;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ profiles: [...this.byId.values()] }));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] save failed:', err);
    }
  }
}
