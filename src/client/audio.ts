/**
 * All sound is synthesised with WebAudio, so the game ships with zero audio assets. The toolkit,
 * materials, per-fighter profiles and recipes live in ./audio/; this is the live engine: it owns the
 * AudioContext and the mix, places each sound in stereo from the camera, keeps sounds from
 * machine-gunning, cuts a swing's follow-through when it lands, and runs the execution's bed.
 */
import { CHARACTERS, CharacterId, getAttack } from '../shared/characters';
import type { CombatEvent } from '../shared/protocol';
import { LEGACY_LEVEL, Sfx, legacy } from './audio/legacy';
import { loadSamples } from './audio/samples';
import { LEVEL, WET } from './audio/levels';
import { Mixer, Voice } from './audio/mixer';
import { Bed, Music } from './audio/music';
import { Profile, profile } from './audio/profiles';
import * as R from './audio/recipes';
import type { Out } from './audio/synth';
import { settings } from './settings';

interface V3 {
  x: number;
  y: number;
  z: number;
}

/** Anything with a position and a world matrix (a three.js camera). */
interface Listener {
  position: V3;
  matrixWorld: { elements: ArrayLike<number> };
}

/** Each map's acoustic and what you walk on. */
const SPACES: Record<string, { room: string; floor: R.Floor }> = {
  title: { room: 'valley', floor: 'earth' },
  lobby: { room: 'stone', floor: 'stone' },
  sakura: { room: 'open', floor: 'earth' },
  bamboo: { room: 'grove', floor: 'earth' },
  summit: { room: 'valley', floor: 'snow' },
  forge: { room: 'hall', floor: 'stone' },
  bridge: { room: 'valley', floor: 'wood' },
  ruins: { room: 'stone', floor: 'stone' },
};

/** Outcomes where the swing met something (its follow-through is cut). */
const CONTACT = new Set<CombatEvent['k']>(['hit', 'armor', 'block', 'guardBreak', 'deflect', 'mikiri', 'counter', 'deathblow']);

const MAX_VOICES = 48;

/**
 * Named sounds that play the user's recordings (layers together) rather than the synthesised ones,
 * and how far into them to start. The synthesised sound plays until the recordings have decoded.
 */
const RECORDED: Partial<Record<Sfx, { layers: string[]; offset?: number }>> = {
  click: { layers: ['ui_click'] },
  matchFound: { layers: ['match_found'] },
  // one cycle of the ticking loop per number (see countdown()), from where its zap has built
  countdown: { layers: ['countdown'], offset: 0.2 },
  fight: { layers: ['start_screech', 'start_confirm'] },
  victory: { layers: ['victory_fanfare', 'victory_piano'] },
  defeat: { layers: ['defeat'] },
  // the title screen's (the entrances draw with the Ronin's unsheathe, see entrance())
  draw: { layers: ['blade_draw'] },
  shing: { layers: ['blade_shing'] },
  // the title screen's (the entrances whoosh with each fighter's recorded swing)
  whoosh: { layers: ['heavy_whoosh'] },
  // the title screen's (silent in the Ronin's entrance)
  tink: { layers: ['glass_tink'] },
  // the title screen's (the Monk's entrance chimes with his glitter)
  chime: { layers: ['riser_chime'] },
};

export interface Placed {
  /** distance volume from the caller (0..1) */
  vol: number;
  pos?: V3;
}

export interface CombatOpts extends Placed {
  a?: CharacterId;
  d?: CharacterId;
  heavy: boolean;
  /** the local player is the attacker or the defender */
  mine: boolean;
  /** back-to-back deflects */
  streak?: number;
}

interface Emit {
  level: number;
  vol: number;
  pos?: V3;
  wet?: number;
  hero?: boolean;
  /** throttle key: a repeat within `gap` s is dropped, within 2.5×gap softened */
  key?: string;
  gap?: number;
  /** 0: footsteps and other garnish (dropped first when busy) */
  priority?: number;
  delay?: number;
}

