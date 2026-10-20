/**
 * The player you control: reads input, predicts combat with the shared state machine, moves with
 * the shared physics, streams position to the server and adopts server-imposed states.
 */
import { CLIENT_SEND_HZ, SPRINT_MULT } from '../shared/config';
import { FORCED_STATES, Fighter, FighterState, InputAction } from '../shared/fighter';
import { MapDef } from '../shared/maps';
import { forward, turnToward, yawTo } from '../shared/math';
import { stepBody } from '../shared/physics';
import { FighterSnap } from '../shared/protocol';
import { ClientFighter } from './entities';
import { Bind } from './input';
import { Net } from './net';

export interface MoveContext {
  axes: { x: number; y: number };
  camYaw: number;
  sprint: boolean;
  others: ClientFighter[];
  lock: ClientFighter | null;
}

const BIND_ACTION: Partial<Record<Bind, InputAction>> = {
  light: 'light',
  heavy: 'heavy',
  dodge: 'dodge',
  jump: 'jump',
  special: 'special',
  ability: 'ability',
};

/** What an accepted local prediction changed, so a server rejection can undo exactly that. */
interface Prediction {
  at: number;
  serial: number;
  state: FighterState;
  stateStart: number;
  specialReadyAt: number;
  abilityReadyAt: number;
  dodgeReady: number[];
}

export class LocalController {
  epoch = 0;
  private seq = 0;
  private predictions = new Map<number, Prediction>();
  /** cooldown snapshot taken when a press was buffered, keyed by its sequence number */
  private bufferedPrev = new Map<number, Pick<Prediction, 'specialReadyAt' | 'abilityReadyAt' | 'dodgeReady'>>();
  frozen = false;
  private lastSend = 0;
  private push = { x: 0, z: 0, until: 0 };
  private lastForcedStart = -Infinity;
  private lastCounterSerial = -1;
  private fellSent = false;
  /** world-space direction of the current movement input */
  private moveDir = { x: 0, z: 0 };
  onAction: ((a: InputAction, ok: boolean) => void) | null = null;

  constructor(
    readonly cf: ClientFighter,
    readonly net: Net,
    public map: MapDef,
  ) {}

  get sim(): Fighter {
    return this.cf.sim!;
  }

  private desiredYaw(ctx: { camYaw: number; lock: ClientFighter | null }): number {
    if (ctx.lock) return yawTo(this.sim.x, this.sim.z, ctx.lock.pos.x, ctx.lock.pos.z);
    return ctx.camYaw;
  }

  /** A combat bind was pressed or released (called straight from the DOM event). */
  handleBind(bind: Bind, pressed: boolean, perfTime: number, ctx: { camYaw: number; lock: ClientFighter | null }): void {
    const sim = this.sim;
    if (!sim.isAlive()) return;
    const now = this.net.serverNow();
    const vt = Math.min(now, this.net.toServer(perfTime));
    let action: InputAction | undefined;
    if (bind === 'block') action = pressed ? 'blockDown' : 'blockUp';
    else if (pressed) action = BIND_ACTION[bind];
    if (!action) return;
    if (this.frozen) {
      if (action === 'blockDown') sim.blockHeld = true;
      else if (action === 'blockUp') sim.blockHeld = false;
      else return;
    }

    let dx = 0;
    let dz = 0;
    if (action === 'dodge') {
      dx = this.moveDir.x;
      dz = this.moveDir.z;
    }
    // attacks and guard face where you're aiming
    const aims = action === 'light' || action === 'heavy' || action === 'special' || action === 'ability' || action === 'blockDown';
    const canTurn = sim.state === 'idle' || sim.state === 'block' || sim.state === 'stance' || (sim.state === 'attack' && sim.attackPhase(now) === 'recovery');
    if (aims && canTurn) sim.yaw = this.desiredYaw(ctx);

    const q = ++this.seq;
    const prev = { specialReadyAt: sim.specialReadyAt, abilityReadyAt: sim.abilityReadyAt, dodgeReady: [...sim.dodgeReady] };
    let ok = false;
    if (action === 'ability' && sim.char.ability.kind === 'teleport') {
      ok = true; // the server decides and teleports us; nothing to predict
    } else {
      const serial = sim.attackSerial;
      const start = sim.stateStart;
      ok = sim.input(action, now, { pressTime: vt, dx, dz, tag: q });
      if (ok && (sim.attackSerial !== serial || sim.stateStart !== start)) this.remember(q, prev);
      else if (!ok && sim.buffered?.opts.tag === q) this.bufferedPrev.set(q, prev);
    }
    sim.drainEvents();
    if (action === 'jump' && !ok) return;
    this.net.send({ t: 'act', a: action, vt: Math.round(vt), dx: dx || undefined, dz: dz || undefined, r: Math.round(sim.yaw * 1000) / 1000, q });
    this.onAction?.(action, ok);
  }

