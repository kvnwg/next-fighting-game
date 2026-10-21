// Moveset design for the eight voxel fighters, in the units of the game's sim
// (packages/shared on feature/combat-prototype): 60 Hz frames, metres, HP and
// posture out of 100. Every fighter has the same 13 slots:
//
//   L1 L2 L3   light chain: each press in succession advances it
//   H1 H2 H3   heavy chain: same, with heavy presses
//   DL DH      dash attacks: light/heavy pressed during or just after a forward dodge
//   BL BH      retreating attacks: light/heavy while walking away from the opponent
//   JL JH      air attacks: light/heavy while airborne
//   C          critical: hold heavy (the game's existing unblockable glow attack)
//
// This is the design draft; numbers are first-pass and get tuned against the
// sim's tests once it is merged. Columns, in order:
//   name, anim, startup, active, recovery, damage, posture, range, arc, lunge, knockback, extra
// lunge < 0 retreats during the move. `extra` keys beyond the current MoveData:
//   hits        number of hits spread over the active frames (multi-hit)
//   armor       [from, to] frames of hyper armor (takes the hit, keeps attacking)
//   guard       [from, to] frames that block like a guard; being struck there triggers the follow-up
//   launch      upward velocity given on hit (m/s), for juggles
//   pull        knockback toward the attacker instead of away
//   stun        extra hitstun frames on hit (status effects like lightning)
//   knockdown   true to knock down on hit
//   crush       true when the move also chips posture on block at 1.5x
//   air         true for moves that can only start airborne (JL/JH)
//   lands       true when the move drops the fighter to the ground (plunges)

const M = (name, anim, startup, active, recovery, damage, posture, range, arc, lunge, knockback, extra = {}) => ({
  name, anim, startup, active, recovery, damage, posture, range, arc, lunge, knockback, ...extra,
});

export const SLOTS = ['L1', 'L2', 'L3', 'H1', 'H2', 'H3', 'DL', 'DH', 'BL', 'BH', 'JL', 'JH', 'C'];

// Animation names the client's pose tables need. The first seven already exist.
export const ANIMS = [
  'slashR', 'slashL', 'thrust', 'spin', 'overhead', 'rising', 'plunge',
  'lungeSlash', 'dashThrust', 'counter', 'airSlash', 'airSpin', 'slam', 'sweep', 'uppercut',
  'backflip', 'flurry', 'punch', 'palm', 'kick', 'roundhouse', 'shieldBash', 'shieldGuard', 'reap', 'hook',
];