interface Walker {
  phase: number;
  last: number;
  air: boolean;
  tip: V3 | null;
  lastWhoosh: number;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private mix: Mixer | null = null;
  private listener: Listener | null = null;
  private floor: R.Floor = 'earth';
  private roomId = 'open';
  private active = 0;
  private recent = new Map<string, number>();
  private swings = new Map<string, { voice: Voice; at: number }>();
  private execs = new Map<string, Voice>();
  private walkers = new Map<string, Walker>();

  /** Must be called from a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.mix = new Mixer(this.ctx);
      void loadSamples(this.ctx);
      this.mix.setRoom(this.roomId);
      this.tunes = new Music(this.ctx);
      this.tunes.attach(this.mix.master);
      this.tunes.setVolume(settings.music);
      if (this.bed) this.tunes.play(this.bed);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.tunes?.prime();
    this.setVolume(settings.volume);
  }

  private tunes: Music | null = null;
  private bed: Bed | null = null;

  /** Start a music bed (the fighter select, the fight), or fade the music out with null. */
  music(bed: Bed | null, fade = 2): void {
    this.bed = bed;
    if (!this.tunes) return;
    if (bed) this.tunes.play(bed);
    else this.tunes.stop(fade);
    // the fight's first song loads while the fighters are picked
    if (bed === 'select') this.tunes.cue('combat');
  }

  /** Under an execution. */
  musicDuck(on: boolean): void {
    this.tunes?.duck(on);
  }

  setMusicVolume(v: number): void {
    this.tunes?.setVolume(v);
  }

  private volume = settings.volume;
  private mutedBy = new Set<string>();

  setVolume(v: number): void {
    this.volume = v;
    if (this.mix) this.mix.master.gain.value = this.mutedBy.size ? 0 : v * 0.9;
  }

  /** Mute for a reason (the platform's setting, an ad playing) until every reason is lifted. */
  setMuted(reason: string, on: boolean): void {
    if (on) this.mutedBy.add(reason);
    else this.mutedBy.delete(reason);
    this.setVolume(this.volume);
  }

  /** The camera: sounds are panned and filtered from where it is and which way it faces. */
  setListener(l: Listener): void {
    this.listener = l;
  }

  /** The map's acoustic (reverb) and floor (footsteps). */
  setSpace(mapId: string): void {
    const s = SPACES[mapId] ?? { room: 'open', floor: 'earth' };
    this.floor = s.floor;
    this.roomId = s.room;
    this.mix?.setRoom(s.room);
  }

  // ---------------------------------------------------------------- core

  private place(pos: V3 | undefined): { pan: number; air?: number } {
    const l = this.listener;
    if (!pos || !l) return { pan: 0 };
    const dx = pos.x - l.position.x;
    const dy = pos.y - l.position.y;
    const dz = pos.z - l.position.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const e = l.matrixWorld.elements;
    const side = (dx * e[0] + dy * e[1] + dz * e[2]) / dist;
    // close sounds sit in the middle; the further off to one side, the wider
    const pan = Math.max(-1, Math.min(1, side)) * Math.min(1, dist / 4) * 0.75;
    const air = dist > 12 ? Math.max(2500, 18000 * Math.exp(-(dist - 12) / 22)) : undefined;
    return { pan, air };
  }

