import type { Platform } from './crazygames.ts';

export type DeviceKind = 'desktop' | 'tablet' | 'mobile';
export type QualityName = 'high' | 'medium' | 'low';

export interface Quality {
  name: QualityName;
  /** Upper bound for renderer pixel ratio. */
  dprCap: number;
  antialias: boolean;
  /** Multiplier on particle counts. */
  particles: number;
  afterimages: boolean;
  /** Full-screen color effects through CSS filters (desktop only). */
  cssFilters: boolean;
  /** Extra point lights for lanterns. */
  lights: boolean;
}

const PRESETS: Record<QualityName, Quality> = {
  high: { name: 'high', dprCap: 2, antialias: true, particles: 1, afterimages: true, cssFilters: true, lights: true },
  medium: { name: 'medium', dprCap: 1.5, antialias: false, particles: 0.55, afterimages: true, cssFilters: false, lights: false },
  low: { name: 'low', dprCap: 1, antialias: false, particles: 0.35, afterimages: false, cssFilters: false, lights: false },
};

export function detectDevice(platform: Platform): DeviceKind {
  const fromSdk = platform.deviceType;
  if (fromSdk) return fromSdk;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const touch = navigator.maxTouchPoints > 0;
  if (!coarse || !touch) return 'desktop';
  return Math.min(window.screen.width, window.screen.height) >= 700 ? 'tablet' : 'mobile';
}

export function pickQuality(device: DeviceKind, override?: string | null): Quality {
  if (override === 'high' || override === 'medium' || override === 'low') return PRESETS[override];
  const memory = (navigator as any).deviceMemory as number | undefined;
  if (device === 'desktop') return memory !== undefined && memory <= 4 ? PRESETS.medium : PRESETS.high;
  if (memory !== undefined && memory <= 3) return PRESETS.low;
  return PRESETS.medium;
}

export function qualityPreset(name: QualityName): Quality {
  return PRESETS[name];
}

/**
 * Drops render resolution before frame rate: if frames run slow for a couple of
 * seconds, lower the pixel ratio a step (and raise it back when there is headroom).
 */
export class ResolutionGovernor {
  private scale = 1;
  private slowTime = 0;
  private fastTime = 0;

  constructor(private readonly minScale = 0.6) {}

  update(frameSeconds: number): number {
    if (frameSeconds > 1 / 48) {
      this.slowTime += frameSeconds;
      this.fastTime = 0;
    } else if (frameSeconds < 1 / 58) {
      this.fastTime += frameSeconds;
      this.slowTime = 0;
    }
    if (this.slowTime > 2 && this.scale > this.minScale) {
      this.scale = Math.max(this.minScale, this.scale - 0.15);
      this.slowTime = 0;
    } else if (this.fastTime > 6 && this.scale < 1) {
      this.scale = Math.min(1, this.scale + 0.1);
      this.fastTime = 0;
    }
    return this.scale;
  }
}
