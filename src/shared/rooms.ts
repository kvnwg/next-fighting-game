/** Private lobbies: friends meet in one by its code (typed in, or from an invite link). */

/** letters and digits that can't be mistaken for each other (no 0/O, 1/I/L) */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;

export function randomRoomCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return s;
}

/** A code as typed (any case, spaces or dashes), or null if it can't be one. */
export function normalizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== ROOM_CODE_LENGTH) return null;
  for (const c of s) if (!ALPHABET.includes(c)) return null;
  return s;
}
