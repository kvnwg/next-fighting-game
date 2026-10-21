/**
 * Ronin, katana. Iaijutsu: every cut is economical and flows out of the last one (the rising
 * cut ends high on the left, exactly where the falling cut begins), finishers end in a chiburi
 * (the blood flick), and the iai draw is the one moment of pure speed.
 */
import { B, K, P, Style, X, arc, fx, hitAt, line, mv, N, seq, track } from '../author';
import type { V3 } from '../author';

/** The scabbard (torso space): runs back and down from the left hip; the Iai grip sits just outside its mouth. */
const IAI_GRIP: V3 = [-0.06, 0.16, 0.32];
export const KATANA_SHEATH: V3 = [0.5, -0.42, -0.76];
export const KATANA_SHEATH_MOUTH: V3 = (() => {
  const d = N(KATANA_SHEATH);
  return [IAI_GRIP[0] + d.x * 0.19, IAI_GRIP[1] + d.y * 0.19, IAI_GRIP[2] + d.z * 0.19];
})();

const G2 = -0.13; // the left hand rides 13 cm down the handle
const body = B({ front: 'R', step: 0.22, back: 0.2, width: 0.12, crouch: -0.07, lean: 0.06, twist: -0.12 });
const stanceBody = B({ ...body, crouch: -0.24, lean: 0.32, twist: 0.25, step: 0.32, back: 0.3 });

// Swallow Cut: low on the right, up through the target, ending high on the left
const swallow = arc([-0.04, 0.3, 0.16], 0.24, [[-0.58, -0.62, -0.1], [-0.6, -0.3, 0.72], [-0.05, 0.14, 1], [0.5, 0.62, 0.6], [0.55, 0.82, -0.1]], G2);
const swallowHit = hitAt(swallow, 2);

// Falling Petal: from high on the left down to low on the right
const petal = arc([-0.02, 0.38, 0.16], 0.24, [[0.55, 0.8, -0.1], [0.4, 0.66, 0.7], [-0.05, 0.3, 1], [-0.6, -0.35, 0.68], [-0.65, -0.68, 0.15]], G2);
const petalHit = hitAt(petal, 2);

// Twin Swallow: flat right-to-left, turn over, flat left-to-right, then the chiburi flick
const twin = seq([
  [-0.1, 0.5, arc([-0.04, 0.32, 0.18], 0.22, [[-0.9, 0.12, 0.3], [-0.55, 0.18, 0.82], [0.05, 0.22, 1], [0.75, 0.24, 0.6], [0.88, 0.26, 0.15]], G2)],
  [0.5, 1.1, arc([-0.04, 0.34, 0.18], 0.22, [[0.88, 0.28, 0.15], [0.55, 0.24, 0.82], [-0.05, 0.2, 1], [-0.75, 0.12, 0.6], [-0.85, 0.04, 0.25]], G2)],
  [1.1, 1.38, arc([-0.1, 0.26, 0.16], 0.22, [[-0.85, 0.04, 0.25], [-0.5, -0.8, 0.3]], G2)],
], 0.07);
const twinHits = [hitAt(twin, 2, 0), hitAt(twin, 2, 1)];

// Heaven Splitter: from jodan (blade back over the head) down the centre line
const heaven = arc([-0.02, 0.44, 0.1], 0.26, [[0.06, 0.7, -0.72], [0.02, 1, -0.05], [0, 0.45, 1], [0, -0.1, 1], [0, -0.62, 0.78]], G2);
const heavenHit = hitAt(heaven, 2);

// Iai Flash: out of the scabbard mouth, flat across the body
const draw = arc([-0.167, 0.2, 0.421], 0.15, [[0.9, 0, -0.4], [0.7, 0.14, 0.7], [0, 0.3, 1], [-0.8, 0.36, 0.55], [-0.95, 0.4, -0.15]], NaN, { pivot1: [-0.34, 0.4, 0.24] });
const drawHit = hitAt(draw, 2);

