/**
 * The first fight: the Last Teacher (the Monk) on Sakura, who teaches by fighting. He stands open
 * while you strike him. Then he swings slowly enough to read, and each deflect fills his posture
 * until his guard breaks. He waits, broken, for your deathblow. Then he fights you for real, one
 * round, his wounds still on him and holding back (see Arena.tutorialDuel); you can't lose it. The
 * match ends like any other, and beating him gets you a fighter of your choice. Blocking and
 * perilous attacks are left for the first time they come up in a fight (client/tutorial.ts). The
 * client draws each step over the fight; nothing here waits on anyone reading.
 */
import { COMBAT } from '../shared/config';
import { dist2D, yawTo } from '../shared/math';
import type { CombatEvent, TutorialNote, TutorialStep } from '../shared/protocol';
import { BOT_PROFILES, type Brain, type BotProfile } from './bot';
import type { Player, ServerFighter } from './entities';
import type { Instance } from './instance';

/** how many of each step's move it takes to pass it */
export const TUTORIAL_NEED: Record<TutorialStep, number> = { strike: 3, deflect: 2, execute: 1, duel: 1 };

/** how slowly the sensei winds up in each step (1 = a normal fight) */
const SLOW: Partial<Record<TutorialStep, number>> = { deflect: 2.1, duel: 1.3 };
/** time between his blows, after the last one ends (ms) */
const PAUSE: Partial<Record<TutorialStep, number>> = { deflect: 1300 };

/** How the sensei fights once the lessons are over: an easy opponent, holding back further. */
export const SENSEI_DUEL: BotProfile = { ...BOT_PROFILES.easy, aggression: 0.35, parryChance: 0.1, comboChance: 0.25, punishChance: 0.15, perilousRead: 0.2 };

export class TutorialCoach implements Brain {
  step: TutorialStep = 'strike';
  n = 0;
  private nextSwingAt = 0;
  /** an execution under way, and the step after it */
  private afterExecution: TutorialStep | null = null;

  constructor(
    readonly sensei: ServerFighter,
    readonly student: ServerFighter,
    readonly player: Player,
    private readonly finished: (now: number) => void,
    /** each step as it starts (the furthest a player got is kept on their profile) */
    private readonly reached: (step: TutorialStep) => void = () => undefined,
  ) {}

  start(now: number): void {
    this.nextSwingAt = now + 1500;
    this.reached(this.step);
    this.send();
  }

  private send(note?: TutorialNote): void {
    this.player.send({ t: 'tutorial', step: this.step, n: this.n, need: TUTORIAL_NEED[this.step], ...(note ? { note } : {}) });
  }

  private advance(next: TutorialStep, now: number): void {
    this.step = next;
    this.n = 0;
    this.nextSwingAt = now + 1500;
    this.sensei.windupScale = SLOW[next] ?? 1;
    // whole guards for each step; his wounds stay on him (they're what the duel is won with)
    for (const f of [this.sensei, this.student]) f.posture = 0;
    this.reached(next);
    this.send();
    if (next === 'duel') {
      // and you go into it whole
      this.student.hp = this.student.maxHp;
      this.finished(now);
    }
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
    // nobody goes down while learning: you're made whole, and he keeps enough to fight on with
    if (t.state !== 'executed' && t.hp < t.maxHp * 0.4) t.hp = t.maxHp;
    if (s.state !== 'executed' && s.hp < s.maxHp * 0.45) s.hp = s.maxHp * 0.45;

    // the deathblow plays out, then the duel starts
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
        // he stands open and takes it; if you wander off he comes to you
        if (s.blockHeld) inst.applyInput(s, 'blockUp', now);
        if (d > 4) this.walkTo(t, d, 2.2);
        break;
      case 'deflect':
        this.swing(inst, d, now);
        break;
      case 'execute':
        // broken, waiting for your deathblow; if the moment passes his guard breaks again
        if (s.blockHeld) inst.applyInput(s, 'blockUp', now);
        if (s.state === 'idle' || s.state === 'block') this.breakGuard(s, now);
        if (d > 4) this.walkTo(t, d, 2.2);
        break;
      case 'duel':
        break;
    }
  }

  private walkTo(t: ServerFighter, d: number, stopAt: number): void {
    if (d <= stopAt) return;
    this.sensei.moveX = (t.x - this.sensei.x) / d;
    this.sensei.moveZ = (t.z - this.sensei.z) / d;
  }

  /** Close in and swing a slow heavy once he's ready; true if the swing started. */
  private swing(inst: Instance, d: number, now: number): boolean {
    const s = this.sensei;
    if (s.blockHeld) inst.applyInput(s, 'blockUp', now);
    if (d > 2.6) {
      this.walkTo(this.student, d, 2.0);
      return false;
    }
    if (s.state !== 'idle' || now < this.nextSwingAt) return false;
    // not into a guard that's broken or a body that's down
    if (this.student.state === 'broken' || this.student.state === 'executed' || this.student.state === 'knockdown') return false;
    const ok = inst.applyInput(s, 'heavy', now);
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
          if (byStudent && (e.k === 'hit' || e.k === 'block' || e.k === 'deflect' || e.k === 'armor')) {
            this.n++;
            if (this.n >= TUTORIAL_NEED.strike) this.advance('deflect', now);
            else this.send('good');
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
              // advance() made his guard whole again: this step starts with it broken
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
            this.afterExecution = 'duel';
          }
          break;
        default:
          break;
      }
    }
  }
}
