/**
 * Placeholder weapon models built from boxes. The grip (where the main hand holds it) is at the
 * origin and the weapon points along +Z. Swap these out for real models once the designs exist.
 *
 * Cutting edges: blades are widest along local Y (that is the edge the animation leads with), the
 * hammer head and spear blade along X, the scythe blade sticks out along -X.
 */
import * as THREE from 'three';
import { CharacterDef, WeaponKind } from '../../shared/characters';
import { KATANA_SHEATH, KATANA_SHEATH_MOUTH } from './anim/styles';

export interface WeaponParts {
  main: THREE.Group;
  off: THREE.Group | null;
  /** trail anchors on the main weapon */
  base: THREE.Object3D;
  tip: THREE.Object3D;
  offBase: THREE.Object3D | null;
  offTip: THREE.Object3D | null;
  twoHanded: boolean;
  /** hide the fist meshes (gauntlets replace them) */
  hideHands: boolean;
  /** extra pieces worn on the body (e.g. a scabbard), positioned in torso space */
  worn: THREE.Object3D | null;
  materials: THREE.MeshLambertMaterial[];
}

type Mat = (color: string, emissive?: string) => THREE.MeshLambertMaterial;

function box(mat: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0, parent?: THREE.Object3D): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent?.add(m);
  return m;
}

