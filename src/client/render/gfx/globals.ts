/**
 * Uniforms every world shader shares. Materials take these objects by reference in
 * onBeforeCompile, so writing a value here updates every material at once.
 */
import * as THREE from 'three';

export const G = {
  /** seconds since start, for wind and particle animation */
  uTime: { value: 0 },
  /** wind: xy = direction across the ground (x, z), z = strength, w = how hard gusts hit */
  uWind: { value: new THREE.Vector4(0.8, 0.6, 1, 0.6) },
  /** world direction toward the sun (or moon) */
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() },
  /** sunlight colour times intensity, for light through leaves */
  uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
  /** fog colour away from the sun, and toward it (the sun's glow in the haze) */
  uFogColor: { value: new THREE.Color('#b8c8d8') },
  uFogSunColor: { value: new THREE.Color('#ffd8a8') },
  /** fog: x = density at the base height, y = falloff with height, z = base height, w = sun glow tightness */
  uFog: { value: new THREE.Vector4(0.012, 0.06, 0, 6) },
  /** up to four things that push grass aside: xyz = position, w = radius (0 = unused) */
  uPushers: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  /** fighters' rim light: rgb = colour, a = strength */
  uRim: { value: new THREE.Vector4(1, 0.95, 0.85, 0.6) },
};

/** GLSL declarations matching G (include once per shader). */
export const GLOBALS_GLSL = /* glsl */ `
uniform float uTime;
uniform vec4 uWind;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform vec4 uFog;
uniform vec4 uPushers[4];
uniform vec4 uRim;
`;

/** Bind the shared uniforms into a compiled shader's uniform list. */
export function bindGlobals(uniforms: Record<string, THREE.IUniform>): void {
  uniforms.uTime = G.uTime;
  uniforms.uWind = G.uWind;
  uniforms.uSunDir = G.uSunDir;
  uniforms.uSunColor = G.uSunColor;
  uniforms.uFogColor = G.uFogColor;
  uniforms.uFogSunColor = G.uFogSunColor;
  uniforms.uFog = G.uFog;
  uniforms.uPushers = G.uPushers;
  uniforms.uRim = G.uRim;
}

/**
 * Wind: a slow sway, gust fronts rolling across the ground along the wind, and a quick flutter.
 * `w` is how far this point may move (0 for trunks and stone), `phase` desyncs neighbours.
 */
export const WIND_GLSL = /* glsl */ `
vec3 voxWind(vec3 wp, float w, float phase) {
  if (w <= 0.0) return vec3(0.0);
  vec2 dir = uWind.xy;
  float t = uTime;
  float front = sin(dot(wp.xz, dir) * 0.09 - t * 0.85 + phase * 0.2) * 0.5 + 0.5;
  float gust = 1.0 + front * front * uWind.w * 1.6;
  float sway = sin(t * 1.25 + phase) * 0.55 + sin(t * 2.1 + phase * 1.7 + wp.y * 0.35) * 0.3;
  float lean = (0.3 + sway) * gust * uWind.z;
  float flutter = sin(t * 6.5 + dot(wp, vec3(2.1, 1.7, 2.9)) + phase) * uWind.z * gust;
  vec3 d = vec3(dir.x, 0.0, dir.y) * lean;
  d += vec3(flutter * 0.12, flutter * 0.06, -flutter * 0.1);
  return d * w;
}
`;

/**
 * Exponential height fog: thick near the ground, thinning with height, glowing toward the sun.
 * Returns the fogged colour.
 */
export const FOG_GLSL = /* glsl */ `
vec3 voxFog(vec3 col, vec3 wp) {
  vec3 ray = wp - cameraPosition;
  float dist = length(ray);
  vec3 rd = ray / max(dist, 1e-3);
  float b = max(uFog.y, 1e-3);
  float h = cameraPosition.y - uFog.z;
  float k = b * rd.y;
  float optical = uFog.x * exp(-b * h) * (abs(k) > 1e-4 ? (1.0 - exp(-k * dist)) / k : dist);
  float amount = 1.0 - exp(-max(optical, 0.0));
  vec3 fc = mix(uFogColor, uFogSunColor, pow(max(dot(rd, uSunDir), 0.0), uFog.w));
  return mix(col, fc, amount);
}
`;