  private emit(fn: (o: Out) => void, e: Emit): Voice | null {
    const mix = this.mix;
    const ctx = this.ctx;
    if (!mix || !ctx || this.mutedBy.size || e.vol <= 0.01) return null;
    const pr = e.priority ?? 1;
    // garnish goes first, then the ordinary sounds; combat outcomes get a little more room, and
    // only an execution's finishing blow plays past the hard ceiling
    if (this.active >= MAX_VOICES * 0.7 && pr < 1) return null;
    if (this.active >= MAX_VOICES && pr < 2) return null;
    if (this.active >= MAX_VOICES * 1.5 && pr < 3) return null;
    let gain = e.level * Math.min(1, e.vol);
    if (e.key) {
      const now = ctx.currentTime;
      const last = this.recent.get(e.key) ?? -Infinity;
      const gap = e.gap ?? 0.03;
      if (now - last < gap) return null;
      if (now - last < gap * 2.5) gain *= 0.6;
      this.recent.set(e.key, now);
      if (this.recent.size > 200) this.recent.clear();
    }
    const { pan, air } = this.place(e.pos);
    const v = mix.voice({ gain, pan, air, wet: e.wet, hero: e.hero, t: ctx.currentTime + 0.005 + (e.delay ?? 0) });
    fn(v.out);
    this.active++;
    const life = Math.max(0.05, v.out.end - ctx.currentTime) + 0.3;
    setTimeout(() => {
      this.active--;
      v.input.disconnect();
    }, life * 1000);
    return v;
  }

  /** A named sound (menus, the countdown, entrances, the title screen); `take` picks which of its recordings. */
  play(name: Sfx, volume = 1, pos?: V3, take?: number): void {
    const ui = name === 'click' || name === 'type' || name === 'countdown' || name === 'matchFound' || name === 'fight' || name === 'victory' || name === 'defeat';
    const rec = RECORDED[name];
    this.emit((o) => void ((rec && R.playLayers(o, rec.layers, 1, take, rec.offset)) || legacy(o, name)), {
      level: (ui ? LEVEL.ui : LEVEL.legacy) * (LEGACY_LEVEL[name] ?? 1),
      vol: volume,
      pos,
      wet: ui ? 0 : 0.25,
      // clicks and typing don't machine-gun, and a challenge's horn over one still sounding is dropped
      key: name === 'click' || name === 'type' || name === 'matchFound' ? name : undefined,
      gap: name === 'matchFound' ? 2 : 0.02,
      priority: ui ? 2 : 1,
    });
  }

  /** The countdown at `n` (3, 2, 1): each number plays its own cycle of the recorded loop, in order. */
  countdown(n: number, volume = 1): void {
    this.play('countdown', volume, undefined, Math.max(0, 3 - n));
  }

  /**
   * A ring-entrance cue. They were the old synthesised effects (chimes, bells, plucks); now each
   * plays one of the recordings where one fits, and the bell-like ones give way to the fighter's own
   * shimmer or are dropped. The Ronin's wind and taiko, the Warden's rumble and gong, the Wraith's
   * scrape, the Monk's breath and the stomps have (layered) recordings of their own.
   */
  entrance(char: CharacterId, name: Sfx, volume = 1): void {
    // the Wraith's entrance keeps his old dark whoosh
    const swing = char === 'reaper' ? 'reaper_swing' : char === 'duelist' ? 'duelist_swing' : char === 'lancer' ? 'lancer_swing' : char === 'juggernaut' ? 'juggernaut_swing' : 'ronin_swing';
    const shine = char === 'paladin' ? 'paladin_shimmer' : char === 'monk' ? 'monk_glitter' : null;
    const INTRO: Partial<Record<Sfx, [string | string[] | null, number, number?]>> = {
      whoosh: [swing, 1.2],
      shing: ['ronin_unsheathe', 1, 0.05],
      draw: ['ronin_unsheathe', 1, 0.05],
      clang: ['block', 1.2],
      stomp: ['entrance_stomp', 1],
      thump: ['paladin_deflect', 0.9],
      zap: ['lancer_spark', 1.6],
      thunder: ['lancer_bolt', 2.2],
      chime: [shine, 1.6],
      bell: [shine, 1.6],
      tink: [shine, 1.2],
      pluck: [shine, 1.2],
      fanfare: [shine, 1.8],
      whisper: [null, 0],
    };
    if (char === 'ronin') {
      INTRO.wind = [['wind_howl', 'ronin_wind_sweep'], 1];
      INTRO.taiko = [['ronin_taiko', 'ronin_flute'], 1];
    } else if (char === 'juggernaut') {
      INTRO.rumble = [['juggernaut_boom', 'juggernaut_rubble'], 1];
      INTRO.gong = [['juggernaut_slam', 'juggernaut_thud'], 1];
    } else if (char === 'reaper') INTRO.scrape = [['reaper_scrape', 'reaper_groan'], 1];
    else if (char === 'monk') INTRO.breath = ['monk_breath', 1];
    const m = INTRO[name];
    if (!m) return this.play(name, volume);
    const [rec, gain, offset] = m;
    if (!rec) return;
    const layers = typeof rec === 'string' ? [rec] : rec;
    this.emit((o) => void (R.playLayers(o, layers, gain, undefined, offset ?? 0) || legacy(o, name)), { level: LEVEL.legacy, vol: volume, wet: 0.25, gap: 0.02, priority: 1 });
  }

