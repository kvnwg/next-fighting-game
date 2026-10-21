/** Every map's recipe, by map id. */
import { MapDef, MAPS } from '../../../shared/maps';
import { hash3 } from '../gfx/noise';
import { hex, pick, voxelFloor } from './kit';
import { MapRecipe } from './look';
import { bambooRecipe } from './bamboo';
import { bridgeRecipe } from './bridge';
import { forgeRecipe } from './forge';
import { lobbyRecipe } from './lobby';
import { ruinsRecipe } from './ruins';
import { sakuraRecipe } from './sakura';
import { summitRecipe } from './summit';

const GROUND: Record<string, number[]> = {
  grass: [hex('#6e9c3e'), hex('#78a646'), hex('#628f37')],
  stone: [hex('#7d8086'), hex('#878a90'), hex('#6f7278')],
  snow: [hex('#eef4fb'), hex('#e1eaf5'), hex('#f8fbff')],
  obsidian: [hex('#2a2230'), hex('#33293a'), hex('#241d2a')],
  planks: [hex('#9a8270'), hex('#8c7564'), hex('#a68c78')],
  moss: [hex('#2f4f2c'), hex('#365c33'), hex('#28452a')],
  tiles: [hex('#b9ada0'), hex('#c2b6a9'), hex('#a99d90')],
  sand: [hex('#d8c08a'), hex('#cfb67f'), hex('#e0c995')],
  path: [hex('#9b7b55'), hex('#8f714c'), hex('#a7865e')],
};

/** A plain recipe from the map's shared theme, for maps without their own yet. */
function fromTheme(map: MapDef): MapRecipe {
  const th = map.theme;
  return {
    propStyle: th.ground === 'snow' ? 'snow' : th.ground === 'obsidian' ? 'ash' : 'moss',
    pine: th.ground === 'snow' ? 'snowPine' : 'pine',
    look: {
      sky: { zenith: th.skyTop, horizon: th.skyBottom, band: th.skyMid, bandAmount: th.skyMid ? 0.6 : 0, night: !!th.night, none: map.id === 'forge' },
      light: { dir: th.sunDir, color: th.sun, intensity: th.sunIntensity * 1.1 },
      disc: th.sunDisc,
      hemi: { sky: th.ambient, ground: '#3a3530', intensity: th.ambientIntensity * 0.75 },
      fog: { color: th.fog, sun: th.sun, density: 0.02, falloff: 0.04 },
      lit: !!th.night || !!th.dusk,
      clouds: th.night || map.id === 'forge' ? [] : [{ y: 120, cell: 14, thick: 5, cover: 0.35, half: 40, top: '#ffffff', side: '#e6ecf4', bottom: '#b8c4d4', speed: 1.5, layers: 2 }],
    },
    build(ctx) {
      const pal = GROUND[th.ground] ?? GROUND.stone;
      ctx.group.add(
        voxelFloor(map.floor, {
          cell: 0.25,
          layer: 0.08,
          depth: 3,
          at: (x, z) => {
            const cx = Math.floor(x / 0.25);
            const cz = Math.floor(z / 0.25);
            for (const d of map.decals) {
              const s = d.shape;
              const inside = s.type === 'circle' ? Math.hypot(x - s.x, z - s.z) <= s.r : Math.abs(x - s.x) <= s.hw && Math.abs(z - s.z) <= s.hd;
              if (inside) return { color: pick(GROUND[d.tex] ?? pal, hash3(cx, 1, cz, 2)) };
            }
            return { color: pick(pal, hash3(cx, 0, cz, 1)) };
          },
        }),
      );
    },
  };
}

export const RECIPES: Record<string, MapRecipe> = Object.fromEntries(Object.values(MAPS).map((m) => [m.id, fromTheme(m)]));
RECIPES.sakura = sakuraRecipe;
RECIPES.ruins = ruinsRecipe;
RECIPES.bridge = bridgeRecipe;
RECIPES.summit = summitRecipe;
RECIPES.bamboo = bambooRecipe;
RECIPES.forge = forgeRecipe;
RECIPES.lobby = lobbyRecipe;