  private remember(q: number, prev: Pick<Prediction, 'specialReadyAt' | 'abilityReadyAt' | 'dodgeReady'>): void {
    const sim = this.sim;
    this.predictions.set(q, { at: this.net.serverNow(), serial: sim.attackSerial, state: sim.state, stateStart: sim.stateStart, ...prev });
    if (this.predictions.size > 32) {
      const cutoff = this.net.serverNow() - 3000;
      for (const [k, p] of this.predictions) if (p.at < cutoff) this.predictions.delete(k);
    }
  }

  update(dt: number, now: number, ctx: MoveContext): void {
    const sim = this.sim;
    const bufTag = sim.buffered?.opts.tag;
    const serial = sim.attackSerial;
    const start = sim.stateStart;
    sim.update(now);
    if (bufTag !== undefined && !sim.buffered && (sim.attackSerial !== serial || sim.stateStart !== start)) {
      // a buffered press just went through locally: remember it in case the server disagrees
      const prev = this.bufferedPrev.get(bufTag);
      if (prev) this.remember(bufTag, prev);
    }
    if (bufTag !== undefined && !sim.buffered) this.bufferedPrev.delete(bufTag);
    sim.drainEvents();

    const f = forward(ctx.camYaw);
    const rx = -Math.cos(ctx.camYaw);
    const rz = Math.sin(ctx.camYaw);
    let mx = f.x * ctx.axes.y + rx * ctx.axes.x;
    let mz = f.z * ctx.axes.y + rz * ctx.axes.x;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    this.moveDir = { x: mx, z: mz };
    if (this.frozen) {
      mx = 0;
      mz = 0;
    }

    let speed = sim.char.stats.speed * sim.moveSpeedMult(now);
    if (ctx.sprint && sim.state === 'idle' && !ctx.lock && len > 0.1) speed *= SPRINT_MULT;
    let vx = mx * speed;
    let vz = mz * speed;

    // facing
    let want: number | null = null;
    if (sim.isAlive() && sim.state !== 'knockdown' && sim.state !== 'broken') {
      if (ctx.lock) want = yawTo(sim.x, sim.z, ctx.lock.pos.x, ctx.lock.pos.z);
      else if (sim.state === 'idle' && len > 0.1) want = Math.atan2(mx, mz);
      else if (sim.state === 'attack' || sim.state === 'block' || sim.state === 'stance') want = ctx.camYaw;
    }
    if (want !== null && !this.frozen) sim.yaw = turnToward(sim.yaw, want, sim.turnRate(now) * dt);

    const lunge = sim.lungeSpeed(now);
    if (lunge > 0) {
      const fw = forward(sim.yaw);
      const blocked = ctx.others.some((o) => {
        const ox = o.pos.x - sim.x;
        const oz = o.pos.z - sim.z;
        return Math.hypot(ox, oz) < 1.15 && ox * fw.x + oz * fw.z > 0;
      });
      if (!blocked) {
        vx += fw.x * lunge;
        vz += fw.z * lunge;
      }
    }
    const dv = sim.dodgeVelocity(now);
    vx += dv.x;
    vz += dv.z;
    if (now < this.push.until) {
      vx += this.push.x;
      vz += this.push.z;
    }

    const obstacles = ctx.others.filter((o) => o.s !== 'dead').map((o) => ({ x: o.pos.x, z: o.pos.z }));
    const res = stepBody(sim, vx, vz, dt, this.map, sim.state === 'dodge' ? [] : obstacles);
    if (res.fell && !this.fellSent) {
      this.fellSent = true;
      this.net.send({ t: 'fell' });
    }
    this.cf.pos.set(sim.x, sim.y, sim.z);
    this.cf.yaw = sim.yaw;

    if (now - this.lastSend >= 1000 / CLIENT_SEND_HZ) {
      this.lastSend = now;
      this.net.send({
        t: 'move',
        x: Math.round(sim.x * 100) / 100,
        y: Math.round(sim.y * 100) / 100,
        z: Math.round(sim.z * 100) / 100,
        r: Math.round(sim.yaw * 1000) / 1000,
        g: sim.onGround ? 1 : 0,
        e: this.epoch,
      });
    }
  }

