# Fighter movesets

Design draft for the eight voxel fighters, in the combat sim's units: 60 fps frames, metres, damage and posture out of 100. Generated from `characters/movesets.js`; edit that file, not this one.

## Inputs (same for every fighter)

| Slot | Input |
|---|---|
| Light 1 → 2 → 3 | Press light repeatedly; each press during the previous hit's cancel window advances the chain |
| Heavy 1 → 2 → 3 | Press heavy repeatedly, same rule |
| Dash light / heavy | Light or heavy during a forward dodge, or within 8 frames after it |
| Back light / heavy | Light or heavy while walking away from the opponent |
| Jump light / heavy | Light or heavy while airborne (jump heavy replaces the old plunge) |
| Critical | Hold heavy (the existing unblockable glow attack) |

A light chain can cancel into Heavy 1 on hit, as now. **Guard** frames on a back heavy block like a guard; being struck during them fires the counter. **Armor** frames take the hit without flinching.

## Ronin · Katana

Balanced iaido swordsman. Quick, clean cuts; the heavy chain ends in a dashing draw that passes through the opponent.

- **Strengths:** Fast startup across the board, a true counter on BH.
- **Weaknesses:** Short reach, low posture damage.

| Slot | Move | Startup | Active | Recovery | Damage | Posture | Range (m) | Arc | Properties |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| Light 1 | Draw Cut | 7 | 3 | 11 | 6 | 7 | 2.4 | 110° |  |
| Light 2 | Return Cut | 7 | 3 | 11 | 6 | 7 | 2.4 | 110° |  |
| Light 3 | Piercing Thrust | 9 | 3 | 14 | 8 | 10 | 2.8 | 35° |  |
| Heavy 1 | Overhead Cleave | 18 | 4 | 22 | 13 | 20 | 2.6 | 80° |  |
| Heavy 2 | Rising Moon | 17 | 4 | 22 | 12 | 18 | 2.6 | 90° | launch |
| Heavy 3 | Iai Flash | 22 | 3 | 28 | 18 | 28 | 3.4 | 60° | knockdown |
| Dash light | Flash Step | 6 | 3 | 14 | 7 | 8 | 2.6 | 70° |  |
| Dash heavy | Wind Cleaver | 16 | 5 | 24 | 14 | 22 | 2.8 | 220° | knockdown |
| Back light | Retreating Cut | 8 | 3 | 12 | 6 | 8 | 2.4 | 100° | retreats |
| Back heavy | Sheathing Counter | 14 | 3 | 20 | 15 | 24 | 2.6 | 120° | guard f2–14 |
| Jump light | Falling Cut | 7 | 4 | 10 | 7 | 8 | 2.2 | 120° |  |
| Jump heavy | Heaven Drop | 12 | 4 | 22 | 13 | 20 | 2.4 | 360° | lands |
| Critical (hold heavy) | Kesagiri | 27 | 5 | 28 | 18 | 30 | 3 | 120° |  |

## Warden · Warhammer

Slow juggernaut. Heavies have hyper armor and wreck guards; he wins by breaking posture, not by speed.

- **Strengths:** Armor on every heavy, huge posture damage, ground-shaking DH and JH.
- **Weaknesses:** Slowest startup in the cast; long recovery to punish.

| Slot | Move | Startup | Active | Recovery | Damage | Posture | Range (m) | Arc | Properties |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| Light 1 | Haft Jab | 11 | 3 | 15 | 7 | 12 | 2.6 | 40° |  |
| Light 2 | Backhand Swing | 12 | 4 | 16 | 8 | 14 | 2.9 | 130° |  |
| Light 3 | Stone Uppercut | 14 | 4 | 20 | 10 | 18 | 2.6 | 70° | launch |
| Heavy 1 | Hammerfall | 24 | 5 | 28 | 18 | 32 | 3 | 70° | armor f6–24, guard crush |
| Heavy 2 | Wrecking Arc | 26 | 6 | 30 | 17 | 30 | 3.2 | 240° | armor f6–26 |
| Heavy 3 | Earthsplitter | 32 | 6 | 34 | 24 | 45 | 3.4 | 90° | armor f6–32, knockdown, guard crush |
| Dash light | Shoulder Charge | 10 | 4 | 18 | 8 | 16 | 1.8 | 80° | armor f2–10 |
| Dash heavy | Avalanche | 24 | 5 | 30 | 20 | 36 | 3 | 120° | armor f4–24, knockdown |
| Back light | Pommel Shove | 10 | 3 | 14 | 5 | 14 | 1.8 | 60° | retreats |
| Back heavy | Bulwark Swing | 20 | 5 | 24 | 14 | 26 | 3 | 140° | armor f4–20, retreats |
| Jump light | Gauntlet Drop | 10 | 4 | 14 | 8 | 12 | 1.8 | 120° |  |
| Jump heavy | Meteor | 16 | 6 | 30 | 20 | 34 | 3.2 | 360° | knockdown, guard crush, lands |
| Critical (hold heavy) | Worldbreaker | 36 | 6 | 36 | 26 | 50 | 3.4 | 100° | armor f6–36, knockdown |

