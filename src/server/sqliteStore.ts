/**
 * Profile persistence in SQLite (Node's built-in node:sqlite, so nothing to compile). Only the
 * profiles that changed are written, so a save stays tiny however many players have ever joined,
 * where rewriting one JSON file of everyone would stall the game tick once the ladder grew.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Profile, StorePersistence } from './store';

/** `legacyJson`: a profiles.json from before, imported the first time the database is empty. */
export function sqliteStore(file: string, legacyJson?: string): StorePersistence & { close(): void } {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      data TEXT NOT NULL
    );
  `);
  const upsert = db.prepare('INSERT INTO profiles (id, token, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET token = excluded.token, data = excluded.data');

  const write = (profiles: Profile[]) => {
    if (!profiles.length) return;
    db.exec('BEGIN');
    try {
      for (const p of profiles) upsert.run(p.id, p.token, JSON.stringify(p));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  return {
    incremental: true,
    load() {
      const rows = db.prepare('SELECT data FROM profiles').all() as { data: string }[];
      if (!rows.length && legacyJson && fs.existsSync(legacyJson)) {
        const old = (JSON.parse(fs.readFileSync(legacyJson, 'utf8')) as { profiles?: Profile[] }).profiles ?? [];
        write(old);
        console.log(`[store] imported ${old.length} profiles from ${legacyJson}`);
        return old;
      }
      return rows.map((r) => JSON.parse(r.data) as Profile);
    },
    save: write,
    close() {
      db.close();
    },
  };
}