// Wind Splitter: out of the Heaven Splitter's low finish, the blade turns over to the low left and
// rips up to high on the right (gyaku kiriage)
const splitter = arc([0.02, 0.32, 0.16], 0.24, [[0.05, -0.72, 0.69], [0.62, -0.62, 0.3], [0.55, -0.25, 0.8], [0, 0.36, 0.93], [-0.5, 0.7, 0.5], [-0.62, 0.8, -0.1]], G2);
const splitterChamber = hitAt(splitter, 1);
const splitterHit = hitAt(splitter, 3);

// Crescent Moon: from high on the right the blade sinks behind the turning body, comes round at the
// waist and rises to high on the left (a crescent), then an o-chiburi snaps it clean
const crescentCut = arc([-0.02, 0.34, 0.14], 0.24, [[-0.62, 0.8, -0.1], [-0.85, 0.25, -0.45], [-0.95, -0.05, 0.1], [-0.6, -0.14, 0.78], [0, -0.06, 1], [0.6, 0.2, 0.75], [0.7, 0.62, 0.2]], G2);
const crescent = seq([
  [0, 1.07, crescentCut],
  [1.07, 1.38, arc([-0.04, 0.36, 0.16], 0.24, [[0.7, 0.62, 0.2], [0.1, 0.95, 0.3], [-0.5, -0.65, 0.5]], G2)],
], 0.07);
const crescentHit = hitAt(crescent, 4, 0);

// Gale Step: one-handed, from low at the right hip, the point rising into a level thrust
const gale = line([-0.24, 0.16, 0.08], [-0.1, 0.36, 0.6], [0.12, 0.3, 1], [0.03, 0.04, 1], [0, -1, 0.1], NaN, NaN, { body: true, roll: 0.25 });
const galeHit = 0.8;

// Thunder Draw: hasso, the blade upright by the right shoulder, then down from high on the right
// to low on the left as the body passes through
const thunder = arc([-0.04, 0.34, 0.14], 0.24, [[-0.3, 0.9, -0.3], [-0.45, 0.8, 0.45], [-0.1, 0.5, 0.9], [0.45, -0.1, 0.9], [0.72, -0.45, 0.5]], G2);
const thunderHit = hitAt(thunder, 2);

// Fading Cut: from the left, flat across at the shins
const fading = arc([0, 0.24, 0.16], 0.22, [[0.55, 0.1, 0.6], [0.82, -0.3, 0.45], [0.45, -0.36, 0.82], [0, -0.36, 0.93], [-0.5, -0.34, 0.8], [-0.88, -0.24, 0.3]], G2);
const fadingHit = hitAt(fading, 3);

// Mountain Wall: the blade hangs point-down in front (the wall), wheels up past the left shoulder
// and over the head, and falls down the centre line
const wall = arc([0, 0.42, 0.12], 0.25, [[0.35, -0.78, 0.52], [0.9, -0.35, 0.1], [0.6, 0.45, -0.65], [0.08, 0.95, -0.3], [0, 0.55, 0.84], [0, 0.05, 1], [0, -0.62, 0.78]], G2);
const wallTop = hitAt(wall, 3);
const wallHit = hitAt(wall, 5);

// Swallow Dive: in the air, the blade held out on the left as the body whips round to the right,
// then flat across from left to right
const dive = arc([0, 0.36, 0.14], 0.24, [[0.9, 0.35, -0.2], [0.6, 0.25, 0.75], [0, 0.05, 1], [-0.6, -0.2, 0.75], [-0.85, -0.35, 0.2]], G2);
const diveHit = hitAt(dive, 2);

