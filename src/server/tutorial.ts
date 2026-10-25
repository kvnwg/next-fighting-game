/**
 * The tutorial: a lesson on Sakura from the Last Teacher (the Monk), who teaches by doing. He
 * stands in guard while you strike into it and you watch his posture fill. He hammers your guard
 * until yours breaks, and executes you for it. He swings slowly enough to read so you can deflect
 * him, and each deflect fills his posture until it breaks. He waits, broken, for your deathblow.
 * Last, he throws his perilous grab for you to dodge. The client draws each lesson over the fight
 * (client/tutorial.ts); nothing here waits on anyone reading.
 */
import { COMBAT } from '../shared/config';
import { dist2D, yawTo } from '../shared/math';
import type { CombatEvent, TutorialNote, TutorialStep } from '../shared/protocol';
import type { Brain } from './bot';
import type { Player, ServerFighter } from './entities';
import type { Instance } from './instance';

/** how many of each lesson's move it takes to pass it */
export const TUTORIAL_NEED: Record<TutorialStep, number> = { strike: 4, block: 3, deflect: 3, execute: 1, perilous: 1, done: 0 };

/** how slowly the sensei winds up in each lesson (1 = a normal fight) */
const SLOW: Partial<Record<TutorialStep, number>> = { block: 1.5, deflect: 2.1, perilous: 1.6 };
/** time between his blows, after the last one ends (ms) */
const PAUSE: Partial<Record<TutorialStep, number>> = { block: 900, deflect: 1300, perilous: 1600 };

export class TutorialCoach implements Brain {
  step: TutorialStep = 'strike';
  n = 0;
  /** the block lesson's second beat: your guard broken, then executed for it */
  private beat: 'learn' | 'breaking' | 'executing' = 'learn';
  private nextSwingAt = 0;
  /** the perilous attack being watched (its serial), and whether it caught you */
  private watching: { serial: number; caught: boolean } | null = null;
  /** an execution under way, and the lesson after it */
  private afterExecution: TutorialStep | null = null;

  constructor(
    readonly sensei: ServerFighter,
    readonly student: ServerFighter,
    readonly player: Player,
    private readonly finished: (now: number) => void,
  ) {}

  start(now: number): void {
    this.nextSwingAt = now + 1500;
    this.send();
  }

  private send(note?: TutorialNote): void {
    this.player.send({ t: 'tutorial', step: this.step, n: this.n, need: TUTORIAL_NEED[this.step], ...(note ? { note } : {}) });
  }

  private advance(next: TutorialStep, now: number): void {
    this.step = next;
    this.n = 0;
    this.beat = 'learn';
    this.watching = null;
    this.nextSwingAt = now + 1800;
    this.sensei.windupScale = SLOW[next] ?? 1;
    // a fresh start for each lesson: whole guards, whole health
    for (const f of [this.sensei, this.student]) {
      f.posture = 0;
      f.hp = f.maxHp;
    }
    this.send();
    if (next === 'done') this.finished(now);
  }

  /** Break a fighter's guard outright (the lesson needs it now, whatever the numbers say). */
  private breakGuard(f: ServerFighter, now: number): void {
    f.posture = f.maxPosture;
    f.lastPostureDamageAt = now;
    f.force('broken', now, COMBAT.brokenTime);
  }

  // ------------------------------------------------------------------ the sensei, each tick

  think(now: number, inst: Instance): void {
    const s = this.sensei;
    const t = this.student;
    s.moveX = 0;
    s.moveZ = 0;
    if (!s.isAlive() || !t.isAlive()) return;
    s.wantYaw = yawTo(s.x, s.z, t.x, t.z);
    const d = dist2D(s.x, s.z, t.x, t.z);
    // nobody dies in a lesson
    if (t.state !== 'executed' && t.hp < t.maxHp * 0.4) t.hp = t.maxHp;
    if (s.state !== 'executed' && s.hp < s.maxHp * 0.4) s.hp = s.maxHp;

    // an execution plays out, then the next lesson starts
    if (this.afterExecution) {
      if (s.state !== 'execute' && s.state !== 'executed' && t.state !== 'execute' && t.state !== 'executed') {
        const next = this.afterExecution;
        this.afterExecution = null;
        this.advance(next, now);
      }
      return;
    }

    switch (this.step) {
      case 'strike':
        // he stands in guard and takes it; if you wander off he comes to you
        if (d > 4) this.walkTo(t, d, 2.2);
        if (!s.blockHeld && (s.state === 'idle' || s.state === 'blockstun')) inst.applyInput(s, 'blockDown', now);
        break;
      case 'block':
        if (this.beat === 'executing') {
          // your guard is broken (and stays broken until he gets there): he comes in for the deathblow
          if (s.blockHeld) inst.applyInput(s, 'blockUp', now);
          if (t.state !== 'broken' && t.state !== 'execute' && t.state !== 'executed') this.breakGuard(t, now);
          if (t.state === 'broken') {
            if (d > 2) this.walkTo(t, d, 1.4);
            else if (s.state === 'idle') inst.applyInput(s, 'light', now);
          }
          break;
        }
        this.swing(inst, 'heavy', d, now);
        break;
      case 'deflect':
        this.swing(inst, 'heavy', d, now);
        break;
      case 'execute':
        // broken, waiting for your deathblow; if the moment passes his guard breaks again
        if (s.blockHeld) inst.applyInput(s, 'blockUp', now);
        if (s.state === 'idle' || s.state === 'block') this.breakGuard(s, now);
        break;
      case 'perilous':
        if (this.watching && (s.state !== 'attack' || s.attackSerial !== this.watching.serial)) {
          // his grab is over: dodged (or simply not there to be caught), or caught
          const caught = this.watching.caught;
          this.watching = null;
          if (caught) this.send('late');
          else {
            this.n = 1;
            this.send('good');
            this.advance('done', now);
            return;
          }
        }
        if (!this.watching) {
          s.specialReadyAt = 0;
          if (this.swing(inst, 'special', d, now)) this.watching = { serial: s.attackSerial, caught: false };
        }
        break;
      case 'done':
        if (s.blockHeld) inst.applyInput(s, 'blockUp', now);
        break;
    }
  }

