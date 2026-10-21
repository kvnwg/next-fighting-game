// Writes docs/movesets.md from the game's move data (packages/shared/src/weapons.ts).
// usage: node --experimental-strip-types tools/movesets-doc.ts

import { writeFileSync } from 'node:fs';
import { MOVE_IDS, WEAPONS, WEAPON_IDS, type MoveData, type MoveId } from '../packages/shared/src/weapons.ts';

const slotName: Record<MoveId, string> = {
  L1: 'Light 1', L2: 'Light 2', L3: 'Light 3', H1: 'Heavy 1', H2: 'Heavy 2', H3: 'Heavy 3',
  DL: 'Dash light', DH: 'Dash heavy', BL: 'Back light', BH: 'Back heavy', JL: 'Jump light', JH: 'Jump heavy', C: 'Critical (hold heavy)',
};
const props = (m: MoveData) =>
  [
    m.hits > 1 && `${m.hits} hits`,
    m.armor && `armor f${m.armor.join('–')}`,
    m.guard && `guard f${m.guard.join('–')}`,
    m.launch && 'launch',
    m.pull && 'pull',
    m.stun && `+${m.stun}f stun`,
    m.knockdown && 'knockdown',
    m.crush && 'guard crush',
    m.unblockable && 'unblockable',
    m.lunge < 0 && 'retreats',
    m.lands && 'lands',
  ].filter(Boolean).join(', ');

let md = `# Fighter movesets

Every fighter's 13 moves, in the combat sim's units: 60 fps frames, metres, damage and posture out of 100.
Generated from \`packages/shared/src/weapons.ts\` by \`tools/movesets-doc.ts\`; edit the data, not this file.

## Inputs (same for every fighter)

| Moves | Input |
|---|---|
| Light 1 → 2 → 3 | Press light repeatedly; each press in the previous hit's window continues the chain |
| Heavy 1 → 2 → 3 | Press heavy repeatedly, same rule |
| Dash light / heavy | Light or heavy late in a forward dodge, or within 8 frames after it |
| Back light / heavy | Light or heavy while walking away from the opponent |
| Jump light / heavy | Light or heavy in the air; jump heavy drops as a plunge |
| Critical | Hold heavy (unblockable, glows white) |

Light 1 or 2 can cancel into Heavy 1 on hit. **Guard** frames on a back heavy deflect an incoming attack and fire the counter at once. **Armor** frames take hits without flinching (criticals break through). Hit stun and block stun are derived so every chain is true on hit and leaves a parry gap on block.
`;
for (const id of WEAPON_IDS) {
  const w = WEAPONS[id];
  md += `\n## ${w.name} · ${w.weapon}\n\n${w.blurb}.\n\n`;
  md += '| Move | Name | Startup | Active | Recovery | Damage | Posture | Hit stun | Range (m) | Arc | Properties |\n|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|\n';
  for (const s of MOVE_IDS) {
    const m = w.moves[s];
    md += `| ${slotName[s]} | ${m.name} | ${m.startup} | ${m.active} | ${m.recovery} | ${m.damage} | ${m.posture} | ${m.hitstun} | ${m.range} | ${m.arc}° | ${props(m)} |\n`;
  }
}
writeFileSync('docs/movesets.md', md);
console.log('wrote docs/movesets.md');
