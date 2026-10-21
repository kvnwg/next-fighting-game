// The ring entrances from characters/intros.js as playable scripts: camera shots, timed
// sounds and effects, and the fighter's movement. Positions are in the fighter's frame
// (forward toward the ring centre, right, up), so one script works from either mark.
import { WEAPONS, type MoveId, type WeaponId } from '@nfg/shared';
import { camPose, type CamPose, type Shot } from '../render/camera.ts';
import { P, POSES, lerpPose, make, type Pose, type PoseSpec } from '../render/poses.ts';
import type { Actor, At, IntroScript, Stage } from './entrance.ts';

type V3 = [number, number, number];

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** 0 → 1 across [a, b], smoothed. */
const ramp = (t: number, a: number, b: number) => {
  const k = clamp01((t - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const linear = (t: number) => t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const whip = (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2);

const cam = (at: At, pos: V3, look: V3, fov: number, roll = 0): CamPose => camPose(at(...pos), at(...look), fov, roll);
const shot = (duration: number, from: CamPose, to: CamPose = from, ease: (t: number) => number = linear): Shot => ({ duration, from, to, ease });

/** A camera circling the fighter: `angle` 0 is straight in front, positive swings to their right. */
function orbit(
  at: At,
  o: { duration: number; look: V3; radius: [number, number]; height: [number, number]; angle: [number, number]; fov: [number, number]; steps?: number },
): Shot[] {
  const n = o.steps ?? 8;
  const pose = (k: number) => {
    const a = lerp(o.angle[0], o.angle[1], k);
    const r = lerp(o.radius[0], o.radius[1], k);
    return cam(at, [o.look[0] + Math.cos(a) * r, o.look[1] + Math.sin(a) * r, lerp(o.height[0], o.height[1], k)], o.look, lerp(o.fov[0], o.fov[1], k));
  };
  return Array.from({ length: n }, (_, i) => shot(o.duration / n, pose(i / n), pose((i + 1) / n)));
}

/** Total frames of a move, so a script can scrub through the whole swing. */
const frames = (w: WeaponId, m: MoveId) => {
  const d = WEAPONS[w].moves[m];
  return d.startup + d.active + d.recovery;
};

/** Plays move `m` from `t0`, `speed` times real time; true while it runs. */
function swing(a: Actor, w: WeaponId, m: MoveId, t: number, t0: number, speed = 1, upTo = 1): boolean {
  const f = (t - t0) * 60 * speed;
  const end = frames(w, m) * upTo;
  if (f < 0 || f >= end) return false;
  a.move = m;
  a.frame = f;
  return true;
}

/** Holds pose `to`, eased in from `from` over [t0, t1]. */
function hold(a: Actor, out: Pose, from: Pose, to: Pose, t: number, t0: number, t1: number): void {
  a.pose = lerpPose(out, from, to, ramp(t, t0, t1));
}

const pose = (spec: PoseSpec) => make(spec);
const UPRIGHT = { lean: 0.04, twist: -0.1, headYaw: 0, headPitch: 0 };
/** Right hand resting on a sheathed hilt at the left hip. */
const HILT = pose({ ...UPRIGHT, hipY: 0.84, lean: 0.12, twist: 0.15, wpx: 0.1, wpy: 0.0, wpz: 0.2, wdx: 0, wdy: 1, wdz: 0 });

function walkIn(a: Actor, t: number, t0: number, t1: number, f0: number, f1: number, gait = 1): void {
  const k = clamp01((t - t0) / (t1 - t0));
  a.f = lerp(f0, f1, k);
  if (k > 0 && k < 1) a.walk = gait;
}

/** Floating dust, mist or petals drifting through a box around the fighter. */
function drift(s: Stage, dt: number, rate: number, o: { f: [number, number]; r: [number, number]; y: [number, number]; colors: number[]; gravity: number; size?: [number, number]; shards?: boolean }): void {
  if (Math.random() > rate * dt) return;
  const rnd = (r: [number, number]) => lerp(r[0], r[1], Math.random());
  const p = s.pt(rnd(o.f), rnd(o.r), rnd(o.y));
  const e = { at: p, count: 1, colors: o.colors, speed: [0.05, 0.35] as [number, number], life: [1.2, 2.4] as [number, number], size: o.size ?? [0.03, 0.07], gravity: o.gravity, drag: 1.2 };
  if (o.shards) s.vfx.shardsAt(e);
  else s.vfx.sparksAt(e);
}

/** A footstep: sound and a puff at the foot. */
function step(s: Stage, f: number, r: number, dust = 0xd8d2c4): void {
  s.sfx('land', f, r, 0.1);
  s.vfx.sparksAt({ at: s.pt(f, r, 0.05), count: 4, colors: [dust], speed: [0.2, 0.6], life: [0.3, 0.6], size: [0.03, 0.06], gravity: -0.3, drag: 3 });
}

/** Fires `fn` at each time in `times`. */
const each = (times: number[], fn: (s: Stage, i: number) => void): [number, (s: Stage) => void][] => times.map((t, i) => [t, (s) => fn(s, i)]);

const tip = (s: Stage) => s.visual?.bladeTip ?? s.pt(0.6, 0, 1);

// ------------------------------------------------------------------ Ronin
const roninSheath = new Float32Array(POSES.stance.length);
const ronin: IntroScript = {
  duration: 10,
  finale: 7.5,
  card: 8.1,
  draw: 9.45,
  shots: (at) => [
    shot(1.5, cam(at, [5.6, -3.6, 0.45], [0, 0, 0.7], 38), cam(at, [5.4, -3.3, 0.45], [0, 0, 0.7], 38)),
    shot(2, cam(at, [-1.9, 1.1, 0.25], [-2.3, 0, 0.3], 44), cam(at, [0.2, 1.0, 0.25], [-0.1, 0, 0.3], 44)),
    shot(2, cam(at, [1.4, 0.25, 0.55], [0, 0, 0.6], 40), cam(at, [1.25, 0.2, 1.25], [0, 0, 1.6], 30), easeInOut),
    shot(2, cam(at, [0.42, -0.55, 1.08], [0.05, -0.2, 0.92], 30), cam(at, [0.4, -0.5, 1.06], [0.05, -0.2, 0.92], 28)),
    shot(2.5, cam(at, [2.5, 0.12, 1.45], [0, 0, 1.45], 36), cam(at, [1.9, 0.1, 1.5], [0, 0, 1.48], 33)),
  ],
  cues: [
    [0, (s) => {
      // The frame bleeds to paper, then the ring is "painted" in from the middle out.
      s.screen.fade('#efe7d3', 1, 0);
      s.screen.fade('#efe7d3', 0, 1.3);
      s.screen.bloom('#efe7d3', 1, 0);
      s.screen.bloom('#efe7d3', 0.45, 1.4);
      s.screen.grade('grayscale(0.85) sepia(0.2) contrast(1.15)', 0.6);
      s.sfx('brush');
    }],
    [0.25, (s) => s.sfx('wind', -2)],
    ...each([1.75, 2.25, 2.75, 3.25], (s, i) => step(s, -2.1 + i * 0.6, i % 2 ? 0.12 : -0.12)),
    [2.6, (s) => s.sfx('clunk', -1, -0.2, 0.9)],
    [3.6, (s) => s.sfx('clothFlap', 0, 0, 1.4)],
    [3.8, (s) => s.sfx('wind')],
    [5.2, (s) => {
      s.sfx('taikoHit');
      s.screen.bloom('#efe7d3', 0.2, 0.4);
      s.screen.grade('grayscale(1) contrast(1.3)', 0.25);
    }],
    [6.05, (s) => {
      s.sfx('tink', 0, -0.2, 0.95);
      s.vfx.flash(s.pt(0.1, -0.24, 0.95), 0xffffff, 0.35, 0.35);
    }],
    [7.5, (s) => s.screen.bloom('#efe7d3', 0, 0.6)],
    [9.35, (s) => s.sfx('whoosh')],
    [9.5, (s) => {
      s.screen.slash('#0b0b0b', -24, 0.2);
      s.vfx.slashArc(s.pt(0.5, 0, 1.2), s.camera, 0x111111, 1.2);
    }],
  ],
  update(t, dt, a, s) {
    a.visible = t >= 1.5;
    walkIn(a, t, 1.5, 3.5, -2.4, 0);
    if (t >= 5.6 && t < 9.45) {
      hold(a, roninSheath, POSES.stance, HILT, t, 5.6, 6.0);
      // Tips the kasa up as he speaks.
      roninSheath[P.headPitch] = lerp(HILT[P.headPitch]!, -0.14, ramp(t, 7.8, 8.3));
    }
    if (t >= 9.45) swing(a, 'ronin', 'L1', t, 9.45, 1.2);
    if (t > 1.5 && t < 3.5) drift(s, dt, 30, { f: [a.f - 0.3, a.f + 0.3], r: [-0.3, 0.3], y: [0.05, 0.4], colors: [0xcfc6b0], gravity: -0.05 });
  },
};

// ------------------------------------------------------------------ Warden
const wardenPose = new Float32Array(POSES.stance.length);
/** Hammer dragged head-down behind him. */
const DRAG = pose({ hipY: 0.84, lean: 0.18, twist: -0.35, headYaw: 0.2, wpx: -0.36, wpy: -0.05, wpz: -0.12, wdx: -0.25, wdy: -0.5, wdz: -0.83 });
/** Hammer stood upright on its head at his side, hand on the pommel. */
const PLANT = pose({ ...UPRIGHT, hipY: 0.86, wpx: -0.5, wpy: 0.42, wpz: 0.22, wdx: 0, wdy: -1, wdz: 0.04 });
const warden: IntroScript = {
  duration: 10.5,
  finale: 8,
  card: 8.7,
  shots: (at) => [
    shot(2, cam(at, [4.6, -4.4, 2.3], [1.2, 0, 0.9], 50), cam(at, [4.4, -4.2, 2.2], [1.2, 0, 0.9], 50)),
    shot(1.5, cam(at, [-1.6, 0.4, 0.08], [-2.6, 0, 0.35], 62), cam(at, [-1.62, 0.4, 0.09], [-2.6, 0, 0.4], 62)),
    shot(2.5, cam(at, [-1.2, 0.45, 1.1], [-2.6, 0, 1.3], 46), cam(at, [1.4, 0.45, 1.15], [0, 0, 1.4], 46)),
    shot(2, cam(at, [1.7, 0, 2.05], [0, 0, 2.05], 34), cam(at, [0.95, 0, 2.08], [0, 0, 2.08], 20), easeInOut),
    shot(2.5, cam(at, [3.6, 1.3, 0.45], [0, 0, 1.4], 44), cam(at, [3.3, 1.2, 0.5], [0, 0, 1.45], 42)),
  ],
  cues: [
    [0, (s) => s.sfx('rumble', 2)],
    ...each([0.15, 0.75, 1.35], (s, i) => {
      s.sfx('heartbeat', -2);
      s.shake(i === 2 ? 'large' : 'small');
    }),
    [1.2, (s) => s.sfx('rumble', 1)],
    [2.45, (s) => {
      s.sfx('slam', -2.6, 0, 0.1);
      s.shake('large');
      s.vfx.dustRing(...xz(s, -2.6, 0.1), 0xd8d2c4, 1.6);
      s.vfx.flash(s.pt(-2.6, 0.1, 0.05), 0xffc35a, 1.4, 0.5);
      s.vfx.shardsAt({ at: s.pt(-2.6, 0.1, 0.1), count: 24, colors: [0x8a857a, 0x6d695f, 0xb5ad98], speed: [1.5, 4], life: [0.4, 0.9], size: [0.06, 0.14], gravity: 9, dir: [0, 1, 0], spread: 0.9 });
    }],
    [3.6, (s) => s.sfx('scrape', -2)],
    [4.6, (s) => s.sfx('crackle', -1)],
    [5.3, (s) => s.sfx('scrape', -0.8)],
    [6.2, (s) => s.sfx('ember', 0, 0, 2)],
    ...each([6.6, 7.25], (s) => {
      s.vfx.flash(s.pt(0.18, -0.07, 2.08), 0xff7a1a, 0.22, 0.9);
      s.vfx.flash(s.pt(0.18, 0.07, 2.08), 0xff7a1a, 0.22, 0.9);
    }),
    [8.3, (s) => {
      s.sfx('stoneGong');
      s.shake('large');
      s.vfx.dustRing(...xz(s, 0.25, 0.75), 0xd8d2c4, 1.3);
      s.visual?.flashTint(1, 0.78, 0.3, 0.55, 1.1);
    }],
  ],
  update(t, dt, a, s) {
    a.visible = t >= 2;
    // One step slams down for the low shot, then he advances dragging the hammer.
    if (t < 3.5) a.f = -2.6;
    if (t >= 2 && t < 2.45) {
      a.f = lerp(-3.1, -2.6, ramp(t, 2, 2.45));
      a.walk = 1;
    }
    walkIn(a, t, 3.5, 6, -2.6, 0, 0.8);
    if (t >= 2 && t < 7.9) hold(a, wardenPose, POSES.stance, DRAG, t, 2, 2.3);
    if (t >= 7.9) hold(a, wardenPose, DRAG, PLANT, t, 7.9, 8.3);
    if (t > 3.5 && t < 6 && s.visual && Math.random() < dt * 40) {
      const p = s.visual.bladeTip;
      s.vfx.sparksAt({ at: { x: p.x, y: 0.05, z: p.z }, count: 3, colors: [0xffc14a, 0xff8a1e], speed: [1, 3.5], life: [0.15, 0.4], size: [0.04, 0.08], gravity: 8 });
    }
    if (t < 2) drift(s, dt, 50, { f: [-2, 4], r: [-3, 3], y: [3, 5], colors: [0xb8ad98], gravity: 1.5 });
  },
};

/** World x, z of a point on the floor in the fighter's frame. */
function xz(s: Stage, f: number, r: number): [number, number] {
  const p = s.pt(f, r, 0);
  return [p.x, p.z];
}

// ------------------------------------------------------------------ Wraith
const wraithPose = new Float32Array(POSES.stance.length);
/** Scythe trailed low behind, the blade on the floor. */
const REAP_DRAG = pose({ hipY: 0.86, lean: 0.1, twist: -0.4, headYaw: 0, wpx: -0.4, wpy: 0.1, wpz: -0.05, wdx: -0.35, wdy: -0.35, wdz: -0.87 });
const wraith: IntroScript = {
  duration: 10,
  finale: 8,
  card: 8.9,
  shots: (at) => [
    shot(2, cam(at, [5, -2.2, 7.5], [0, 0, 0], 48), cam(at, [4.4, -2, 3.8], [0, 0, 0.6], 48), easeOut),
    shot(2.5, cam(at, [-4, 2.6, 1.1], [-4, 0, 1.2], 44), cam(at, [-1.6, 2.6, 1.1], [-1.6, 0, 1.2], 44)),
    shot(2, cam(at, [-0.7, 1.4, 0.35], [-1.4, 0.3, 0.2], 40), cam(at, [0.6, 1.4, 0.35], [-0.1, 0.3, 0.2], 40)),
    shot(1.5, cam(at, [1.9, 0.35, 0.7], [0, 0, 1.75], 38, 0.32), cam(at, [1.7, 0.3, 0.75], [0, 0, 1.8], 36, 0.3)),
    shot(2, cam(at, [4.2, 0, 1.4], [0, 0, 1.6], 46), cam(at, [3.9, 0, 1.45], [0, 0, 1.6], 46)),
  ],
  cues: [
    [0, (s) => {
      s.sfx('wind', 2);
      s.fog(0.32, 2);
    }],
    [0.9, (s) => s.sfx('chime', 3, 1, 3)],
    [2.3, (s) => s.sfx('whisper', -3)],
    [3.3, (s) => s.sfx('breath', -2.2)],
    [4.7, (s) => s.sfx('brush', -1.2, 0.5, 0.1)],
    [5.2, (s) => s.sfx('shing', -1, 0.5, 0.1)],
    [6.5, (s) => s.screen.grade('saturate(0.3) contrast(1.15)', 0.6)],
    [6.65, (s) => s.sfx('koto')],
    [7.4, (s) => s.sfx('heartbeat')],
    [8.15, (s) => s.sfx('choir')],
    [8.5, (s) => s.sfx('whoosh')],
    [8.75, (s) => s.vfx.slashArc(s.pt(0, 0, 2.1), s.camera, 0xc4161c, 2.2)],
    [9.3, (s) => s.sfx('whisper')],
    [9.55, (s) => s.screen.fade('#000', 0.85, 0.15)],
    [9.85, (s) => s.screen.fade('#000', 0, 0.15)],
  ],
  update(t, dt, a, s) {
    a.visible = t >= 2;
    // Glides in without a step.
    a.f = t < 4.5 ? lerp(-4.4, -1.5, ramp(t, 2, 4.5)) : lerp(-1.5, 0, ramp(t, 4.5, 6.5));
    a.y = 0.05 + Math.sin(t * 2.4) * 0.03;
    if (t < 8) {
      hold(a, wraithPose, POSES.stance, REAP_DRAG, t, 2, 2.4);
      // The mask turns slowly to face the camera.
      if (t > 6.5) wraithPose[P.headYaw] = lerp(1.2, 0, ramp(t, 6.6, 7.8));
    } else {
      swing(a, 'wraith', 'H2', t, 8.1, 1.15);
    }
    if (t > 4.5 && t < 6.5 && s.visual && Math.random() < dt * 5) {
      const p = s.visual.bladeTip;
      s.vfx.dustRing(p.x, p.z, 0x8e0b10, 0.25, 1.2);
    }
    if (t > 2 && t < 8) drift(s, dt, 40, { f: [a.f - 0.5, a.f + 0.3], r: [-0.4, 0.4], y: [0, 0.4], colors: [0x8a8f99, 0x5e636c], gravity: -0.2, size: [0.06, 0.12] });
    // The arena lights stutter as it arrives.
    if (t < 1.6 && Math.random() < dt * 12) s.exposure(0.35 + Math.random() * 0.6, 0.04);
    else if (t >= 1.6 && t < 1.7) s.exposure(0.6, 0.3);
  },
};

// ------------------------------------------------------------------ Lancer
const lancerPose = new Float32Array(POSES.stance.length);
/** Spear stood upright, butt on the floor, blade above his head. */
const SPEAR_UP = pose({ ...UPRIGHT, hipY: 0.86, wpx: -0.42, wpy: 0.12, wpz: 0.22, wdx: 0, wdy: 1, wdz: 0.02 });
/** Spear raised for the slam. */
const SPEAR_RAISE = pose({ ...UPRIGHT, hipY: 0.9, lean: -0.05, wpx: -0.4, wpy: 0.5, wpz: 0.25, wdx: 0, wdy: 1, wdz: 0.06 });
const lancer: IntroScript = {
  duration: 10,
  finale: 7.5,
  card: 8.4,
  shots: (at) => [
    shot(1.5, cam(at, [6.2, -3.2, 2.6], [0, 0, 1.2], 50), cam(at, [6, -3.1, 2.5], [0, 0, 1.2], 50)),
    shot(2, cam(at, [3.4, 0.4, 1.25], [0, 0, 1.3], 44), cam(at, [2.3, 0.3, 1.35], [0, 0, 1.4], 42)),
    shot(1.5, cam(at, [0.15, 1.5, 1.78], [0, 0, 1.72], 30), cam(at, [0.25, 1.45, 1.8], [0, 0, 1.72], 29)),
    ...orbit(at, { duration: 2.5, look: [0, 0, 1.3], radius: [2.8, 2.6], height: [1.1, 1.0], angle: [-Math.PI / 2, Math.PI / 2], fov: [46, 46] }),
    shot(2.5, cam(at, [3.2, 0.25, 0.4], [0, 0, 1.45], 44), cam(at, [3.0, 0.2, 0.45], [0, 0, 1.45], 42)),
  ],
  cues: [
    [0, (s) => s.exposure(0.55, 0.3)],
    [0.6, (s) => {
      s.sfx('thunder');
      s.screen.flash('#ffffff', 0.45);
      s.shake('large');
      s.exposure(1.6, 0.02);
      s.vfx.flash(s.pt(0, 0, 1.5), 0xfff2b0, 6, 0.4);
      s.vfx.sparksAt({ at: s.pt(0, 0, 0.1), count: 60, colors: [0xffe08a, 0xffffff, 0xffb02e], speed: [2, 8], life: [0.2, 0.6], size: [0.05, 0.12], gravity: 6, dir: [0, 1, 0], spread: 1 });
      s.vfx.dustRing(...xz(s, 0, 0), 0x2a2622, 1.4, 1.4);
    }],
    [0.75, (s) => s.exposure(0.6, 0.5)],
    [0.9, (s) => s.vfx.shardsAt({ at: s.pt(0, 0, 0.5), count: 30, colors: [0x5a5550, 0x77716a], speed: [0.3, 1.2], life: [1.2, 2.2], size: [0.25, 0.45], gravity: -0.4, drag: 1.5 })],
    [1.6, (s) => s.sfx('crackle')],
    [2.4, (s) => s.sfx('clothFlap', -0.2, 0, 1.4)],
    [3.5, (s) => s.sfx('wind')],
    [3.8, (s) => s.sfx('electricHum')],
    [5.0, (s) => s.sfx('electricHum')],
    ...each([5.75, 6.15, 6.55], (s) => {
      s.sfx('crackle');
      s.sfx('whoosh');
      s.vfx.slashArc(s.pt(0, 0, 1.2), s.camera, 0xffd060, 1.4);
    }),
    [7.6, (s) => s.exposure(0.85, 0.5)],
    [8.05, (s) => {
      s.sfx('thunder');
      s.shake('large');
      s.screen.flash('#fff3c0', 0.25, 0.6);
      s.vfx.dustRing(...xz(s, 0.22, 0.42), 0xffd060, 2.6, 0.8);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        s.vfx.sparksAt({ at: s.pt(0.22, 0.42, 0.05), count: 10, colors: [0xffe08a, 0xffffff], speed: [4, 9], life: [0.2, 0.5], size: [0.05, 0.1], gravity: 0, drag: 2, dir: [Math.cos(a), 0.05, Math.sin(a)], spread: 0.15 });
      }
    }],
  ],
  update(t, dt, a, s) {
    a.visible = t >= 0.6;
    const twirl = swing(a, 'lancer', 'H2', t, 5.55, 0.9);
    if (!twirl) {
      if (t < 7.6) a.pose = SPEAR_UP;
      else if (t < 8.05) hold(a, lancerPose, SPEAR_UP, SPEAR_RAISE, t, 7.6, 7.95);
      else hold(a, lancerPose, SPEAR_RAISE, SPEAR_UP, t, 8.0, 8.08);
    }
    if (s.visual) s.visual.charged = (t > 0.6 && t < 3.5) || twirl || (t > 7.6 && t < 8.6);
    if (t > 1.5 && t < 3.5) drift(s, dt, 25, { f: [-0.6, 0.8], r: [-0.8, 0.8], y: [0.2, 1.4], colors: [0x5a5550], gravity: -0.15, size: [0.2, 0.35], shards: true });
    if (t > 3.5 && t < 5 && Math.random() < dt * 6) s.vfx.sparksAt({ at: s.pt(0, Math.random() > 0.5 ? 0.25 : -0.25, 1.5), count: 2, colors: [0xffe08a], speed: [0.3, 1], life: [0.2, 0.4], size: [0.03, 0.05], gravity: 1 });
  },
};

// ------------------------------------------------------------------ Assassin
const assassinPose = new Float32Array(POSES.stance.length);
/** Both daggers drawn in reverse grip, crossed in front of the hood. */
const CROSS = pose({ hipY: 0.74, lean: 0.25, twist: 0, headYaw: 0, headPitch: 0.12, wpx: 0.06, wpy: 0.5, wpz: 0.36, wdx: 0.55, wdy: 0.8, wdz: 0.2, ...{ flx: 0.26, flz: 0.28, frx: -0.27, frz: -0.27 } });
const assassin: IntroScript = {
  duration: 9.5,
  finale: 7,
  card: 7.9,
  draw: 7.4,
  shots: (at) => [
    shot(2, cam(at, [6, -2.4, 2.2], [0, 0, 0.9], 50)),
    shot(1.5, cam(at, [1.8, 0.1, 1.55], [0, 0, 1.55], 34)),
    shot(0.5, cam(at, [3, 0, 1.6], [0, -4, 2.5], 60), cam(at, [3, 0, 1.6], [-4, -1, 3], 60), whip),
    shot(0.5, cam(at, [3, 0, 1.6], [-4, -1, 3], 60), cam(at, [3, 0, 1.6], [-2, 4, 3.5], 60), whip),
    shot(0.5, cam(at, [3, 0, 1.6], [-2, 4, 3.5], 60), cam(at, [3, 0, 1.6], [0, 0, 4.5], 60), whip),
    shot(2, cam(at, [0.25, 0, 6.2], [0, 0, 0], 42), cam(at, [0.25, 0, 5.8], [0, 0, 0], 42)),
    shot(2.5, cam(at, [1.3, 0.12, 1.5], [0, 0, 1.45], 32), cam(at, [1.0, 0.1, 1.5], [0, 0, 1.45], 29)),
  ],
  cues: [
    [0, (s) => s.sfx('wind', 3)],
    ...each([0.35, 0.85, 1.35, 1.8], (s, i) => {
      s.sfx('clunk', 3, (i - 1.5) * 2, 4);
      s.exposure([0.65, 0.38, 0.18, 0.02][i]!, 0.04);
    }),
    [1.8, (s) => {
      s.screen.fade('#000', 0.9, 0.08);
      s.screen.bloom('#0d3a35', 0.35, 0.6);
    }],
    [2.45, (s) => {
      for (const r of [-0.05, 0.05]) {
        const p = s.project(0, r, 1.56);
        if (p) s.screen.glow(p.x, p.y, '#ff2a2a', 11, 1.1);
      }
    }],
    [2.6, (s) => s.sfx('shing', -2, 2, 1)],
    [3.5, (s) => {
      s.exposure(1, 0.02);
      s.screen.fade('#000', 0, 0.04);
      s.screen.bloom('#0d3a35', 0, 0.3);
      s.sfx('clunk', 2, 0, 4);
    }],
    ...each([3.6, 3.72, 3.84, 3.96, 4.1], (s, i) => s.sfx('land', -1 + i, 2 - i, 4.5)),
    [4.55, (s) => s.sfx('drop', 0, 0, 0.1)],
    [4.5, (s) => s.vfx.sparksAt({ at: s.pt(0, 0, 4.2), count: 12, colors: [0xb8ad98], speed: [0.1, 0.4], life: [1, 1.6], size: [0.03, 0.06], gravity: 2 })],
    [5.3, (s) => s.sfx('clothFlap', 0, 0, 2)],
    [5.62, (s) => {
      s.sfx('land');
      s.vfx.dustRing(...xz(s, 0, 0), 0x38bea8, 1.1, 0.9);
      s.vfx.sparksAt({ at: s.pt(0, 0, 0.2), count: 30, colors: [0x38bea8, 0x1d6e63, 0x9be8dc], speed: [0.6, 2.2], life: [0.5, 1.1], size: [0.08, 0.16], gravity: -0.3, drag: 2.5 });
      s.vfx.shardsAt({ at: s.pt(0, 0, 0.5), count: 10, colors: [0x1f4f4a, 0x2a6a61], speed: [1, 2.5], life: [0.5, 0.9], size: [0.1, 0.2], gravity: 3 });
    }],
    ...each([7.4, 7.55], (s, i) => {
      s.sfx('shing');
      s.vfx.flash(s.pt(0.35, i ? 0.12 : -0.12, 1.6), 0xff3b3b, 0.3, 0.3);
    }),
    [7.75, (s) => s.visual?.flashTint(1, 0.15, 0.1, 0.3, 0.4)],
  ],
  update(t, _dt, a) {
    a.visible = t >= 5.2;
    if (t < 5.62) {
      // Drops from the rafters.
      a.y = 6 * (1 - ((t - 5.2) / 0.42) ** 2);
      a.special = 'landing';
    } else if (t < 6.5) {
      a.special = 'landing';
    } else if (t < 7.4) {
      hold(a, assassinPose, POSES.landing, POSES.stance, t, 6.5, 7.1);
    } else {
      hold(a, assassinPose, POSES.stance, CROSS, t, 7.4, 7.6);
    }
    a.y = Math.max(0, a.y);
  },
};

// ------------------------------------------------------------------ Duelist
const duelistPose = new Float32Array(POSES.stance.length);
/** Blade raised to the face in salute. */
const SALUTE = pose({ ...UPRIGHT, hipY: 0.88, lean: 0, twist: 0, wpx: -0.02, wpy: 0.48, wpz: 0.18, wdx: 0, wdy: 1, wdz: 0.05 });
/** Rapier pointed straight down the lens. */
const POINT = pose({ hipY: 0.85, lean: 0.12, twist: -0.6, headYaw: 0.5, headPitch: 0, wpx: -0.16, wpy: 0.52, wpz: 0.62, wdx: 0.04, wdy: 0.02, wdz: 1, flx: 0.18, flz: 0.32, frx: -0.22, frz: -0.32 });
const PETALS = { f: [-3, 3] as [number, number], r: [-3, 3] as [number, number], y: [1.5, 3.5] as [number, number], colors: [0xffffff, 0xf4efe6], gravity: 0.25, size: [0.05, 0.09] as [number, number], shards: true };
const duelist: IntroScript = {
  duration: 10,
  finale: 7.5,
  card: 8,
  draw: 5.25,
  shots: (at) => [
    shot(2, cam(at, [5, -3.2, 4.5], [0, 0, 0.6], 48), cam(at, [4.2, -2.6, 2.5], [0, 0, 0.9], 48), easeOut),
    shot(2, cam(at, [-3, 2.2, 1.3], [-3, 0, 1.2], 42), cam(at, [-0.8, 2.2, 1.3], [-0.8, 0, 1.2], 42)),
    shot(1, cam(at, [0.45, -0.5, 1.0], [0.05, -0.2, 0.92], 30), cam(at, [0.43, -0.48, 1.0], [0.05, -0.2, 0.92], 28)),
    ...orbit(at, { duration: 2.5, look: [0.1, 0, 1.4], radius: [2.0, 1.8], height: [1.4, 1.5], angle: [-0.9, 0.9], fov: [38, 36] }),
    shot(2.5, cam(at, [2.6, 0.05, 1.5], [0, 0, 1.45], 34), cam(at, [2.35, 0.05, 1.5], [0, 0, 1.45], 32)),
  ],
  cues: [
    [0, (s) => {
      s.exposure(1.15, 0.5);
      s.sfx('pizzicato');
    }],
    [0.5, (s) => s.sfx('birds', 3, 2, 3)],
    [1.2, (s) => s.sfx('pizzicato')],
    ...each([2.3, 2.85, 3.4, 3.9], (s, i) => step(s, -2.8 + i * 0.55, i % 2 ? 0.12 : -0.12)),
    [3.0, (s) => s.sfx('clothFlap', -1.4, 0, 1.4)],
    [4.4, (s) => {
      s.sfx('tink', 0, -0.2, 0.95);
      s.sfx('chime', 0, -0.2, 0.95);
      s.vfx.flash(s.pt(0.1, -0.24, 0.98), 0xfff6d8, 0.4, 0.3);
    }],
    [5.25, (s) => s.sfx('shing')],
    [5.5, (s) => s.sfx('whoosh')],
    [6.3, (s) => s.sfx('breath')],
    [6.55, (s) => {
      s.sfx('whoosh');
      const p = s.pt(0.9, 0.1, 1.3);
      s.vfx.shardsAt({ at: p, count: 2, colors: [0xffffff], speed: [0.4, 0.8], life: [1.2, 1.6], size: [0.07, 0.09], gravity: 0.3, drag: 1 });
      s.vfx.flash(p, 0x9cf5a5, 0.4, 0.25);
    }],
    [8.0, (s) => s.sfx('stab')],
    ...each([8.15, 9.1], (s) => s.vfx.flash(tip(s), 0xffffff, 0.3, 0.4)),
  ],
  update(t, dt, a, s) {
    walkIn(a, t, 2, 4, -3.0, -0.8, 0.9);
    if (t >= 4) a.f = lerp(-0.8, 0, ramp(t, 7.5, 8));
    if (t < 4.1) a.pose = null;
    else if (t < 5.25) hold(a, duelistPose, POSES.stance, HILT, t, 4.1, 4.3);
    else if (t < 6.35) hold(a, duelistPose, HILT, SALUTE, t, 5.25, 5.6);
    else if (!swing(a, 'duelist', 'L3', t, 6.35, 0.6)) hold(a, duelistPose, POSES.stance, POINT, t, 7.5, 7.85);
    drift(s, dt, t < 2 ? 60 : 20, PETALS);
  },
};

// ------------------------------------------------------------------ Monk
const monkPose = new Float32Array(POSES.stance.length);
/** Hands together at the chest, rolling the beads. */
const BEADS = pose({ ...UPRIGHT, hipY: 0.84, lean: 0.14, wpx: 0.02, wpy: 0.22, wpz: 0.3, wdx: 0, wdy: 0.3, wdz: 1, headPitch: 0.25 });
const monk: IntroScript = {
  duration: 10,
  finale: 7.5,
  card: 8.5,
  shots: (at) => [
    shot(2, cam(at, [6.2, -2.2, 1.6], [0, 0, 0.6], 46), cam(at, [5.9, -2.1, 1.6], [0, 0, 0.6], 46)),
    shot(2, cam(at, [-1.5, 0.9, 0.25], [-2, 0, 0.25], 46), cam(at, [0.4, 0.9, 0.25], [-0.1, 0, 0.25], 46)),
    shot(1.5, cam(at, [0.85, -0.35, 1.25], [0.2, 0, 1.05], 30), cam(at, [0.8, -0.3, 1.2], [0.2, 0, 1.05], 28)),
    ...orbit(at, { duration: 2, look: [0, 0, 1.52], radius: [2.4, 0.95], height: [1.3, 1.55], angle: [-1.1, 0], fov: [40, 28] }),
    shot(2.5, cam(at, [3.8, 0, 0.6], [0, 0, 1.2], 42), cam(at, [3.6, 0, 0.62], [0, 0, 1.2], 42)),
  ],
  cues: [
    [0, (s) => {
      s.sfx('bell');
      s.fog(0.4, 1.5);
      s.exposure(0.85, 1);
    }],
    [0.9, (s) => s.sfx('birds', 4, -2, 3)],
    ...each([2.3, 2.95, 3.6], (s, i) => {
      const f = -1.9 + i * 0.65;
      const r = i % 2 ? 0.12 : -0.12;
      s.sfx('land', f, r, 0.1);
      s.sfx('drop', f, r, 0.1);
      s.vfx.dustRing(...xz(s, f, r), 0xa9c6d6, 0.45, 1.3);
    }),
    ...each([4.2, 4.38, 4.56, 4.8], (s) => s.sfx('tick', 0.3, 0, 1.1)),
    [5.05, (s) => s.sfx('clothFlap', 0.3, 0, 1.1)],
    [5.6, (s) => s.sfx('breath')],
    [5.8, (s) => s.sfx('throat')],
    [8.15, (s) => {
      s.sfx('airThump');
      s.shake('small');
      s.vfx.dustRing(...xz(s, 0.4, 0), 0xfff4e0, 3.2, 0.7);
      s.vfx.slashArc(s.pt(0.7, 0, 1.25), s.camera, 0xfff4e0, 1.1);
    }],
    [8.6, (s) => s.sfx('bell')],
  ],
  update(t, dt, a, s) {
    walkIn(a, t, 2, 4, -2.2, 0, 0.6);
    if (t >= 4 && t < 5.4) hold(a, monkPose, POSES.stance, BEADS, t, 4, 4.3);
    else if (t >= 5.4 && t < 8) hold(a, monkPose, BEADS, POSES.guard, t, 5.4, 6);
    else if (t >= 8 && !swing(a, 'monk', 'H1', t, 7.95, 1, 0.75)) a.pose = POSES.guard;
    if (t > 5.5 && t < 7.5) drift(s, dt, 40, { f: [-0.5, 0.5], r: [-0.5, 0.5], y: [0, 1.2], colors: [0xe8d6b0, 0xcfb991], gravity: -0.4 });
  },
};

// ------------------------------------------------------------------ Knight
const knightPose = new Float32Array(POSES.stance.length);
const SWORD_UP = pose({ ...UPRIGHT, hipY: 0.92, lean: -0.05, wpx: -0.08, wpy: 0.85, wpz: 0.4, wdx: 0, wdy: -1, wdz: 0.06 });
/** Greatsword driven point-first into the floor in front of him. */
const SWORD_PLANT = pose({ ...UPRIGHT, hipY: 0.8, lean: 0.25, wpx: -0.08, wpy: 0.35, wpz: 0.48, wdx: 0, wdy: -1, wdz: 0.08 });
/** Sword drawn back to the right, flat toward the shield. */
const SWORD_BACK = pose({ ...UPRIGHT, hipY: 0.86, twist: -0.5, wpx: -0.45, wpy: 0.45, wpz: 0.15, wdx: -0.3, wdy: 0.9, wdz: 0.2 });
const SWORD_BEAT = pose({ ...UPRIGHT, hipY: 0.84, twist: 0.35, wpx: 0.12, wpy: 0.42, wpz: 0.42, wdx: 0.25, wdy: 0.95, wdz: 0.1 });
const knight: IntroScript = {
  duration: 10,
  finale: 7.5,
  card: 8.2,
  shots: (at) => [
    shot(2, cam(at, [-6, 4.5, 4.6], [0, 0, 0.8], 50), cam(at, [-5, 3.4, 3], [0, 0, 0.9], 50), easeOut),
    shot(2, cam(at, [-2.9, 1.05, 0.35], [-3.3, 0, 0.35], 46), cam(at, [-0.3, 1.05, 0.35], [-0.7, 0, 0.35], 46)),
    shot(1.5, cam(at, [1.05, -0.75, 1.15], [0.15, -0.35, 1.1], 30), cam(at, [0.95, -0.7, 1.15], [0.15, -0.35, 1.1], 28)),
    shot(2, cam(at, [1.9, 0.45, 0.35], [0.45, 0, 0.25], 38), cam(at, [1.9, 0.45, 0.95], [0, 0, 1.75], 36), easeInOut),
    shot(2.5, cam(at, [3.4, 0.8, 0.5], [0, 0, 1.35], 42), cam(at, [3.2, 0.75, 0.55], [0, 0, 1.35], 40)),
  ],
  cues: [
    [0, (s) => {
      s.sfx('fanfare');
      s.exposure(1.12, 1);
    }],
    [0.4, (s) => s.sfx('wind', 3)],
    [1.1, (s) => s.sfx('fanfare')],
    ...each([2.2, 2.75, 3.3, 3.85], (s, i) => {
      step(s, -3.2 + i * 0.65, i % 2 ? 0.14 : -0.14);
      if (i % 2) s.sfx('tink', -3.2 + i * 0.65, 0, 1.2);
    }),
    [4.25, (s) => {
      s.sfx('bell', 0.3, -0.35, 1.1);
      s.vfx.flash(s.pt(0.3, -0.38, 1.12), 0xffd27a, 0.8, 1.0);
    }],
    [6.0, (s) => {
      s.sfx('clang');
      s.sfx('slam');
      s.shake('large');
      const p = tip(s);
      s.vfx.sparksAt({ at: { x: p.x, y: 0.05, z: p.z }, count: 40, colors: [0xffc14a, 0xff8a1e, 0xfff1b0], speed: [2, 7], life: [0.25, 0.6], size: [0.05, 0.11], gravity: 8, dir: [0, 1, 0], spread: 1 });
      s.vfx.shardsAt({ at: { x: p.x, y: 0.1, z: p.z }, count: 16, colors: [0x8a857a, 0x6d695f], speed: [1, 3], life: [0.4, 0.8], size: [0.06, 0.12], gravity: 9 });
      s.vfx.dustRing(p.x, p.z, 0xd8d2c4, 0.8);
    }],
    ...each([8.0, 8.5], (s) => {
      s.sfx('clang', 0.3, -0.3, 1.2);
      s.vfx.sparksAt({ at: s.pt(0.4, -0.3, 1.25), count: 14, colors: [0xffe2a0, 0xffffff], speed: [2, 5], life: [0.15, 0.35], size: [0.04, 0.08], gravity: 5 });
      s.visual?.flashTint(1, 0.85, 0.5, 0.35, 0.3);
    }),
  ],
  update(t, _dt, a) {
    walkIn(a, t, 2, 4, -3.4, -0.6, 0.9);
    if (t >= 4) a.f = lerp(-0.6, 0, ramp(t, 4, 5.5));
    if (t >= 4 && t < 5.5) hold(a, knightPose, POSES.stance, POSES.guard, t, 4, 4.3);
    else if (t >= 5.5 && t < 5.95) hold(a, knightPose, POSES.guard, SWORD_UP, t, 5.5, 5.9);
    else if (t >= 5.95 && t < 7.6) hold(a, knightPose, SWORD_UP, SWORD_PLANT, t, 5.95, 6.0);
    else if (t >= 7.6 && t < 7.75) hold(a, knightPose, SWORD_PLANT, SWORD_BACK, t, 7.6, 7.75);
    else if (t >= 7.75) {
      // Two beats of the flat against the shield, landing at 8.0 and 8.5.
      const beat = t < 8.0 ? ramp(t, 7.75, 8.0) : t < 8.25 ? 1 - ramp(t, 8.0, 8.25) : t < 8.5 ? ramp(t, 8.25, 8.5) : 1 - ramp(t, 8.6, 9.2);
      a.pose = lerpPose(knightPose, SWORD_BACK, SWORD_BEAT, beat);
    }
  },
};

export const INTRO_SCRIPTS: Record<WeaponId, IntroScript> = { ronin, warden, wraith, lancer, assassin, duelist, monk, knight };

/** Kanji and the line delivered on the name card, from characters/intros.js and the character sheets. */
export const INTRO_CARDS: Record<WeaponId, { kanji: string; line: string }> = {
  ronin: { kanji: '浪人', line: '“Your name won’t be remembered. Neither will mine.”' },
  warden: { kanji: '石衛', line: '“Move me.”' },
  wraith: { kanji: '鎌鬼', line: '“Shhh…”' },
  lancer: { kanji: '槍騎士', line: '“Stand, or be struck.”' },
  assassin: { kanji: '影刃', line: '“You never heard me.”' },
  duelist: { kanji: '細剣士', line: '“Shall we dance?”' },
  monk: { kanji: '老師', line: '“I have outlived braver men. Come.”' },
  knight: { kanji: '騎士', line: '“By oath, I stand.”' },
};

/** Shot list length must match each script's duration; checked in development builds. */
export function checkIntroScripts(at: At): string[] {
  const errors: string[] = [];
  for (const [id, s] of Object.entries(INTRO_SCRIPTS)) {
    const total = s.shots(at).reduce((n, x) => n + x.duration, 0);
    if (Math.abs(total - s.duration) > 1e-3) errors.push(`${id}: shots run ${total.toFixed(2)} s, script ${s.duration} s`);
    if (s.card < s.finale) errors.push(`${id}: card before finale`);
  }
  return errors;
}