## Wraith · Scythe

Long, sweeping reaper. Hits from far away and pulls opponents back into range with the hooked blade.

- **Strengths:** Longest arcs, pull effects that set up the next chain.
- **Weaknesses:** Weak up close; light damage is low.

| Slot | Move | Startup | Active | Recovery | Damage | Posture | Range (m) | Arc | Properties |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| Light 1 | Reaping Sweep | 9 | 4 | 13 | 6 | 7 | 3.4 | 140° |  |
| Light 2 | Backhand Reap | 9 | 4 | 13 | 6 | 7 | 3.4 | 140° |  |
| Light 3 | Harvest Hook | 11 | 4 | 16 | 7 | 10 | 3.6 | 70° | pull |
| Heavy 1 | Crescent Fall | 20 | 5 | 24 | 13 | 20 | 3.6 | 60° |  |
| Heavy 2 | Wailing Circle | 22 | 6 | 26 | 12 | 18 | 3.4 | 360° | 2 hits |
| Heavy 3 | Red Harvest | 26 | 6 | 30 | 18 | 28 | 3.8 | 160° | pull, knockdown |
| Dash light | Phantom Glide | 8 | 4 | 16 | 7 | 8 | 3.2 | 40° |  |
| Dash heavy | Soul Reaver | 18 | 6 | 26 | 15 | 22 | 3.4 | 360° | 2 hits, pull |
| Back light | Fading Slash | 9 | 4 | 14 | 6 | 8 | 3.2 | 120° | retreats |
| Back heavy | Mist Veil Counter | 15 | 4 | 22 | 14 | 22 | 3.4 | 140° | guard f2–15, pull |
| Jump light | Shroud Cut | 8 | 5 | 12 | 6 | 7 | 2.8 | 360° |  |
| Jump heavy | Descending Moon | 14 | 5 | 26 | 14 | 22 | 3 | 360° | lands |
| Critical (hold heavy) | Last Rite | 30 | 6 | 30 | 20 | 30 | 4 | 160° | pull |

## Lancer · Golden Spear

Straight-line reach and lightning. Thrusts out-range everyone; heavies shock for extra hitstun.

- **Strengths:** Best forward reach, lightning stun extends combos.
- **Weaknesses:** Narrow arcs: sidesteps and dodges beat him.

| Slot | Move | Startup | Active | Recovery | Damage | Posture | Range (m) | Arc | Properties |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| Light 1 | Spear Jab | 8 | 3 | 12 | 6 | 7 | 3.6 | 30° |  |
| Light 2 | Second Jab | 8 | 3 | 12 | 6 | 7 | 3.6 | 30° |  |
| Light 3 | Shaft Sweep | 11 | 4 | 16 | 8 | 12 | 3.2 | 150° |  |
| Heavy 1 | Thunder Lance | 18 | 4 | 22 | 13 | 18 | 4 | 30° | +6f stun |
| Heavy 2 | Storm Arc | 19 | 5 | 24 | 13 | 20 | 3.4 | 160° | +6f stun |
| Heavy 3 | Skyfall Pike | 23 | 4 | 28 | 17 | 26 | 3.6 | 50° | launch, +10f stun |
| Dash light | Lightning Step | 7 | 3 | 15 | 7 | 8 | 3.8 | 30° |  |
| Dash heavy | Charging Bolt | 16 | 5 | 24 | 15 | 22 | 4 | 40° | +8f stun, knockdown |
| Back light | Keep-Away Thrust | 8 | 3 | 13 | 5 | 7 | 3.6 | 30° | retreats |
| Back heavy | Grounding Rod | 18 | 5 | 24 | 12 | 20 | 3 | 360° | +12f stun, retreats |
| Jump light | Diving Jab | 8 | 4 | 11 | 6 | 7 | 3 | 40° |  |
| Jump heavy | Thunderstrike | 13 | 5 | 24 | 15 | 22 | 2.8 | 360° | +10f stun, lands |
| Critical (hold heavy) | Judgement Bolt | 28 | 5 | 30 | 19 | 30 | 4.4 | 40° | +12f stun |

