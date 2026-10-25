/**
 * Who the fighters are: each one's legend, five parts long, read from the Story tab of the fighter
 * select. The epithet is the line under their name there (and on their ring entrance card), the
 * teaser what the tab shows before the legend is opened, and the quote the line they're known by.
 * Flavour only; their kits live in shared/characters.ts. The legends themselves are in legends/.
 */
import type { CharacterId } from '../shared/characters';
import duelist from './legends/duelist.json';
import juggernaut from './legends/juggernaut.json';
import lancer from './legends/lancer.json';
import monk from './legends/monk.json';
import paladin from './legends/paladin.json';
import reaper from './legends/reaper.json';
import ronin from './legends/ronin.json';
import shade from './legends/shade.json';

export interface Legend {
  /** "Light the Way" */
  title: string;
  /** "The Legend of Corin Ashvale" */
  subtitle: string;
  epithet: string;
  /** a sentence or two to draw you in, shown before the legend is opened */
  teaser: string;
  /** five parts, each headed with its numeral ("I. The Lighthouse Keeper's Daughter") */
  sections: { heading: string; paragraphs: string[] }[];
  quote: string;
}

export const LORE: Record<CharacterId, Legend> = { ronin, juggernaut, duelist, lancer, shade, reaper, monk, paladin };

/** About how long a legend takes to read, in minutes. */
export function readingMinutes(l: Legend): number {
  const words = l.sections.reduce((n, s) => n + s.paragraphs.reduce((m, p) => m + p.split(/\s+/).length, 0), 0);
  return Math.max(1, Math.round(words / 230));
}