  private walkTo(t: ServerFighter, d: number, stopAt: number): void {
    if (d <= stopAt) return;
    this.sensei.moveX = (t.x - this.sensei.x) / d;
    this.sensei.moveZ = (t.z - this.sensei.z) / d;
  }

  /** Close in and swing once he's ready; true if the swing started. */
  private swing(inst: Instance, action: 'heavy' | 'special', d: number, now: number): boolean {
    const s = this.sensei;
    if (s.blockHeld) inst.applyInput(s, 'blockUp', now);
    if (d > 2.6) {
      this.walkTo(this.student, d, 2.0);
      return false;
    }
    if (s.state !== 'idle' || now < this.nextSwingAt) return false;
    // not into a guard that's broken or a body that's down
    if (this.student.state === 'broken' || this.student.state === 'executed' || this.student.state === 'knockdown') return false;
    const ok = inst.applyInput(s, action, now);
    if (ok) this.nextSwingAt = now + (s.atkWindup + (s.attack?.active ?? 0) + (s.attack?.recovery ?? 0)) + (PAUSE[this.step] ?? 1000);
    return ok;
  }

  // ------------------------------------------------------------------ what happened this tick

  observe(events: readonly CombatEvent[], now: number): void {
    const s = this.sensei;
    const t = this.student;
    for (const e of events) {
      const byStudent = e.a === t.id && e.d === s.id;
      const bySensei = e.a === s.id && e.d === t.id;
      switch (this.step) {
        case 'strike':
          if (byStudent && (e.k === 'block' || e.k === 'hit' || e.k === 'deflect')) {
            // his posture climbs with every blow he takes on the guard (kept short of breaking)
            s.posture = Math.min(s.maxPosture * 0.9, s.posture + s.maxPosture * 0.2);
            s.lastPostureDamageAt = now;
            this.n++;
            if (this.n >= TUTORIAL_NEED.strike) this.advance('block', now);
            else this.send('good');
          }
          break;
        case 'block':
          if (!bySensei) break;
          if (this.beat === 'learn') {
            if (e.k === 'guardBreak') {
              this.n = TUTORIAL_NEED.block;
              this.beat = 'executing';
              this.send('broken');
            } else if (e.k === 'block' || e.k === 'deflect') {
              this.n++;
              this.send('good');
              // your posture has filled with each block: the next one breaks it
              if (this.n >= TUTORIAL_NEED.block) {
                this.beat = 'breaking';
                t.posture = Math.max(t.posture, t.maxPosture * 0.92);
                t.lastPostureDamageAt = now;
              }
            } else if (e.k === 'hit') this.send('again');
          } else if (this.beat === 'breaking') {
            if (t.state !== 'broken') this.breakGuard(t, now);
            this.beat = 'executing';
            this.send('broken');
          }
          break;
        case 'deflect':
          if (!bySensei) break;
          if (e.k === 'deflect') {
            this.n++;
            this.send('good');
            if (this.n >= TUTORIAL_NEED.deflect) {
              if (s.state !== 'broken') this.breakGuard(s, now);
              this.advance('execute', now);
              // advance() made his guard whole again: this lesson starts with it broken
              this.breakGuard(s, now);
            } else {
              // each deflect fills his posture a good way: the last one breaks it
              s.posture = Math.min(s.maxPosture * 0.95, Math.max(s.posture, (s.maxPosture * this.n) / TUTORIAL_NEED.deflect));
              s.lastPostureDamageAt = now;
            }
          } else if (e.k === 'block') this.send('early');
          else if (e.k === 'hit' || e.k === 'guardBreak') this.send('late');
          break;
        case 'execute':
          if (byStudent && e.k === 'deathblow') {
            this.n = 1;
            this.send('good');
            this.afterExecution = 'perilous';
          }
          break;
        case 'perilous':
          if (bySensei && this.watching && (e.k === 'hit' || e.k === 'armor' || e.k === 'block' || e.k === 'guardBreak')) this.watching.caught = true;
          break;
        default:
          break;
      }
      // the block lesson ends once its execution has played out
      if (this.step === 'block' && this.beat === 'executing' && e.k === 'deathblow' && bySensei) this.afterExecution = 'deflect';
    }
  }
}
