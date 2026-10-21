/**
 * Ronin, katana. Iaijutsu: every cut is economical and flows out of the last one (the rising
 * cut ends high on the left, exactly where the falling cut begins), finishers end in a chiburi
 * (the blood flick), and the iai draw is the one moment of pure speed.
 */
import { B, K, P, Style, X, arc, fx, hitAt, line, mv, N, seq } from '../author';
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
const petal = arc([-0.02, 0.36, 0.16], 0.24, [[0.55, 0.8, -0.1], [0.4, 0.6, 0.7], [-0.05, 0.1, 1], [-0.6, -0.45, 0.62], [-0.65, -0.68, 0.15]], G2);
const petalHit = hitAt(petal, 2);

// Twin Swallow: flat right-to-left, turn over, flat left-to-right, then the chiburi flick
const twin = seq([
  [-0.1, 0.5, arc([-0.02, 0.3, 0.16], 0.26, [[-0.95, 0.02, 0.2], [-0.55, 0.06, 0.82], [0.05, 0.08, 1], [0.8, 0.1, 0.55], [0.95, 0.12, 0.05]], G2)],
  [0.5, 1.1, arc([-0.02, 0.32, 0.16], 0.26, [[0.95, 0.18, 0.1], [0.55, 0.12, 0.82], [-0.05, 0.06, 1], [-0.8, 0.0, 0.55], [-0.9, -0.08, 0.15]], G2)],
  [1.1, 1.38, arc([-0.12, 0.22, 0.12], 0.26, [[-0.9, -0.08, 0.15], [-0.55, -0.82, 0.2]], G2)],
], 0.07);
const twinHits = [hitAt(twin, 2, 0), hitAt(twin, 2, 1)];

// Heaven Splitter: from jodan (blade back over the head) down the centre line
const heaven = arc([-0.02, 0.44, 0.1], 0.26, [[0.06, 0.7, -0.72], [0.02, 1, -0.05], [0, 0.45, 1], [0, -0.1, 1], [0, -0.62, 0.78]], G2);
const heavenHit = hitAt(heaven, 2);

// Iai Flash: out of the scabbard mouth, flat across the body
const draw = arc([-0.167, 0.2, 0.421], 0.15, [[0.9, 0, -0.4], [0.7, 0.05, 0.7], [0, 0.08, 1], [-0.8, 0.12, 0.55], [-0.95, 0.16, -0.15]], NaN, { pivot1: [-0.32, 0.33, 0.22] });
const drawHit = hitAt(draw, 2);

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
        K(twinHits[0], B({ ...body, twist: 0.3, crouch: -0.22, lean: 0.3, step: 0.44, back: 0.26 })),
        K(0.5, B({ ...body, twist: 0.62, crouch: -0.2, lean: 0.26, step: 0.44, back: 0.26 })),
        K(twinHits[1], B({ ...body, twist: -0.2, crouch: -0.24, lean: 0.34, step: 0.5, back: 0.3 })),
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
      main: line([-0.2, 0.52, -0.08], [-0.04, 0.4, 0.62], [0.12, 0.02, 1], [0.02, 0.02, 1], [-1, 0.2, 0], G2, G2, { body: true }),
      impacts: [0.8],
      end: 1.0,
      ghosts: [0.0, 0.85],
      fx: [fx(0.0, 'dust', 'feet', 1.2), fx(0.8, 'flashline', 'tip', 1.4, '#ffffff'), fx(0.8, 'sparkle', 'tip', 1.2, '#ff8a6a')],
      trail: { life: 0.22, glow: 0.9 },
    }),
    // Iai Flash: out of the scabbard in one horizontal stroke, one-handed, the body unwinding past
    // the target; a streak of light and a gust of petals, then the blade comes home to guard.
    ia: mv({
      keys: [
        K(-0.1, stanceBody),
        K(drawHit, B({ ...body, crouch: -0.28, lean: 0.4, twist: -0.45, step: 0.52, back: 0.36 })),
        K(1.0, B({ ...body, crouch: -0.3, lean: 0.34, twist: -0.85, step: 0.54, back: 0.36, headPitch: 0.05 })),
      ],
      main: draw,
      free: line([0.08, 0.09, 0.16], [0.36, 0.22, -0.14], [0, 0, 1], [0, 0, 1], [0, 1, 0]),
      impacts: [drawHit],
      ghosts: [0.1, 0.8],
      fx: [fx(drawHit, 'flashline', 'tip', 1.6, '#ffffff'), fx(drawHit + 0.05, 'petals', 'tip', 1.2)],
      trail: { life: 0.28, glow: 1 },
    }),
  },
};
