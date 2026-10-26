/** Profile persistence to a JSON file (Node only). */
import fs from 'node:fs';
import path from 'node:path';
import { Profile, StorePersistence } from './store';

export function fileStore(file: string): StorePersistence {
  return {
    load() {
      if (!fs.existsSync(file)) return [];
      const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { profiles?: Profile[] };
      return data.profiles ?? [];
    },
    save(profiles) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ profiles }));
      fs.renameSync(tmp, file);
    },
  };
}
