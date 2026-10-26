/**
 * Graphics quality tiers. 'auto' picks one from the device and then trims the render resolution
 * while the frame rate struggles.
 */
export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';
export type QualitySetting = 'auto' | QualityLevel;

export interface Quality {
  level: QualityLevel;
  /** upper bound on rendered pixels, and on device pixels per CSS pixel */
  maxPixels: number;
  maxDpr: number;
  /** multisampling on the scene (0 = FXAA instead) */
  msaa: number;
  shadowSize: number;
  /** soft shadow edge, in shadow-map texels */
  shadowRadius: number;
  bloomMips: number;
  godRays: boolean;
  godRaySamples: number;
  /** render size of god rays relative to the screen */
  godRayScale: number;
  /** planar water reflections relative to the screen (0 = sky reflection only) */
  reflections: number;
  /** multipliers on grass, flowers and ambient particles */
  grass: number;
  particles: number;
  /** distant scenery: fewer, coarser trees on lower tiers */
  scenery: number;
}

const PRESETS: Record<QualityLevel, Quality> = {
  // even the cheapest tier renders above 1x: at 1 render pixel per CSS pixel a phone screen (2-3x)
  // shows everything soft and smeared
  low: { level: 'low', maxPixels: 900_000, maxDpr: 1.5, msaa: 0, shadowSize: 1024, shadowRadius: 1.5, bloomMips: 3, godRays: false, godRaySamples: 0, godRayScale: 0.25, reflections: 0, grass: 0.35, particles: 0.45, scenery: 0.5 },
  medium: { level: 'medium', maxPixels: 1_600_000, maxDpr: 2, msaa: 0, shadowSize: 2048, shadowRadius: 2, bloomMips: 5, godRays: true, godRaySamples: 32, godRayScale: 0.25, reflections: 0.25, grass: 0.65, particles: 0.75, scenery: 0.75 },
  high: { level: 'high', maxPixels: 2_600_000, maxDpr: 2, msaa: 4, shadowSize: 2048, shadowRadius: 2.5, bloomMips: 6, godRays: true, godRaySamples: 48, godRayScale: 0.5, reflections: 0.5, grass: 1, particles: 1, scenery: 1 },
  ultra: { level: 'ultra', maxPixels: 4_200_000, maxDpr: 2, msaa: 4, shadowSize: 4096, shadowRadius: 3, bloomMips: 6, godRays: true, godRaySamples: 64, godRayScale: 0.5, reflections: 0.75, grass: 1.5, particles: 1.4, scenery: 1 },
};

let gpuName: string | null = null;

function detectGpu(): string {
  if (gpuName !== null) return gpuName;
  gpuName = '';
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpuName = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    // no GPU info: guess from the rest
  }
  return gpuName;
}

/** A tier that suits this device. */
export function detectQuality(): QualityLevel {
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  const gpu = detectGpu().toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return 'low';
  // iPhones and iPads: Safari reports no memory and few cores, but every Apple GPU runs medium well
  if (touch && /apple/.test(gpu)) return 'medium';
  if (touch) return cores >= 8 && memory >= 6 && !/mali-g5|mali-t|adreno \(tm\) [1-5]/.test(gpu) ? 'medium' : 'low';
  if (/intel|uhd|iris|hd graphics|radeon\(tm\) graphics|vega [3-8]\b/.test(gpu)) return 'medium';
  return 'high';
}

export function qualityPreset(setting: QualitySetting): Quality {
  return { ...PRESETS[setting === 'auto' ? detectQuality() : setting] };
}

export const QUALITY_LEVELS: QualityLevel[] = ['low', 'medium', 'high', 'ultra'];
