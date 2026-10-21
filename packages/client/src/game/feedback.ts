import type { Match, Side, SimEvent } from '@nfg/shared';
import type { AudioEngine } from '../audio/engine.ts';
import type { Hud } from '../ui/hud.ts';
import type { ScreenFx } from '../ui/overlay.ts';
import type { World } from './world.ts';

export interface FeedbackContext {
  world: World;
  hud: Hud;
  fx: ScreenFx;
  audio: AudioEngine;
  match: Match;
  you: Side;
  /** Called the first time the player faces a white-glow attack, for a hint. */
  onTelegraphSeen?: () => void;
}

const RED: [number, number, number] = [1, 0.12, 0.1];
const GUARD_BREAK: [number, number, number] = [1, 0.32, 0.1];
const PARRIED: [number, number, number] = [1, 0.55, 0.12];

/**
 * One function per outcome, each with a fixed color and set of effects (the doc's
 * hit-feedback table). Hitstop itself lives in the simulation.
 */
export function playEvent(e: SimEvent, c: FeedbackContext): void {
  const { world, hud, fx, audio, you, match } = c;
  const visuals = world.visuals;
  if (!visuals) return;
  const fighterPan = (who: Side) => {
    const f = match.fighters[who];
    return world.pan(f.x, 1.2, f.z);
  };

  switch (e.type) {
    case 'telegraph':
      audio.play('telegraph', { pan: fighterPan(e.who) });
      if (e.who !== you) c.onTelegraphSeen?.();
      break;
    case 'swing':
      audio.play('swing', { pan: fighterPan(e.who), kind: e.kind, weaponClass: classOf(match, e.who) });
      break;
    case 'hit': {
      const heavy = e.kind !== 'light' || e.knockdown;
      const victim = visuals[e.victim];
      victim.flashTint(...RED, 1, heavy ? 0.16 : 0.1);
      const blade = e.weaponClass === 'blade';
      world.vfx.sparksAt({
        at: e,
        count: heavy ? 26 : 14,
        colors: blade ? [0xff3b3b, 0xffffff, 0xff7a5a] : [0xffd0a0, 0xff5a3a, 0xffffff],
        speed: [3, heavy ? 9 : 6],
        life: [0.18, 0.45],
        size: [0.06, 0.14],
        gravity: 7,
      });
      world.vfx.slashArc(e, world.cam.camera, blade ? 0xffffff : 0xffe2c4, heavy ? 1.4 : 1);
      world.vfx.flash(e, heavy ? 0xffd6d0 : 0xffffff, heavy ? 2.2 : 1.5);
      hud.hpHit(e.victim);
      const dx = match.fighters[e.victim].x - match.fighters[e.attacker].x;
      const dz = match.fighters[e.victim].z - match.fighters[e.attacker].z;
      const len = Math.hypot(dx, dz) || 1;
      if (e.victim === you) {
        world.cam.shake(heavy ? 'large' : 'small');
        if (heavy) fx.desaturate(0.6);
      } else {
        world.cam.shake('small');
      }
      if (heavy) world.cam.kick(dx / len, dz / len, 0.2);
      audio.play('hit', { weaponClass: e.weaponClass, kind: e.kind, pan: world.pan(e.x, e.y, e.z), intensity: heavy ? 0.9 : 0.6 });
      if (e.knockdown) {
        audio.play('knockdown', { pan: world.pan(e.x, e.y, e.z) });
        audio.duckMusic(5, 0.4);
        world.cam.punchIn(match.fighters[e.victim]);
        const v = match.fighters[e.victim];
        setTimeout(() => world.vfx.dustRing(v.x, v.z), 250);
      }
      if (e.ko) fx.pulse('white', 0.5, 0.05, 0.35);
      break;
    }
    case 'block':
      world.vfx.sparksAt({ at: e, count: 10, colors: [0xffffff, 0xcfd8ff], speed: [2, 6], life: [0.1, 0.25], size: [0.05, 0.1], gravity: 2 });
      world.vfx.flash(e, 0xe8eeff, 1.1, 0.1);
      if (e.victim === you) {
        hud.postureFlash('red');
        world.cam.shake('small');
      }
      audio.play('block', { pan: world.pan(e.x, e.y, e.z), weaponClass: e.weaponClass });
      break;
    case 'parry':
      // Gold: the attacker was parried and is punished.
      visuals[e.attacker].flashTint(...PARRIED, 0.9, 0.3);
      world.vfx.flash(e, 0xffc34a, 2.8, 0.22);
      world.vfx.sparksAt({ at: e, count: 30, colors: [0xffc14a, 0xff8a1e, 0xfff1b0], speed: [3, 9], life: [0.25, 0.6], size: [0.06, 0.13], gravity: 8 });
      if (e.victim === you || e.attacker === you) fx.pulse('gold', 0.8, 0.05, 0.25);
      if (e.victim === you) hud.postureFlash('gold');
      if (e.attacker === you) hud.postureFlash('red');
      world.cam.shake('small');
      audio.play('parry', { pan: world.pan(e.x, e.y, e.z) });
      break;
    case 'guardbreak': {
      visuals[e.victim].flashTint(...GUARD_BREAK, 1, 0.45);
      world.vfx.shardsAt({ at: e, count: 46, colors: [0xffffff, 0xe8f0ff, 0xffd6d6], speed: [4, 11], life: [0.4, 0.8], size: [0.18, 0.4], gravity: 3, drag: 1.5 });
      world.vfx.flash(e, 0xffffff, 3, 0.18);
      world.cam.punchIn(match.fighters[e.victim]);
      world.cam.shake('large');
      if (e.victim === you) {
        fx.pulse('red', 1, 0.35, 0.3, 0.06);
        fx.pulse('redglow', 0.9, 0.35, 0.4);
        hud.postureFlash('red');
      } else {
        fx.pulse('red', 0.45, 0.2, 0.3, 0.06);
      }
      fx.pulse('white', 0.35, 0.02, 0.15, 0.02);
      if (e.damage > 0) hud.hpHit(e.victim);
      audio.play('guardbreak', { pan: world.pan(e.x, e.y, e.z) });
      audio.duckMusic(5, 0.4);
      break;
    }
    case 'parryWhiff':
      audio.play('parryWhiff', { pan: fighterPan(e.who) });
      break;
    case 'dodge':
      audio.play('dodge', { pan: fighterPan(e.who) });
      break;
    case 'jump':
      audio.play('jump', { pan: fighterPan(e.who) });
      break;
    case 'land':
      audio.play('land', { pan: fighterPan(e.who) });
      break;
    default:
      break;
  }
}

function classOf(match: Match, who: Side): 'blade' | 'blunt' {
  return match.fighters[who].weapon === 'bo' ? 'blunt' : 'blade';
}