  // ---------------------------------------------------------------- fighters

  /** The swing at the end of an attack's wind-up. Its follow-through is cut if the blow connects. */
  swing(fighterId: string, char: CharacterId, key: string | undefined, o: Placed & { heavy: boolean }): void {
    const p = profile(char);
    const anim = key ? getAttack(CHARACTERS[char], key as never)?.anim : undefined;
    const v = this.emit((out) => R.swing(out, p, { heavy: o.heavy, anim }), { level: LEVEL.swing, vol: o.vol, pos: o.pos, wet: WET.swing, key: `sw:${fighterId}`, gap: 0.06 });
    if (v && this.ctx) this.swings.set(fighterId, { voice: v, at: this.ctx.currentTime });
  }

  /** Everything a combat event sounds like, from who hit whom with what. */
  combat(e: CombatEvent, o: CombatOpts): void {
    const A = profile(o.a);
    const D = profile(o.d);
    const anim = o.a && e.key ? getAttack(CHARACTERS[o.a], e.key)?.anim : undefined;
    const heavy = o.heavy;
    const pos = o.pos ?? { x: e.x, y: e.y, z: e.z };
    const at = { vol: o.vol, pos };
    const now = this.ctx?.currentTime ?? 0;
    // it landed on something: the swing stops carrying through
    if (e.a && CONTACT.has(e.k)) {
      const s = this.swings.get(e.a);
      if (s && now - s.at < 1.2) s.voice.stop(0.05);
      this.swings.delete(e.a);
    }
    const tags = e.tags ?? [];
    switch (e.k) {
      case 'deflect':
        this.emit((out) => R.deflect(out, A, D, { heavy, anim, streak: o.streak }), { ...at, level: LEVEL.deflect, wet: WET.deflect, key: 'deflect', gap: 0.03, priority: 2 });
        break;
      case 'block':
        this.emit((out) => R.block(out, A, D, { heavy, anim }), { ...at, level: LEVEL.block, wet: WET.block, key: `blk:${e.d}`, gap: 0.04, priority: 2 });
        break;
      case 'guardBreak':
        this.emit((out) => R.guardBreak(out, A, D, { anim }), { ...at, level: LEVEL.guardBreak, wet: WET.big, priority: 2 });
        break;
      case 'hit':
      case 'armor':
        this.emit((out) => R.hit(out, A, D, { heavy, anim, armor: e.k === 'armor', tipper: tags.includes('tipper'), backstab: tags.includes('backstab') }), {
          ...at,
          level: LEVEL.hit,
          wet: WET.hit,
          key: `hit:${e.d}`,
          gap: 0.035,
          priority: 2,
        });
        break;
      case 'deathblow': {
        // the strike that caught them broken, then the execution's wind-up under everything
        this.emit((out) => R.hit(out, A, D, { heavy: true, anim }), { ...at, level: LEVEL.hit * 0.8, wet: WET.hit, priority: 2 });
        const close = o.mine || o.vol > 0.6;
        if (close && this.mix) {
          this.execs.get(e.d)?.stop(0.05);
          const v = this.emit((out) => R.execWindup(out, A, o.mine), { ...at, level: LEVEL.windup * (o.mine ? 1 : 0.6), hero: true, wet: 0.2, priority: 2 });
          if (v) this.execs.set(e.d, v);
          if (o.mine) this.mix.duck(0.55, 0.4, 1.6, 0.4);
        }
        break;
      }
      case 'execute': {
        this.execs.get(e.d)?.stop(0.03);
        this.execs.delete(e.d);
        this.emit((out) => R.execFinish(out, A, D), { ...at, level: LEVEL.finish, hero: true, wet: WET.finish, priority: 3 });
        if (o.mine || o.vol > 0.6) this.mix?.duck(0.3, 0.01, 0.7, 1.2);
        break;
      }
      case 'mikiri':
        this.emit((out) => R.mikiri(out, A, D), { ...at, level: LEVEL.block, wet: WET.big, priority: 2 });
        break;
      case 'counter':
        this.emit((out) => R.counter(out, A, D, { anim }), { ...at, level: LEVEL.deflect, wet: WET.deflect, priority: 2 });
        break;
      case 'evade':
        // the blink: the recorded dash, over one of its two magic whooshes
        if (tags.includes('blink')) this.emit((out) => void (R.playLayers(out, ['blink_dash', 'blink_magic']) || legacy(out, 'blink')), { ...at, level: LEVEL.dodge, wet: 0.3 });
        break;
      case 'feint':
        this.emit((out) => R.feint(out, D), { ...at, vol: o.vol * 0.8, level: LEVEL.swing, wet: WET.swing });
        break;
      case 'lava':
        // the recorded burn, from near its flare (it swells for a second first)
        if (o.mine && e.d) this.emit((out) => void (R.playLayers(out, ['lava_burn'], 1, undefined, 0.8) || legacy(out, 'burn')), { ...at, level: LEVEL.legacy, key: 'burn', gap: 0.15 });
        break;
      case 'fall':
        this.emit((out) => R.fall(out), { ...at, level: LEVEL.cue, wet: 0.4 });
        break;
    }
    if (tags.includes('broken')) {
      if (e.k !== 'guardBreak') this.emit((out) => R.guardBreak(out, A, D, { anim }), { ...at, level: LEVEL.guardBreak * 0.85, wet: WET.big, priority: 2 });
      if (o.mine) {
        this.emit((out) => R.postureBreak(out, D), { ...at, level: LEVEL.posture, wet: WET.big, priority: 2, delay: 0.01 });
        this.mix?.duck(0.65, 0.01, 0.25, 0.4);
      }
    }
    // the attacker's own posture broke on the defender's guard
    if (tags.includes('abroken')) this.emit((out) => R.guardBreak(out, D, A, {}), { ...at, level: LEVEL.guardBreak * 0.85, wet: WET.big, priority: 2 });
    if (tags.includes('kill')) this.emit((out) => R.death(out, D), { ...at, level: LEVEL.death, wet: WET.hit, priority: 2 });
  }