## Assassin · Twin Daggers

Fastest fighter. Multi-hit flurries, slippery retreats and an aerial dive; low damage per hit, high hit count.

- **Strengths:** Quickest startup, multi-hits shred posture through block chip.
- **Weaknesses:** Shortest blade reach, lowest single-hit damage.

| Slot | Move | Startup | Active | Recovery | Damage | Posture | Range (m) | Arc | Properties |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| Light 1 | Quick Slice | 5 | 2 | 9 | 4 | 5 | 1.9 | 100° |  |
| Light 2 | Cross Slice | 5 | 2 | 9 | 4 | 5 | 1.9 | 100° |  |
| Light 3 | Twin Fangs | 7 | 6 | 13 | 7 | 10 | 2 | 80° | 3 hits |
| Heavy 1 | Gutting Stab | 14 | 3 | 18 | 10 | 14 | 2.1 | 40° |  |
| Heavy 2 | Viper Coil | 14 | 6 | 20 | 10 | 16 | 2 | 300° | 3 hits |
| Heavy 3 | Shadow Execution | 18 | 10 | 26 | 16 | 24 | 2.2 | 90° | 5 hits, knockdown |
| Dash light | Blink Strike | 4 | 2 | 12 | 5 | 6 | 2 | 60° |  |
| Dash heavy | Passing Shadow | 12 | 4 | 18 | 11 | 16 | 2.2 | 90° | 2 hits |
| Back light | Backflip Kick | 7 | 3 | 12 | 5 | 8 | 1.6 | 80° | retreats |
| Back heavy | Smoke Counter | 12 | 3 | 18 | 12 | 18 | 2 | 140° | guard f2–12 |
| Jump light | Talon Spin | 5 | 6 | 9 | 5 | 6 | 1.8 | 360° | 2 hits |
| Jump heavy | Death From Above | 10 | 4 | 20 | 12 | 16 | 2 | 360° | lands |
| Critical (hold heavy) | Thousand Cuts | 24 | 12 | 26 | 18 | 26 | 2.2 | 90° | 6 hits |

## Duelist · Rapier

Precise fencer. Long, narrow pokes and the best counter in the cast; rewards spacing and reads.

- **Strengths:** Fast, long thrusts, strong BH counter, low recovery.
- **Weaknesses:** Narrowest arcs, modest posture damage.

| Slot | Move | Startup | Active | Recovery | Damage | Posture | Range (m) | Arc | Properties |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| Light 1 | Lunge | 6 | 2 | 10 | 5 | 5 | 3 | 25° |  |
| Light 2 | Remise | 6 | 2 | 10 | 5 | 5 | 3 | 25° |  |
| Light 3 | Cutover | 8 | 3 | 12 | 7 | 9 | 2.6 | 90° |  |
| Heavy 1 | Flèche | 15 | 3 | 20 | 12 | 15 | 3.4 | 25° |  |
| Heavy 2 | Moulinet | 16 | 5 | 20 | 11 | 16 | 2.6 | 260° | 2 hits |
| Heavy 3 | Coup de Grâce | 20 | 3 | 26 | 17 | 24 | 3.6 | 25° | knockdown |
| Dash light | Balestra | 5 | 2 | 12 | 6 | 6 | 3.2 | 25° |  |
| Dash heavy | Passata Sotto | 14 | 4 | 20 | 13 | 18 | 3 | 70° | +4f stun |
| Back light | Retreat Riposte | 7 | 2 | 11 | 5 | 6 | 3 | 25° | retreats |
| Back heavy | Parry Riposte | 10 | 2 | 16 | 16 | 20 | 3 | 60° | guard f1–12 |
| Jump light | Aerial Thrust | 6 | 3 | 9 | 5 | 5 | 2.6 | 30° |  |
| Jump heavy | Falcon Dive | 12 | 4 | 20 | 12 | 16 | 2.4 | 60° | lands |
| Critical (hold heavy) | Estocada | 24 | 3 | 26 | 18 | 26 | 3.8 | 25° |  |