// Falling Star: jodan through a forward somersault, then straight down through the target and
// on into the ground
const star = arc([-0.02, 0.44, 0.1], 0.26, [[0.05, 0.75, -0.66], [0.02, 1, -0.05], [0, 0.5, 0.87], [0, 0.05, 1], [0, -0.4, 0.92], [0, -0.55, 0.84]], G2);
const starHit = hitAt(star, 3);
const starGround = hitAt(star, 5);

export const katana: Style = {
  axis: 'y',
  offAxis: 'y',
  trail: { light: '#e8f4ff', heavy: '#bfe0ff', special: '#ff5a4a' },
  sparks: ['#ffffff', '#c8e8ff', '#fff6c0'],
  guard: P(body, X([-0.03, 0.17, 0.33], [0.02, 0.5, 1], [0, -1, 0.3], 'y', G2)),
  block: P(B({ ...body, crouch: -0.12, lean: 0.0 }), X([0.1, 0.56, 0.33], [-1, 0.18, 0.12], [0, 1, 0.4], 'y', G2)),
  // iai: blade in the scabbard (see KATANA_SHEATH), right hand on the hilt, left hand on the saya
  stance: P(stanceBody, X(IAI_GRIP, KATANA_SHEATH, [0, 1, 0], 'y'), null, [0.08, 0.09, 0.16]),
  moves: {
    // Swallow Cut: kiriage, the hips unwinding right to left as the blade rises
    l0: mv({
      keys: [
        K(-0.1, B({ ...body, twist: -0.62, crouch: -0.2, lean: 0.2, step: 0.26 })),
        K(swallowHit, B({ ...body, twist: 0.12, crouch: -0.12, lean: 0.24, step: 0.38, back: 0.24 })),
        K(1.0, B({ ...body, twist: 0.55, crouch: -0.05, lean: 0.12, step: 0.4, back: 0.26, headPitch: -0.08 })),
      ],
      main: swallow,
      impacts: [swallowHit],
      fx: [fx(swallowHit, 'sparkle', 'tip', 0.6)],
    }),
    // Falling Petal: kesa-giri, starting where the rising cut ended
    l1: mv({
      keys: [
        K(-0.1, B({ ...body, twist: 0.5, lean: 0.0, crouch: -0.05, step: 0.24 })),
        K(petalHit, B({ ...body, twist: -0.1, lean: 0.36, crouch: -0.17, step: 0.42, back: 0.26 })),
        K(1.0, B({ ...body, twist: -0.55, lean: 0.4, crouch: -0.22, step: 0.44, back: 0.28 })),
      ],
      main: petal,
      impacts: [petalHit],
      fx: [fx(petalHit, 'sparkle', 'tip', 0.6)],
    }),
    // Twin Swallow: tsubame-gaeshi. Two hits; the blade turns over in a blink between them, and the
    // chiburi flicks it clean before it returns to guard.
    l2: mv({
      keys: [
        K(-0.1, B({ ...body, twist: -0.75, crouch: -0.2, lean: 0.22, step: 0.3 })),
        K(twinHits[0] + 0.1, B({ ...body, twist: -0.05, crouch: -0.2, lean: 0.26, step: 0.44, back: 0.26 })),
        K(0.55, B({ ...body, twist: 0.45, crouch: -0.2, lean: 0.24, step: 0.44, back: 0.26 })),
        K(twinHits[1] + 0.1, B({ ...body, twist: 0.05, crouch: -0.22, lean: 0.3, step: 0.5, back: 0.3 })),
        K(1.08, B({ ...body, twist: -0.62, crouch: -0.22, lean: 0.28, step: 0.48, back: 0.3 })),
        K(1.38, B({ ...body, twist: -0.4, crouch: -0.16, lean: 0.12, step: 0.36, back: 0.24, headPitch: 0.1 })),
      ],
      main: twin,
      impacts: twinHits,
      end: 1.08,
      rest: 1.38,
      settle: 0.55,
      fx: [fx(twinHits[0], 'sparkle', 'tip', 0.6), fx(twinHits[1], 'sparkle', 'tip', 0.8), fx(1.34, 'sparkle', 'tip', 0.4, '#ffffff')],
    }),
    // Heaven Splitter: up into jodan, then one stamping step and a vertical cut down the centre line
    h: mv({
      keys: [
        K(-0.2, B({ ...body, twist: -0.05, lean: -0.24, crouch: 0.0, step: 0.14, back: 0.2, headPitch: -0.14 })),
        K(heavenHit * 0.55, B({ ...body, twist: 0.0, lean: 0.12, crouch: -0.06, step: 0.4, back: 0.28 }), { hop: 0.1 }),
        K(heavenHit, B({ ...body, twist: 0.05, lean: 0.48, crouch: -0.28, step: 0.52, back: 0.34 }), { hop: 0 }),
        K(1.05, B({ ...body, twist: 0.05, lean: 0.54, crouch: -0.3, step: 0.52, back: 0.34, headPitch: 0.1 })),
      ],
      main: heaven,
      impacts: [heavenHit],
      start: 0,
      chamber: -0.16,
      fx: [fx(heavenHit, 'stomp', 'feet', 1), fx(heavenHit, 'flashline', 'tip', 1.1)],
      trail: { life: 0.2, glow: 0.5 },
    }),
    // Flash Piercer: kasumi, the mist stance. Blade level at the right temple, point at their eyes,
    // body sideways and low; then the whole body fires down the line of the blade.
    sp: mv({
      keys: [
        K(-0.1, B({ ...body, twist: -0.85, crouch: -0.3, lean: 0.16, step: 0.24, back: 0.42, headPitch: 0.05 })),
        K(0.5, B({ ...body, twist: -0.35, crouch: -0.32, lean: 0.36, step: 0.62, back: 0.5 })),
        K(0.8, B({ ...body, twist: -0.25, crouch: -0.32, lean: 0.42, step: 0.7, back: 0.54 })),
        K(1.0, B({ ...body, twist: -0.2, crouch: -0.3, lean: 0.42, step: 0.7, back: 0.54 })),
      ],
      main: line([-0.12, 0.5, 0.02], [-0.04, 0.4, 0.62], [0.12, 0.02, 1], [0.02, 0.02, 1], [-1, 0.2, 0], G2, G2, { body: true }),
      impacts: [0.8],
      end: 1.0,
      ghosts: [0.0, 0.85],
      fx: [fx(0.0, 'dust', 'feet', 1.2), fx(0.8, 'flashline', 'tip', 1.4, '#ffffff'), fx(0.8, 'sparkle', 'tip', 1.2, '#ff8a6a')],
      trail: { life: 0.22, glow: 0.9 },
    }),
    // Iai Flash: out of the scabbard in one rising horizontal stroke, one-handed, the whole body
    // driving through on a long step; a streak of light and a gust of petals, a chiburi, then guard.
    ia: mv({
      keys: [
        K(-0.1, stanceBody),
        K(drawHit * 0.5, B({ ...body, crouch: -0.26, lean: 0.42, twist: 0.35, step: 0.5, back: 0.4 })),
        K(drawHit + 0.1, B({ ...body, crouch: -0.2, lean: 0.36, twist: 0.2, step: 0.68, back: 0.46 })),
        K(1.0, B({ ...body, crouch: -0.24, lean: 0.3, twist: -0.6, step: 0.7, back: 0.46, headPitch: 0.05 })),
        K(1.3, B({ ...body, crouch: -0.2, lean: 0.2, twist: -0.45, step: 0.6, back: 0.42, headPitch: 0.08 })),
      ],
      main: seq([
        [-0.2, 1.05, draw],
        // chiburi: the blood flicked off with a snap of the wrist
        [1.05, 1.3, arc([-0.34, 0.4, 0.24], 0.15, [[-0.95, 0.42, -0.1], [-0.7, -0.6, 0.35]])],
      ], 0.06),
      free: line([0.08, 0.09, 0.16], [0.36, 0.22, -0.14], [0, 0, 1], [0, 0, 1], [0, 1, 0]),
      impacts: [drawHit],
      rest: 1.3,
      settle: 0.55,
      ghosts: [0.1, 0.8],
      fx: [fx(0.0, 'dust', 'feet', 1.1), fx(drawHit, 'flashline', 'tip', 1.6, '#ffffff'), fx(drawHit + 0.05, 'petals', 'tip', 1.2), fx(1.25, 'sparkle', 'tip', 0.4, '#ffffff')],
      trail: { life: 0.28, glow: 1 },
    }),
    // Wind Splitter: the second heavy. The blade turns over out of the low finish and the hips wind
    // left; then the left foot steps through as it rips up and across to the right.
    h1: mv({
      keys: [
        K(0, B({ ...body, twist: 0.05, lean: 0.5, crouch: -0.3, step: 0.52, back: 0.34 })),
        K(splitterChamber, B({ ...body, twist: 0.55, hipTwist: 0.15, lean: 0.36, crouch: -0.3, step: 0.46, back: 0.3 })),
        K(splitterHit, B({ ...body, front: 'L', twist: -0.2, hipTwist: -0.1, lean: 0.3, crouch: -0.18, step: 0.5, back: 0.3 })),
        K(1.0, B({ ...body, front: 'L', twist: -0.62, hipTwist: -0.15, lean: 0.12, crouch: -0.08, step: 0.48, back: 0.3, headPitch: -0.08 })),
      ],
      main: splitter,
      impacts: [splitterHit],
      start: 0,
      chamber: splitterChamber,
      travel: 0.3,
      fx: [fx(splitterHit - 0.06, 'dust', 'feet', 0.9), fx(splitterHit, 'flashline', 'tip', 1.1), fx(splitterHit, 'sparkle', 'tip', 0.7)],
      trail: { life: 0.2, glow: 0.5 },
    }),
    // Crescent Moon: the finisher. A full turn to the left on the lead foot, the blade sinking
    // behind the back and coming round in a crescent at the waist; a stamp, then the o-chiburi.
    h2: mv({
      keys: [
        K(0, B({ ...body, front: 'L', twist: -0.6, lean: 0.14, crouch: -0.1, step: 0.46, back: 0.3 }), { spin: 0 }),
        K(0.22, B({ ...body, front: 'L', twist: -0.35, lean: 0.12, crouch: -0.2, step: 0.3, back: 0.3, width: 0.16 }), { spin: 0.32 }),
        K(hitAt(crescent, 3, 0), B({ ...body, front: 'R', twist: -0.3, lean: 0.3, crouch: -0.3, step: 0.5, back: 0.34, width: 0.15 }), { spin: 0.86 }),
        K(crescentHit, B({ ...body, front: 'R', twist: 0.05, lean: 0.36, crouch: -0.36, step: 0.58, back: 0.36 }), { spin: 1 }),
        K(1.06, B({ ...body, twist: 0.55, lean: 0.28, crouch: -0.32, step: 0.58, back: 0.36, headPitch: -0.06 }), { spin: 1.03 }),
        K(1.38, B({ ...body, twist: -0.15, lean: 0.24, crouch: -0.26, step: 0.52, back: 0.34, headPitch: 0.1 }), { spin: 1 }),
      ],
      main: crescent,
      impacts: [crescentHit],
      start: 0,
      chamber: 0.12,
      flow: 1.5,
      blendIn: 0.35,
      end: 1.07,
      rest: 1.38,
      settle: 0.55,
      ghosts: [0.15, crescentHit + 0.05],
      fx: [
        fx(0.05, 'dust', 'feet', 0.9),
        fx(0.3, 'whirl', 'root', 0.9, '#e8f4ff'),
        fx(crescentHit, 'stomp', 'feet', 1),
        fx(crescentHit, 'flashline', 'tip', 1.3),
        fx(crescentHit + 0.05, 'petals', 'tip', 1),
        fx(1.34, 'sparkle', 'tip', 0.4, '#ffffff'),
      ],
      trail: { life: 0.24, glow: 0.7 },
    }),
    // Gale Step: out of the dash, flat and low behind the right shoulder; one hand drives the point
    // up off the hip into a level thrust on a long step, the left arm flung back
    dl: mv({
      keys: [
        K(-0.1, B({ ...body, twist: -0.55, crouch: -0.22, lean: 0.4, step: 0.36, back: 0.36 })),
        K(galeHit, B({ ...body, twist: -0.45, crouch: -0.26, lean: 0.5, step: 0.8, back: 0.56, width: 0.1 })),
        K(1.05, B({ ...body, twist: -0.4, crouch: -0.26, lean: 0.46, step: 0.8, back: 0.56, width: 0.1 })),
      ],
      main: gale,
      free: track([
        [-0.1, [0.02, 0.12, 0.18]],
        [0.4, [0.3, 0.2, -0.08]],
        [galeHit, [0.46, 0.3, -0.3]],
      ]),
      impacts: [galeHit],
      chamber: -0.05,
      end: 1.02,
      fx: [fx(0.0, 'dust', 'feet', 1), fx(galeHit, 'spiral', 'tip', 1), fx(galeHit, 'sparkle', 'tip', 0.7)],
      trail: { life: 0.16, glow: 0.4 },
    }),
    // Thunder Draw: the dash heavy. Hasso on the run, then one cut from high on the right to low on
    // the left as the whole body passes through on a long low step; a white streak hangs behind.
    dh: mv({
      keys: [
        K(-0.15, B({ ...body, twist: -0.45, crouch: -0.28, lean: 0.42, step: 0.42, back: 0.4 })),
        K(thunderHit * 0.6, B({ ...body, twist: -0.3, crouch: -0.36, lean: 0.55, step: 0.72, back: 0.5 })),
        K(thunderHit, B({ ...body, twist: 0.15, crouch: -0.42, lean: 0.6, step: 0.84, back: 0.56, width: 0.11 })),
        K(1.05, B({ ...body, twist: 0.6, crouch: -0.44, lean: 0.5, step: 0.84, back: 0.56, headPitch: -0.1 })),
      ],
      main: thunder,
      impacts: [thunderHit],
      chamber: -0.1,
      ghosts: [-0.1, 0.85],
      fx: [fx(-0.05, 'dust', 'feet', 1.2), fx(thunderHit, 'flashline', 'tip', 1.6, '#fff6c0'), fx(thunderHit, 'sparkle', 'tip', 1, '#fff6c0'), fx(thunderHit + 0.12, 'dust', 'feet', 1)],
      trail: { life: 0.26, glow: 0.9 },
    }),
    // Fading Cut: the rear foot slides back and the hips drop onto it, the blade sweeping flat
    // across the shins from left to right to keep the follower off
    bl: mv({
      keys: [
        K(-0.1, B({ ...body, twist: 0.5, lean: 0.12, crouch: -0.14, step: 0.24, back: 0.28 })),
        K(fadingHit, B({ ...body, twist: -0.05, lean: 0.0, crouch: -0.4, step: 0.34, back: 0.6, headPitch: 0.12 })),
        K(1.05, B({ ...body, twist: -0.55, lean: -0.08, crouch: -0.38, step: 0.36, back: 0.62, headPitch: 0.05 })),
      ],
      main: fading,
      impacts: [fadingHit],
      start: 0,
      chamber: hitAt(fading, 1),
      travel: 0.4,
      fx: [fx(fadingHit - 0.08, 'dust', 'feet', 0.8), fx(fadingHit, 'sparkle', 'tip', 0.6)],
    }),
    // Mountain Wall: the blade hung point-down in front as a wall, then wheeled up past the left
    // shoulder and over the head on a long step back, and dropped down the centre line from there
    bh: mv({
      keys: [
        K(0, B({ ...body, twist: 0.2, lean: 0.02, crouch: -0.12, step: 0.24, back: 0.3 })),
        K(wallTop, B({ ...body, twist: 0.05, lean: -0.24, crouch: -0.04, step: 0.2, back: 0.66, headPitch: -0.12 }), { hop: 0.04 }),
        K(wallHit, B({ ...body, twist: 0.0, lean: 0.16, crouch: -0.34, step: 0.3, back: 0.56 }), { hop: 0 }),
        K(1.05, B({ ...body, twist: 0.0, lean: 0.24, crouch: -0.38, step: 0.3, back: 0.56, headPitch: 0.1 })),
      ],
      main: wall,
      impacts: [wallHit],
      start: 0,
      chamber: wallTop,
      travel: 0.3,
      fx: [fx(wallTop, 'dust', 'feet', 0.9), fx(wallHit, 'stomp', 'feet', 0.8), fx(wallHit, 'flashline', 'tip', 1.1)],
      trail: { life: 0.2, glow: 0.5 },
    }),
    // Swallow Dive: in the air the torso coils left, then the whole body whips a turn to the right
    // and the blade comes round flat across the front
    jl: mv({
      keys: [
        K(0, B({ ...body, twist: 0.6, lean: 0.1, crouch: -0.12 }), { spin: 0 }),
        K(hitAt(dive, 1), B({ ...body, twist: 0.35, lean: 0.24, crouch: -0.16 }), { spin: -0.62 }),
        K(diveHit, B({ ...body, twist: 0.0, lean: 0.32, crouch: -0.18 }), { spin: -0.94 }),
        K(1.05, B({ ...body, twist: -0.55, lean: 0.3, crouch: -0.16 }), { spin: -1.02 }),
      ],
      main: dive,
      impacts: [diveHit],
      start: 0,
      chamber: 0.1,
      flow: 1.3,
      blendIn: 0.4,
      fx: [fx(diveHit, 'sparkle', 'tip', 0.7), fx(diveHit, 'flashline', 'tip', 0.8)],
      trail: { life: 0.18, glow: 0.4 },
    }),
    // Falling Star: a forward somersault in the air with the blade in jodan, then straight down
    // through the target and into the ground, landing low on the front knee
    jh: mv({
      keys: [
        K(0, B({ ...body, twist: 0.0, lean: 0.25, crouch: -0.2, headPitch: 0.1 }), { flip: 0 }),
        K(0.2, B({ ...body, twist: 0.0, lean: 0.4, crouch: -0.24 }), { flip: 0.45, hop: 0.4 }),
        K(hitAt(star, 2), B({ ...body, twist: 0.02, lean: 0.1, crouch: -0.1, step: 0.36, headPitch: -0.1 }), { flip: 0.94, hop: 0.2 }),
        K(starHit, B({ ...body, twist: 0.03, lean: 0.42, crouch: -0.26, step: 0.46, back: 0.3 }), { flip: 1, hop: 0 }),
        K(starGround, B({ ...body, twist: 0.03, lean: 0.56, crouch: -0.46, step: 0.52, back: 0.34 })),
        K(1.06, B({ ...body, twist: 0.03, lean: 0.58, crouch: -0.48, step: 0.52, back: 0.34, headPitch: 0.12 })),
      ],
      main: star,
      impacts: [starHit],
      start: 0,
      chamber: 0.1,
      flow: 1.4,
      blendIn: 0.35,
      end: 1.02,
      fx: [fx(starHit, 'flashline', 'tip', 1.2), fx(starGround, 'shockwave', 'tip', 0.9), fx(starGround, 'stomp', 'feet', 1)],
      trail: { life: 0.22, glow: 0.6 },
    }),
  },
};