  /**
   * Per frame: footsteps at a stride's cadence (like the walk cycle's) from how fast the fighter
   * moves, a landing when they come down from a jump, and whooshes off the weapon tip during an
   * execution's choreography (those moves have no attack state to cue a swing).
   */
  motion(fighterId: string, char: CharacterId, m: Placed & { speed: number; airborne: boolean; state: string; tip?: V3 | null; footfall?: 'L' | 'R' | null }): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    let w = this.walkers.get(fighterId);
    if (!w) this.walkers.set(fighterId, (w = { phase: 0.5, last: now, air: m.airborne, tip: null, lastWhoosh: 0 }));
    const dt = Math.min(0.1, Math.max(0, now - w.last));
    w.last = now;
    const p = profile(char);
    const grounded = !m.airborne;
    if (w.air && grounded && m.state !== 'dead' && m.vol > 0.45) {
      // landing
      this.emit((o) => R.footstep(o, p, { speed: 7, floor: this.floor }), { level: LEVEL.step * 1.3, vol: m.vol, pos: m.pos, wet: WET.step, key: `st:${fighterId}`, gap: 0.1, priority: 0 });
      w.phase = 0;
    }
    w.air = m.airborne;
    // footsteps only near the listener (a lobby full of walkers would be a drumline)
    const walking = m.vol > 0.45 && grounded && m.speed > 0.6 && (m.state === 'idle' || m.state === 'block' || m.state === 'attack' || m.state === 'stance');
    if (walking && m.footfall !== undefined) {
      // the animated feet say when one lands
      if (m.footfall) this.emit((o) => R.footstep(o, p, { speed: m.speed, floor: this.floor }), { level: LEVEL.step, vol: m.vol, pos: m.pos, wet: WET.step, key: `st:${fighterId}`, gap: 0.12, priority: 0 });
    } else if (walking) {
      // two footfalls per stride cycle; heavier bodies step a little slower
      const cadence = Math.min(1.7, 0.62 + 0.2 * m.speed) * (p.weight > 1.3 ? 0.85 : 1);
      w.phase += 2 * cadence * dt;
      if (w.phase >= 1) {
        w.phase -= 1;
        this.emit((o) => R.footstep(o, p, { speed: m.speed, floor: this.floor }), { level: LEVEL.step, vol: m.vol, pos: m.pos, wet: WET.step, key: `st:${fighterId}`, gap: 0.12, priority: 0 });
      }
    } else w.phase = Math.max(w.phase, 0.6);
    if (m.state === 'execute' && m.tip) {
      if (w.tip && dt > 0) {
        const sp = Math.hypot(m.tip.x - w.tip.x, m.tip.y - w.tip.y, m.tip.z - w.tip.z) / dt;
        if (sp > 9 && now - w.lastWhoosh > 0.22) {
          w.lastWhoosh = now;
          this.emit((o) => R.swing(o, p, { heavy: sp > 16 }), { level: LEVEL.swing, vol: m.vol, pos: m.pos, wet: WET.swing, hero: true });
        }
      }
      w.tip = { x: m.tip.x, y: m.tip.y, z: m.tip.z };
    } else w.tip = null;
  }

  /** Forget a fighter that left. */
  forget(fighterId: string): void {
    this.walkers.delete(fighterId);
    this.swings.delete(fighterId);
  }

  dodge(char: CharacterId, kind: 'roll' | 'vanish' | 'leap', o: Placed): void {
    const p = profile(char);
    this.emit((out) => R.dodge(out, p, kind), { level: LEVEL.dodge, vol: o.vol, pos: o.pos, wet: WET.swing });
  }

  jump(char: CharacterId, o: Placed): void {
    this.emit((out) => R.jump(out, profile(char)), { level: LEVEL.dodge, vol: o.vol, pos: o.pos, wet: WET.step });
  }

  perilous(char: CharacterId, o: Placed): void {
    this.emit((out) => R.perilous(out, profile(char)), { level: LEVEL.legacy, vol: o.vol, pos: o.pos, wet: 0.3, priority: 2 });
  }

  buff(o: Placed): void {
    this.emit((out) => R.buff(out), { level: LEVEL.legacy, vol: o.vol, pos: o.pos, wet: 0.3 });
  }

  /** A move's choreographed effect (a hammer's ground slam, a spear's lightning, a thrown chain...). */
  cue(kind: string, char: CharacterId, scale: number, o: Placed & { hero?: boolean }): void {
    if (!R.CUES.has(kind)) return;
    const p: Profile = profile(char);
    this.emit((out) => void R.cue(out, p, kind, scale), { level: LEVEL.cue, vol: o.vol, pos: o.pos, wet: WET.big, hero: o.hero, key: `cue:${kind}:${char}`, gap: 0.08 });
  }
}

export const audio = new AudioEngine();
export type { Sfx };
