/**
 * Recorded samples: the sounds a recipe plays from a file rather than synthesising. They live in a
 * chunk of their own, fetched as soon as the game loads without holding it up, and decode
 * asynchronously the first time an audio context asks for them; until they are ready (or if the
 * chunk never arrives) a recipe falls back to its synthesised version.
 */
import { Out, bump, pick } from './synth';

/** e.g. 'deflect', 'block', 'ronin_swing', 'ronin_hit' (see samples/data.ts) */
export type SampleName = string;

const SAMPLES = import('./samples/data').then(
  (m) => m.SAMPLES,
  (): Record<SampleName, readonly string[]> => ({}),
);

const decoded = new WeakMap<BaseAudioContext, Record<SampleName, AudioBuffer[]>>();
const pending = new WeakMap<BaseAudioContext, Promise<void>>();

function bytes(b64: string): ArrayBuffer {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

/** Decode every sample for this context (once; later calls share the same promise). */
export function loadSamples(ctx: BaseAudioContext): Promise<void> {
  let p = pending.get(ctx);
  if (!p) {
    const table: Record<SampleName, AudioBuffer[]> = {};
    decoded.set(ctx, table);
    p = SAMPLES.then((samples) =>
      Promise.all(
        Object.keys(samples).map(async (name) => {
          const bufs = await Promise.all(samples[name].map((b) => ctx.decodeAudioData(bytes(b)).catch(() => null)));
          table[name] = bufs.filter((b): b is AudioBuffer => !!b);
        }),
      ),
    ).then(() => undefined);
    pending.set(ctx, p);
  }
  return p;
}

/** One take of the named sample (`take`, or one at random), if there is one and it has decoded for this context. */
export function sampleFor(ctx: BaseAudioContext, name: SampleName, take?: number): AudioBuffer | null {
  const table = decoded.get(ctx);
  if (!table) void loadSamples(ctx);
  const list = table?.[name];
  if (!list || !list.length) return null;
  return take === undefined ? pick(list) : list[Math.min(take, list.length - 1)];
}

/**
 * Play a decoded sample into `o`: at a gain, sped up or slowed by `rate` (which shifts its pitch
 * too), starting `offset` seconds into it.
 */
export function playSample(o: Out, buf: AudioBuffer, gain: number, rate = 1, delay = 0, offset = 0): void {
  const src = o.ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = o.ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(o.dest);
  const t = o.t + delay;
  src.start(t, offset);
  bump(o, t + (buf.duration - offset) / rate + 0.02);
}
