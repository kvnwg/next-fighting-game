/**
 * Chat and name moderation, from the word list CrazyGames gives multiplayer games (blocklist.txt:
 * one entry per line, words with their leetspeak and look-alike spellings, and phrases). Entries
 * only ever match whole words, never part of one, as CrazyGames asks: "pain in the ass" is starred
 * out, "assassin" and "the horde is coming" are not. Every check is a set lookup, so a message
 * costs a few hundred of them at most.
 */

export interface Censor {
  /** the message with every blocked word and phrase starred out */
  clean(text: string): string;
  /** nothing blocked in this name */
  allowed(name: string): boolean;
}

/** digits and symbols standing in for letters */
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', $: 's', '!': 'i', '+': 't', '|': 'l', '€': 'e', '£': 'l' };
/** the game's own words that the list blocks (a perilous thrust, the training dummies, "click to lock on") */
const GAME_WORDS = new Set(['thrust', 'thrusts', 'dummy', 'dummies', 'click', 'clicks']);
/** punctuation a word can sit between ("ass.", "(ass)") */
const EDGES = /^["'`.,;:?!¿¡()[\]{}<>*~_-]+|["'`.,;:?!¿¡()[\]{}<>*~_-]+$/g;

export function createCensor(list: string): Censor {
  const blocked = new Set<string>();
  /** how many words the phrases run to */
  const lengths = new Set<number>();
  for (const line of list.split('\n')) {
    const entry = line.trim().toLowerCase().split(/\s+/).join(' ');
    if (!entry) continue;
    blocked.add(entry);
    const n = entry.split(' ').length;
    if (n > 1) lengths.add(n);
  }
  const phraseLengths = [...lengths].sort((a, b) => a - b);

  /** is this one word blocked, as written or spelled some other way? */
  const word = (raw: string): boolean => {
    const t = raw.toLowerCase();
    const bare = t.replace(EDGES, '');
    if (GAME_WORDS.has(bare)) return false;
    if (blocked.has(t)) return true;
    if (!bare) return false;
    if (blocked.has(bare)) return true;
    const plain = bare.normalize('NFD').replace(/\p{M}/gu, '');
    const letters = [...plain].map((c) => LEET[c] ?? c).join('');
    // fuuuck, asssss
    const squeezed = letters.replace(/(.)\1+/g, '$1');
    const pairs = letters.replace(/(.)\1{2,}/g, '$1$1');
    return blocked.has(plain) || blocked.has(letters) || blocked.has(squeezed) || blocked.has(pairs);
  };

  /** which of these words to star out */
  const hits = (words: string[]): boolean[] => {
    const hit = words.map(word);
    // phrases, written as they are or with their punctuation off
    for (const n of phraseLengths) {
      for (let i = 0; i + n <= words.length; i++) {
        const span = words.slice(i, i + n);
        if (blocked.has(span.join(' ').toLowerCase()) || blocked.has(span.map((w) => w.replace(EDGES, '')).join(' ').toLowerCase())) {
          for (let j = i; j < i + n; j++) hit[j] = true;
        }
      }
    }
    // s p a c e d   o u t: a run of single letters read as one word
    for (let i = 0; i < words.length; ) {
      let j = i;
      while (j < words.length && [...words[j]].length === 1) j++;
      if (j - i >= 3 && word(words.slice(i, j).join(''))) for (let k = i; k < j; k++) hit[k] = true;
      i = Math.max(j, i + 1);
    }
    return hit;
  };

  return {
    clean(text) {
      const spans = [...text.matchAll(/\S+/g)];
      const hit = hits(spans.map((m) => m[0]));
      if (!hit.includes(true)) return text;
      let out = '';
      let at = 0;
      spans.forEach((m, i) => {
        out += text.slice(at, m.index);
        out += hit[i] ? '*'.repeat([...m[0]].length) : m[0];
        at = m.index! + m[0].length;
      });
      return out + text.slice(at);
    },
    allowed(name) {
      // "Bad_Word", "BadWord", "bad word" and "badword" are all the same name
      const parts = name.replace(/([\p{Ll}\d])(\p{Lu})/gu, '$1 $2').split(/[\s_-]+/).filter(Boolean);
      const whole = name.replace(/[\s_-]+/g, '');
      return !word(whole) && !hits(parts).includes(true) && !hits(name.split(/[\s_-]+/).filter(Boolean)).includes(true);
    },
  };
}
