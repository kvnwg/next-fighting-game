/**
 * Recorded samples: the sounds a recipe plays from a file rather than synthesising. They decode
 * asynchronously the first time an audio context asks for them; until they are ready a recipe
 * falls back to its synthesised version.
 */
import { DEFLECT } from './samples/data';
import { Out, bump, pick } from './synth';

const RAW = { deflect: DEFLECT } as const;
export type SampleName = keyof typeof RAW;

const decoded = new WeakMap<BaseAudioContext, Partial<Record<SampleName, AudioBuffer[]>>>();
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
    const table: Partial<Record<SampleName, AudioBuffer[]>> = {};
    decoded.set(ctx, table);
    p = Promise.all(
      (Object.keys(RAW) as SampleName[]).map(async (name) => {
        const bufs = await Promise.all(RAW[name].map((b) => ctx.decodeAudioData(bytes(b)).catch(() => null)));
        table[name] = bufs.filter((b): b is AudioBuffer => !!b);
      }),
    ).then(() => undefined);
    pending.set(ctx, p);
  }
  return p;
}

/** One take of the named sample, if it has decoded for this context. */
export function sampleFor(ctx: BaseAudioContext, name: SampleName): AudioBuffer | null {
  const list = decoded.get(ctx)?.[name];
  if (!list) void loadSamples(ctx);
  return list && list.length ? pick(list) : null;
}

/** Play a decoded sample into `o`: at a gain, sped up or slowed by `rate` (which shifts its pitch too). */
export function playSample(o: Out, buf: AudioBuffer, gain: number, rate = 1, delay = 0): void {
  const src = o.ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = o.ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(o.dest);
  const t = o.t + delay;
  src.start(t);
  bump(o, t + buf.duration / rate + 0.02);
}