export const MOVESETS = {
  ronin: {
    weapon: 'Katana', grip: 'twoHand',
    style: 'Balanced iaido swordsman. Quick, clean cuts; the heavy chain ends in a dashing draw that passes through the opponent.',
    strengths: 'Fast startup across the board, a true counter on BH.', weaknesses: 'Short reach, low posture damage.',
    moves: {
      L1: M('Draw Cut', 'slashR', 7, 3, 11, 6, 7, 2.4, 110, 0.6, 0.3),
      L2: M('Return Cut', 'slashL', 7, 3, 11, 6, 7, 2.4, 110, 0.6, 0.3),
      L3: M('Piercing Thrust', 'thrust', 9, 3, 14, 8, 10, 2.8, 35, 1.0, 0.8),
      H1: M('Overhead Cleave', 'overhead', 18, 4, 22, 13, 20, 2.6, 80, 0.9, 1.0),
      H2: M('Rising Moon', 'rising', 17, 4, 22, 12, 18, 2.6, 90, 0.7, 0.4, { launch: 4 }),
      H3: M('Iai Flash', 'lungeSlash', 22, 3, 28, 18, 28, 3.4, 60, 3.2, 1.2, { knockdown: true }),
      DL: M('Flash Step', 'lungeSlash', 6, 3, 14, 7, 8, 2.6, 70, 2.2, 0.5),
      DH: M('Wind Cleaver', 'spin', 16, 5, 24, 14, 22, 2.8, 220, 1.8, 2.0, { knockdown: true }),
      BL: M('Retreating Cut', 'slashL', 8, 3, 12, 6, 8, 2.4, 100, -0.8, 0.4),
      BH: M('Sheathing Counter', 'counter', 14, 3, 20, 15, 24, 2.6, 120, 0.4, 1.4, { guard: [2, 14] }),
      JL: M('Falling Cut', 'airSlash', 7, 4, 10, 7, 8, 2.2, 120, 0.4, 0.4, { air: true }),
      JH: M('Heaven Drop', 'plunge', 12, 4, 22, 13, 20, 2.4, 360, 0, 0.8, { air: true, lands: true }),
      C: M('Kesagiri', 'rising', 27, 5, 28, 18, 30, 3.0, 120, 1.4, 1.6),
    },
  },

  warden: {
    weapon: 'Warhammer', grip: 'twoHand',
    style: 'Slow juggernaut. Heavies have hyper armor and wreck guards; he wins by breaking posture, not by speed.',
    strengths: 'Armor on every heavy, huge posture damage, ground-shaking DH and JH.', weaknesses: 'Slowest startup in the cast; long recovery to punish.',
    moves: {
      L1: M('Haft Jab', 'thrust', 11, 3, 15, 7, 12, 2.6, 40, 0.5, 0.6),
      L2: M('Backhand Swing', 'slashL', 12, 4, 16, 8, 14, 2.9, 130, 0.5, 0.8),
      L3: M('Stone Uppercut', 'uppercut', 14, 4, 20, 10, 18, 2.6, 70, 0.6, 0.6, { launch: 5 }),
      H1: M('Hammerfall', 'overhead', 24, 5, 28, 18, 32, 3.0, 70, 0.8, 1.4, { armor: [6, 24], crush: true }),
      H2: M('Wrecking Arc', 'spin', 26, 6, 30, 17, 30, 3.2, 240, 0.6, 2.4, { armor: [6, 26] }),
      H3: M('Earthsplitter', 'slam', 32, 6, 34, 24, 45, 3.4, 90, 1.0, 1.0, { armor: [6, 32], knockdown: true, crush: true }),
      DL: M('Shoulder Charge', 'shieldBash', 10, 4, 18, 8, 16, 1.8, 80, 2.4, 1.6, { armor: [2, 10] }),
      DH: M('Avalanche', 'slam', 24, 5, 30, 20, 36, 3.0, 120, 2.6, 2.0, { armor: [4, 24], knockdown: true }),
      BL: M('Pommel Shove', 'thrust', 10, 3, 14, 5, 14, 1.8, 60, -0.6, 2.2),
      BH: M('Bulwark Swing', 'slashR', 20, 5, 24, 14, 26, 3.0, 140, -1.0, 2.6, { armor: [4, 20] }),
      JL: M('Gauntlet Drop', 'airSlash', 10, 4, 14, 8, 12, 1.8, 120, 0.3, 0.8, { air: true }),
      JH: M('Meteor', 'plunge', 16, 6, 30, 20, 34, 3.2, 360, 0, 2.0, { air: true, lands: true, knockdown: true, crush: true }),
      C: M('Worldbreaker', 'slam', 36, 6, 36, 26, 50, 3.4, 100, 1.2, 1.8, { armor: [6, 36], knockdown: true }),
    },
  },

  wraith: {
    weapon: 'Scythe', grip: 'polearm',
    style: 'Long, sweeping reaper. Hits from far away and pulls opponents back into range with the hooked blade.',
    strengths: 'Longest arcs, pull effects that set up the next chain.', weaknesses: 'Weak up close; light damage is low.',
    moves: {
      L1: M('Reaping Sweep', 'reap', 9, 4, 13, 6, 7, 3.4, 140, 0.4, 0.4),
      L2: M('Backhand Reap', 'slashL', 9, 4, 13, 6, 7, 3.4, 140, 0.4, 0.4),
      L3: M('Harvest Hook', 'hook', 11, 4, 16, 7, 10, 3.6, 70, 0.2, 1.2, { pull: true }),
      H1: M('Crescent Fall', 'overhead', 20, 5, 24, 13, 20, 3.6, 60, 0.6, 1.0),
      H2: M('Wailing Circle', 'spin', 22, 6, 26, 12, 18, 3.4, 360, 0.2, 1.4, { hits: 2 }),
      H3: M('Red Harvest', 'reap', 26, 6, 30, 18, 28, 3.8, 160, 0.8, 1.6, { pull: true, knockdown: true }),
      DL: M('Phantom Glide', 'dashThrust', 8, 4, 16, 7, 8, 3.2, 40, 2.6, 0.5),
      DH: M('Soul Reaver', 'spin', 18, 6, 26, 15, 22, 3.4, 360, 2.0, 1.8, { hits: 2, pull: true }),
      BL: M('Fading Slash', 'slashR', 9, 4, 14, 6, 8, 3.2, 120, -1.2, 0.4),
      BH: M('Mist Veil Counter', 'counter', 15, 4, 22, 14, 22, 3.4, 140, 0.0, 1.6, { guard: [2, 15], pull: true }),
      JL: M('Shroud Cut', 'airSpin', 8, 5, 12, 6, 7, 2.8, 360, 0.2, 0.4, { air: true }),
      JH: M('Descending Moon', 'plunge', 14, 5, 26, 14, 22, 3.0, 360, 0, 1.0, { air: true, lands: true }),
      C: M('Last Rite', 'reap', 30, 6, 30, 20, 30, 4.0, 160, 1.0, 1.0, { pull: true }),
    },
  },

  lancer: {
    weapon: 'Golden Spear', grip: 'polearm',
    style: 'Straight-line reach and lightning. Thrusts out-range everyone; heavies shock for extra hitstun.',
    strengths: 'Best forward reach, lightning stun extends combos.', weaknesses: 'Narrow arcs: sidesteps and dodges beat him.',
    moves: {
      L1: M('Spear Jab', 'thrust', 8, 3, 12, 6, 7, 3.6, 30, 0.7, 0.4),
      L2: M('Second Jab', 'thrust', 8, 3, 12, 6, 7, 3.6, 30, 0.7, 0.4),
      L3: M('Shaft Sweep', 'sweep', 11, 4, 16, 8, 12, 3.2, 150, 0.4, 1.2),
      H1: M('Thunder Lance', 'dashThrust', 18, 4, 22, 13, 18, 4.0, 30, 1.6, 1.0, { stun: 6 }),
      H2: M('Storm Arc', 'slashR', 19, 5, 24, 13, 20, 3.4, 160, 0.6, 1.4, { stun: 6 }),
      H3: M('Skyfall Pike', 'rising', 23, 4, 28, 17, 26, 3.6, 50, 1.0, 0.6, { launch: 6, stun: 10 }),
      DL: M('Lightning Step', 'dashThrust', 7, 3, 15, 7, 8, 3.8, 30, 2.8, 0.6),
      DH: M('Charging Bolt', 'dashThrust', 16, 5, 24, 15, 22, 4.0, 40, 3.6, 2.2, { stun: 8, knockdown: true }),
      BL: M('Keep-Away Thrust', 'thrust', 8, 3, 13, 5, 7, 3.6, 30, -1.0, 1.0),
      BH: M('Grounding Rod', 'slam', 18, 5, 24, 12, 20, 3.0, 360, -0.4, 1.8, { stun: 12 }),
      JL: M('Diving Jab', 'airSlash', 8, 4, 11, 6, 7, 3.0, 40, 0.6, 0.4, { air: true }),
      JH: M('Thunderstrike', 'plunge', 13, 5, 24, 15, 22, 2.8, 360, 0, 1.4, { air: true, lands: true, stun: 10 }),
      C: M('Judgement Bolt', 'dashThrust', 28, 5, 30, 19, 30, 4.4, 40, 2.4, 1.6, { stun: 12 }),
    },
  },

  assassin: {
    weapon: 'Twin Daggers', grip: 'dual',
    style: 'Fastest fighter. Multi-hit flurries, slippery retreats and an aerial dive; low damage per hit, high hit count.',
    strengths: 'Quickest startup, multi-hits shred posture through block chip.', weaknesses: 'Shortest blade reach, lowest single-hit damage.',
    moves: {
      L1: M('Quick Slice', 'slashR', 5, 2, 9, 4, 5, 1.9, 100, 0.6, 0.2),
      L2: M('Cross Slice', 'slashL', 5, 2, 9, 4, 5, 1.9, 100, 0.6, 0.2),
      L3: M('Twin Fangs', 'flurry', 7, 6, 13, 7, 10, 2.0, 80, 0.8, 0.6, { hits: 3 }),
      H1: M('Gutting Stab', 'thrust', 14, 3, 18, 10, 14, 2.1, 40, 1.2, 0.6),
      H2: M('Viper Coil', 'spin', 14, 6, 20, 10, 16, 2.0, 300, 0.4, 0.8, { hits: 3 }),
      H3: M('Shadow Execution', 'flurry', 18, 10, 26, 16, 24, 2.2, 90, 1.0, 1.6, { hits: 5, knockdown: true }),
      DL: M('Blink Strike', 'dashThrust', 4, 2, 12, 5, 6, 2.0, 60, 2.6, 0.3),
      DH: M('Passing Shadow', 'lungeSlash', 12, 4, 18, 11, 16, 2.2, 90, 3.6, 0.8, { hits: 2 }),
      BL: M('Backflip Kick', 'backflip', 7, 3, 12, 5, 8, 1.6, 80, -1.6, 1.2),
      BH: M('Smoke Counter', 'counter', 12, 3, 18, 12, 18, 2.0, 140, 1.0, 0.8, { guard: [2, 12] }),
      JL: M('Talon Spin', 'airSpin', 5, 6, 9, 5, 6, 1.8, 360, 0.2, 0.3, { air: true, hits: 2 }),
      JH: M('Death From Above', 'plunge', 10, 4, 20, 12, 16, 2.0, 360, 0, 0.8, { air: true, lands: true }),
      C: M('Thousand Cuts', 'flurry', 24, 12, 26, 18, 26, 2.2, 90, 1.2, 1.2, { hits: 6 }),
    },
  },

  duelist: {
    weapon: 'Rapier', grip: 'oneHand',
    style: 'Precise fencer. Long, narrow pokes and the best counter in the cast; rewards spacing and reads.',
    strengths: 'Fast, long thrusts, strong BH counter, low recovery.', weaknesses: 'Narrowest arcs, modest posture damage.',
    moves: {
      L1: M('Lunge', 'thrust', 6, 2, 10, 5, 5, 3.0, 25, 0.9, 0.3),
      L2: M('Remise', 'thrust', 6, 2, 10, 5, 5, 3.0, 25, 0.9, 0.3),
      L3: M('Cutover', 'slashR', 8, 3, 12, 7, 9, 2.6, 90, 0.6, 0.8),
      H1: M('Flèche', 'dashThrust', 15, 3, 20, 12, 15, 3.4, 25, 2.2, 0.8),
      H2: M('Moulinet', 'spin', 16, 5, 20, 11, 16, 2.6, 260, 0.4, 1.2, { hits: 2 }),
      H3: M('Coup de Grâce', 'thrust', 20, 3, 26, 17, 24, 3.6, 25, 1.6, 1.4, { knockdown: true }),
      DL: M('Balestra', 'dashThrust', 5, 2, 12, 6, 6, 3.2, 25, 2.4, 0.4),
      DH: M('Passata Sotto', 'lungeSlash', 14, 4, 20, 13, 18, 3.0, 70, 2.8, 1.0, { stun: 4 }),
      BL: M('Retreat Riposte', 'thrust', 7, 2, 11, 5, 6, 3.0, 25, -1.0, 0.4),
      BH: M('Parry Riposte', 'counter', 10, 2, 16, 16, 20, 3.0, 60, 0.8, 1.0, { guard: [1, 12] }),
      JL: M('Aerial Thrust', 'airSlash', 6, 3, 9, 5, 5, 2.6, 30, 0.6, 0.3, { air: true }),
      JH: M('Falcon Dive', 'plunge', 12, 4, 20, 12, 16, 2.4, 60, 1.2, 0.8, { air: true, lands: true }),
      C: M('Estocada', 'dashThrust', 24, 3, 26, 18, 26, 3.8, 25, 2.6, 1.2),
    },
  },

  monk: {
    weapon: 'Fists', grip: 'fist',
    style: 'Old master of close combat. Very short reach, very fast, and palm strikes that crush posture.',
    strengths: 'Fastest posture damage, launchers and kicks for juggles.', weaknesses: 'Shortest reach in the cast; must get inside.',
    moves: {
      L1: M('Straight Punch', 'punch', 5, 2, 9, 4, 7, 1.5, 60, 0.6, 0.2),
      L2: M('Hook Punch', 'punch', 5, 2, 9, 4, 7, 1.5, 90, 0.6, 0.2),
      L3: M('Spinning Back Kick', 'roundhouse', 8, 3, 13, 7, 12, 1.9, 120, 0.6, 1.2),
      H1: M('Iron Palm', 'palm', 14, 3, 18, 11, 22, 1.6, 60, 0.8, 1.6, { crush: true }),
      H2: M('Crane Rising Knee', 'uppercut', 14, 3, 20, 10, 18, 1.5, 70, 0.6, 0.4, { launch: 6 }),
      H3: M('Thunder Palm', 'palm', 20, 3, 26, 16, 34, 1.8, 70, 1.2, 2.6, { crush: true, knockdown: true }),
      DL: M('Sliding Kick', 'kick', 6, 4, 14, 6, 9, 1.9, 60, 2.4, 0.6),
      DH: M('Flying Knee', 'uppercut', 14, 4, 20, 12, 20, 1.8, 60, 2.6, 1.0, { launch: 5 }),
      BL: M('Back-Step Jab', 'punch', 5, 2, 10, 4, 6, 1.5, 60, -1.0, 0.6),
      BH: M('Deflecting Palm', 'counter', 10, 3, 16, 13, 26, 1.8, 140, 0.6, 2.0, { guard: [1, 12] }),
      JL: M('Whirlwind Kick', 'airSpin', 6, 5, 10, 5, 8, 1.8, 360, 0.2, 0.6, { air: true, hits: 2 }),
      JH: M('Descending Heel', 'plunge', 12, 4, 20, 12, 22, 1.8, 360, 0, 1.2, { air: true, lands: true, crush: true }),
      C: M('Hundred Year Strike', 'palm', 26, 4, 28, 18, 45, 1.9, 70, 1.4, 3.0, { crush: true, knockdown: true }),
    },
  },

  knight: {
    weapon: 'Greatsword & Shield', grip: 'swordShield',
    style: 'Disciplined defender. Broad sword cuts with the shield in play: bashes, a shield-guard counter and armored advances.',
    strengths: 'Shield guard on BH and armor on DH; reliable mid-range sword.', weaknesses: 'Slower lights than the blades; little air game.',
    moves: {
      L1: M('Measured Cut', 'slashR', 9, 3, 13, 7, 9, 2.8, 110, 0.6, 0.4),
      L2: M('Shield Bash', 'shieldBash', 8, 3, 13, 5, 12, 1.7, 80, 0.8, 1.0),
      L3: M('Backhand Cleave', 'slashL', 11, 4, 16, 9, 12, 3.0, 130, 0.6, 1.0),
      H1: M('Oathbreaker', 'overhead', 20, 4, 24, 15, 24, 3.0, 80, 0.8, 1.2),
      H2: M('Rampart Sweep', 'sweep', 21, 5, 24, 14, 22, 3.0, 200, 0.6, 1.6),
      H3: M('Judgement', 'slam', 26, 5, 30, 20, 32, 3.2, 90, 1.0, 1.4, { knockdown: true, crush: true }),
      DL: M('Shield Charge', 'shieldBash', 8, 4, 16, 6, 14, 1.8, 80, 2.4, 1.6, { armor: [1, 8] }),
      DH: M('Crusader Lunge', 'dashThrust', 18, 4, 24, 16, 24, 3.4, 40, 2.6, 1.4, { armor: [4, 18] }),
      BL: M('Guarded Retreat', 'slashL', 9, 3, 14, 6, 8, 2.6, 110, -0.8, 0.6),
      BH: M('Bulwark Riposte', 'shieldGuard', 12, 3, 20, 15, 26, 2.8, 140, 0.6, 1.6, { guard: [1, 16] }),
      JL: M('Leaping Cut', 'airSlash', 9, 4, 12, 7, 9, 2.4, 110, 0.4, 0.5, { air: true }),
      JH: M('Falling Bastion', 'plunge', 14, 5, 24, 15, 24, 2.6, 360, 0, 1.2, { air: true, lands: true, crush: true }),
      C: M('Oath of Ruin', 'overhead', 30, 5, 30, 20, 34, 3.2, 90, 1.4, 1.6, { armor: [6, 30] }),
    },
  },
};
