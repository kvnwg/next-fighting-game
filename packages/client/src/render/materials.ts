import { Color, MeshStandardMaterial, type IUniform } from 'three';

/** Uniforms shared by every material on one fighter, so one write recolors the whole body. */
export interface FighterUniforms {
  uRim: IUniform<number>;
  uRimColor: IUniform<Color>;
  uTint: IUniform<number>;
  uTintColor: IUniform<Color>;
}

export function makeFighterUniforms(): FighterUniforms {
  return {
    uRim: { value: 0 },
    uRimColor: { value: new Color(1, 1, 1) },
    uTint: { value: 0 },
    uTintColor: { value: new Color(1, 0.15, 0.1) },
  };
}

/**
 * Standard material plus a fresnel rim (the white telegraph glow) and a flat tint
 * (red on hit, orange on a parried attacker). Both cost a few shader instructions,
 * which keeps them cheap enough for phones.
 */
export function makeFighterMaterial(color: number, u: FighterUniforms, opts: { roughness?: number; metalness?: number } = {}): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.72, metalness: opts.metalness ?? 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = u.uRim;
    shader.uniforms.uRimColor = u.uRimColor;
    shader.uniforms.uTint = u.uTint;
    shader.uniforms.uTintColor = u.uTintColor;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uRim;\nuniform vec3 uRimColor;\nuniform float uTint;\nuniform vec3 uTintColor;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2);
        totalEmissiveRadiance += uRimColor * (rimF * 2.6 + 0.3) * uRim;
        diffuseColor.rgb = mix(diffuseColor.rgb, uTintColor, uTint * 0.85);
        totalEmissiveRadiance += uTintColor * uTint * 0.55;`,
      );
  };
  mat.customProgramCacheKey = () => 'fighter-rim-tint';
  return mat;
}