  /** Reconcile with the server's view of us. */
  onServerState(f: FighterSnap): void {
    const sim = this.sim;
    sim.hp = f.hp;
    sim.posture = f.po;
    if (FORCED_STATES.has(f.s)) {
      if (f.ss > this.lastForcedStart) {
        this.lastForcedStart = f.ss;
        sim.force(f.s, f.ss, f.sd);
        sim.drainEvents();
      }
      return;
    }
    if (f.s === 'attack' && f.a === 'ct' && f.n !== this.lastCounterSerial) {
      this.lastCounterSerial = f.n;
      sim.startAttack('ct', f.ss);
      sim.drainEvents();
      return;
    }
    // we were stuck in a server-imposed state and the server says it's over
    if (FORCED_STATES.has(sim.state) && f.ss >= sim.stateStart - 5) {
      sim.setState(f.s === 'block' ? 'block' : 'idle', f.ss);
      sim.drainEvents();
    }
  }

  onTeleport(x: number, z: number, yaw: number | undefined, epoch: number, reason: string | undefined): void {
    const sim = this.sim;
    sim.x = x;
    sim.z = z;
    sim.y = 0;
    sim.vy = 0;
    if (yaw !== undefined) sim.yaw = yaw;
    this.epoch = epoch;
    this.fellSent = false;
    this.push.until = 0;
    this.cf.teleportTo(x, 0, z, yaw);
    const now = this.net.serverNow();
    if (reason === 'shadowstep') {
      sim.setState('dodge', now, 300);
      sim.dodgeDist = 0;
      sim.dodgeDur = 300;
      if (sim.char.ability.kind === 'teleport') sim.abilityReadyAt = now + sim.char.ability.cooldown;
      sim.drainEvents();
    } else if (reason === 'respawn') {
      sim.resetVitals();
      sim.stateStart = now;
      this.lastForcedStart = now;
    }
  }

  onPush(dx: number, dz: number): void {
    const dur = 150;
    this.push = { x: dx / (dur / 1000), z: dz / (dur / 1000), until: this.net.serverNow() + dur };
  }

  /** The server never applied press `q`: undo only what that press predicted, if it's still showing. */
  onReject(_a: InputAction, q: number | undefined): void {
    if (q === undefined) return;
    const p = this.predictions.get(q);
    if (!p) return;
    this.predictions.delete(q);
    const sim = this.sim;
    sim.specialReadyAt = p.specialReadyAt;
    sim.abilityReadyAt = p.abilityReadyAt;
    sim.dodgeReady = p.dodgeReady;
    if (sim.attackSerial === p.serial && sim.stateStart === p.stateStart && sim.state === p.state && !FORCED_STATES.has(sim.state)) {
      sim.setState(sim.blockHeld ? 'block' : 'idle', this.net.serverNow());
      sim.drainEvents();
    }
  }

  /** Mirror of the server's riposte buff (Duelist): after we deflect, our next windup is faster. */
  onDeflected(): void {
    const sim = this.sim;
    if (sim.mods.riposteWindupMult) sim.riposteUntil = this.net.serverNow() + 1200;
  }
}