## Monk · Fists

Old master of close combat. Very short reach, very fast, and palm strikes that crush posture.

- **Strengths:** Fastest posture damage, launchers and kicks for juggles.
- **Weaknesses:** Shortest reach in the cast; must get inside.

| Slot | Move | Startup | Active | Recovery | Damage | Posture | Range (m) | Arc | Properties |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| Light 1 | Straight Punch | 5 | 2 | 9 | 4 | 7 | 1.5 | 60° |  |
| Light 2 | Hook Punch | 5 | 2 | 9 | 4 | 7 | 1.5 | 90° |  |
| Light 3 | Spinning Back Kick | 8 | 3 | 13 | 7 | 12 | 1.9 | 120° |  |
| Heavy 1 | Iron Palm | 14 | 3 | 18 | 11 | 22 | 1.6 | 60° | guard crush |
| Heavy 2 | Crane Rising Knee | 14 | 3 | 20 | 10 | 18 | 1.5 | 70° | launch |
| Heavy 3 | Thunder Palm | 20 | 3 | 26 | 16 | 34 | 1.8 | 70° | knockdown, guard crush |
| Dash light | Sliding Kick | 6 | 4 | 14 | 6 | 9 | 1.9 | 60° |  |
| Dash heavy | Flying Knee | 14 | 4 | 20 | 12 | 20 | 1.8 | 60° | launch |
| Back light | Back-Step Jab | 5 | 2 | 10 | 4 | 6 | 1.5 | 60° | retreats |
| Back heavy | Deflecting Palm | 10 | 3 | 16 | 13 | 26 | 1.8 | 140° | guard f1–12 |
| Jump light | Whirlwind Kick | 6 | 5 | 10 | 5 | 8 | 1.8 | 360° | 2 hits |
| Jump heavy | Descending Heel | 12 | 4 | 20 | 12 | 22 | 1.8 | 360° | guard crush, lands |
| Critical (hold heavy) | Hundred Year Strike | 26 | 4 | 28 | 18 | 45 | 1.9 | 70° | knockdown, guard crush |

## Knight · Greatsword & Shield

Disciplined defender. Broad sword cuts with the shield in play: bashes, a shield-guard counter and armored advances.

- **Strengths:** Shield guard on BH and armor on DH; reliable mid-range sword.
- **Weaknesses:** Slower lights than the blades; little air game.

| Slot | Move | Startup | Active | Recovery | Damage | Posture | Range (m) | Arc | Properties |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| Light 1 | Measured Cut | 9 | 3 | 13 | 7 | 9 | 2.8 | 110° |  |
| Light 2 | Shield Bash | 8 | 3 | 13 | 5 | 12 | 1.7 | 80° |  |
| Light 3 | Backhand Cleave | 11 | 4 | 16 | 9 | 12 | 3 | 130° |  |
| Heavy 1 | Oathbreaker | 20 | 4 | 24 | 15 | 24 | 3 | 80° |  |
| Heavy 2 | Rampart Sweep | 21 | 5 | 24 | 14 | 22 | 3 | 200° |  |
| Heavy 3 | Judgement | 26 | 5 | 30 | 20 | 32 | 3.2 | 90° | knockdown, guard crush |
| Dash light | Shield Charge | 8 | 4 | 16 | 6 | 14 | 1.8 | 80° | armor f1–8 |
| Dash heavy | Crusader Lunge | 18 | 4 | 24 | 16 | 24 | 3.4 | 40° | armor f4–18 |
| Back light | Guarded Retreat | 9 | 3 | 14 | 6 | 8 | 2.6 | 110° | retreats |
| Back heavy | Bulwark Riposte | 12 | 3 | 20 | 15 | 26 | 2.8 | 140° | guard f1–16 |
| Jump light | Leaping Cut | 9 | 4 | 12 | 7 | 9 | 2.4 | 110° |  |
| Jump heavy | Falling Bastion | 14 | 5 | 24 | 15 | 24 | 2.6 | 360° | guard crush, lands |
| Critical (hold heavy) | Oath of Ruin | 30 | 5 | 30 | 20 | 34 | 3.2 | 90° | armor f6–30 |