function anchor(parent: THREE.Object3D, z: number, y = 0, x = 0): THREE.Object3D {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

export function buildWeapon(char: CharacterDef, mat: Mat): WeaponParts {
  const p = char.palette;
  const metal = mat(p.metal);
  const dark = mat('#2a2622');
  const wood = mat('#6b4a2f');
  const accent = mat(p.accent);
  const gold = mat('#d9b24a');
  const parts: WeaponParts = {
    main: new THREE.Group(),
    off: null,
    base: new THREE.Object3D(),
    tip: new THREE.Object3D(),
    offBase: null,
    offTip: null,
    twoHanded: false,
    hideHands: false,
    worn: null,
    materials: [metal, dark, wood, accent, gold],
  };
  const g = parts.main;
  const kind: WeaponKind = char.weaponKind;

  switch (kind) {
    case 'katana': {
      parts.twoHanded = true;
      box(dark, 0.06, 0.06, 0.3, 0, 0, 0.02, g); // wrapped handle
      box(gold, 0.13, 0.13, 0.03, 0, 0, 0.18, g); // tsuba
      box(metal, 0.035, 0.085, 0.95, 0, 0, 0.67, g); // blade
      box(metal, 0.035, 0.05, 0.08, 0, 0.02, 1.17, g); // kissaki
      parts.base = anchor(g, 0.25);
      parts.tip = anchor(g, 1.2);
      // scabbard through the sash on the left hip (the Iai draw comes out of it)
      const sheath = new THREE.Group();
      box(dark, 0.07, 0.1, 0.97, 0, 0, 0.5, sheath);
      box(gold, 0.08, 0.11, 0.05, 0, 0, 0.03, sheath);
      box(accent, 0.075, 0.105, 0.04, 0, 0, 0.26, sheath);
      box(gold, 0.08, 0.11, 0.04, 0, 0, 0.97, sheath);
      const [mx, my, mz] = KATANA_SHEATH_MOUTH;
      const [dx, dy, dz] = KATANA_SHEATH;
      sheath.position.set(mx, my, mz);
      sheath.lookAt(new THREE.Vector3(mx + dx, my + dy, mz + dz));
      parts.worn = sheath;
      break;
    }
    case 'greathammer': {
      parts.twoHanded = true;
      box(wood, 0.08, 0.08, 1.45, 0, 0, 0.35, g);
      box(dark, 0.1, 0.1, 0.12, 0, 0, -0.3, g);
      const head = box(metal, 0.62, 0.38, 0.38, 0, 0, 1.06, g);
      box(dark, 0.66, 0.08, 0.42, 0, 0, 0, head);
      box(accent, 0.12, 0.42, 0.42, 0, 0, 0, head);
      parts.base = anchor(g, 0.85);
      parts.tip = anchor(g, 1.25);
      break;
    }
    case 'rapier': {
      box(dark, 0.05, 0.05, 0.18, 0, 0, 0, g);
      box(gold, 0.16, 0.12, 0.05, 0, 0, 0.11, g); // guard
      box(gold, 0.03, 0.12, 0.14, 0.07, -0.03, 0.05, g); // knuckle bow
      box(metal, 0.03, 0.04, 1.05, 0, 0, 0.66, g);
      box(gold, 0.06, 0.06, 0.06, 0, 0, -0.11, g); // pommel
      parts.base = anchor(g, 0.2);
      parts.tip = anchor(g, 1.18);
      break;
    }
    case 'spear': {
      parts.twoHanded = true;
      box(wood, 0.06, 0.06, 2.3, 0, 0, 0.35, g);
      box(metal, 0.12, 0.03, 0.34, 0, 0, 1.66, g); // leaf blade
      box(metal, 0.06, 0.03, 0.12, 0, 0, 1.87, g);
      box(accent, 0.1, 0.1, 0.1, 0, 0, 1.47, g); // tassel binding
      box(accent, 0.05, 0.16, 0.05, 0, -0.1, 1.45, g);
      box(metal, 0.07, 0.07, 0.08, 0, 0, -0.82, g); // butt cap
      parts.base = anchor(g, 1.4);
      parts.tip = anchor(g, 1.92);
      break;
    }
    case 'daggers': {
      const blade = (grp: THREE.Group) => {
        box(dark, 0.05, 0.05, 0.14, 0, 0, 0, grp);
        box(accent, 0.1, 0.04, 0.03, 0, 0, 0.08, grp);
        box(metal, 0.035, 0.06, 0.38, 0, 0, 0.28, grp);
      };
      blade(g);
      parts.base = anchor(g, 0.1);
      parts.tip = anchor(g, 0.48);
      const off = new THREE.Group();
      blade(off);
      parts.off = off;
      parts.offBase = anchor(off, 0.1);
      parts.offTip = anchor(off, 0.48);
      break;
    }
    case 'scythe': {
      parts.twoHanded = true;
      box(dark, 0.06, 0.06, 1.9, 0, 0, 0.3, g);
      box(accent, 0.08, 0.08, 0.06, 0, 0, 1.2, g);
      // curved blade sweeping to the side, near the top of the shaft
      const blade = new THREE.Group();
      blade.position.set(0, 0, 1.22);
      g.add(blade);
      const segs = 5;
      for (let i = 0; i < segs; i++) {
        const seg = box(metal, 0.2, 0.03, 0.09 - i * 0.008, -0.1 - i * 0.17, 0, -i * i * 0.018, blade);
        seg.rotation.y = -i * 0.18;
      }
      box(accent, 0.05, 0.05, 0.05, 0, 0, 0, blade);
      parts.base = anchor(blade, 0, 0, -0.1);
      parts.tip = anchor(blade, -0.32, 0, -0.85);
      break;
    }
    case 'gauntlets': {
      parts.hideHands = true;
      // knuckles face +Z (the punch direction), the cuff trails back toward the elbow
      const fist = (grp: THREE.Group) => {
        box(metal, 0.2, 0.2, 0.22, 0, 0, 0.02, grp);
        box(accent, 0.21, 0.07, 0.23, 0, 0.08, 0.02, grp);
        box(gold, 0.05, 0.05, 0.06, -0.06, 0.02, 0.15, grp);
        box(gold, 0.05, 0.05, 0.06, 0.06, 0.02, 0.15, grp);
        box(metal, 0.17, 0.17, 0.14, 0, 0, -0.14, grp); // cuff
      };
      fist(g);
      parts.base = anchor(g, 0, 0.1);
      parts.tip = anchor(g, 0.16);
      const off = new THREE.Group();
      fist(off);
      parts.off = off;
      parts.offBase = anchor(off, 0, 0.1);
      parts.offTip = anchor(off, 0.16);
      break;
    }
    case 'swordShield': {
      box(dark, 0.05, 0.05, 0.18, 0, 0, 0, g);
      box(gold, 0.24, 0.05, 0.05, 0, 0, 0.11, g);
      box(metal, 0.04, 0.09, 0.78, 0, 0, 0.52, g);
      box(gold, 0.07, 0.07, 0.07, 0, 0, -0.11, g);
      parts.base = anchor(g, 0.16);
      parts.tip = anchor(g, 0.92);
      // kite shield: the handle is at the origin, the face points along +Z, top edge toward +Y
      const off = new THREE.Group();
      const shield = new THREE.Group();
      shield.position.set(0, 0.05, 0.08);
      off.add(shield);
      box(mat(p.secondary), 0.62, 0.78, 0.07, 0, 0, 0, shield);
      box(gold, 0.66, 0.06, 0.08, 0, 0.38, 0, shield);
      box(gold, 0.06, 0.82, 0.08, 0, 0, 0, shield);
      box(mat(p.accent), 0.22, 0.22, 0.09, 0, 0.05, 0.01, shield);
      box(dark, 0.05, 0.16, 0.05, 0, 0, -0.04, shield); // handle
      parts.off = off;
      parts.offBase = anchor(off, 0.1, -0.3);
      parts.offTip = anchor(off, 0.1, 0.4);
      break;
    }
  }
  return parts;
}
