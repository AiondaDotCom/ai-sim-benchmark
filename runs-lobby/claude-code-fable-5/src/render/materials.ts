/**
 * Texture loading + shared materials. All image textures are generated
 * assets checked into public/assets/textures (see ASSETS.md).
 */
import * as THREE from 'three';

export interface Mats {
  marble: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  floorOverlay: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  elevatorDoor: THREE.MeshStandardMaterial;
  cabWall: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  substrate: THREE.MeshStandardMaterial;
  coat: THREE.MeshStandardMaterial;
  latex: THREE.MeshStandardMaterial;
  shirt: THREE.MeshStandardMaterial;
  guardTrouser: THREE.MeshStandardMaterial;
  darkCloth: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  skinW: THREE.MeshStandardMaterial;
  black: THREE.MeshStandardMaterial;
  trouser: THREE.MeshStandardMaterial;
  gunmetal: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  textures: {
    bulletHole: THREE.Texture;
    crack: THREE.Texture;
    substrate: THREE.Texture;
    radialAlpha: THREE.Texture;
    dust: THREE.Texture;
  };
}

function radialAlphaTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

function dustSprite(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export async function loadMats(): Promise<Mats> {
  const loader = new THREE.TextureLoader();
  const base = import.meta.env.BASE_URL;
  const tex = (name: string, repeat?: [number, number]) =>
    new Promise<THREE.Texture>((resolve, reject) => {
      loader.load(
        `${base}assets/textures/${name}.png`,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 4;
          if (repeat) {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(repeat[0], repeat[1]);
          }
          resolve(t);
        },
        undefined,
        reject,
      );
    });

  /**
   * A9/A11: load a derived map (normal or roughness) if scripts/derive-maps.py
   * has produced one. These are linear data, never sRGB. Missing files resolve
   * to null so the demo still runs from albedo alone.
   */
  const dataTex = (name: string, src: THREE.Texture) =>
    new Promise<THREE.Texture | null>((resolve) => {
      loader.load(
        `${base}assets/textures/${name}.png`,
        (t) => {
          t.colorSpace = THREE.NoColorSpace;
          t.anisotropy = 4;
          t.wrapS = src.wrapS;
          t.wrapT = src.wrapT;
          t.repeat.copy(src.repeat);
          resolve(t);
        },
        undefined,
        () => resolve(null),
      );
    });

  const [
    graniteT, floorT, ceilT, metalT, brassT, subT, coatT, latexT, shirtT, holeT, crackT,
  ] = await Promise.all([
    tex('granite_tile', [1, 5.4]),
    tex('floor_green', [8, 19]),
    tex('ceiling_coffer', [5, 11]),
    tex('brushed_metal'),
    tex('brass'),
    tex('b8_substrate', [1, 1]),
    tex('a11_coat_twill', [2.6, 2.6]),
    tex('a11_latex_sheen', [2, 2]),
    tex('a11_shirt_weave', [3, 3]),
    tex('bullet_hole'),
    tex('crack_decal'),
  ]);
  // A11: the soldiers get their own tactical weave rather than a re-tiled
  // coat twill
  const tacticalT = await tex('a11_tactical_weave', [2.4, 2.4]).catch(() => coatT.clone());
  const darkClothT = tacticalT;
  darkClothT.needsUpdate = true;
  // A11: the skin sheet drives pore RELIEF and roughness only. Using it as
  // albedo as well multiplied a tan map by a tan base colour and turned every
  // face orange.
  const skinT = await tex('a11_skin_pores', [1.6, 1.6]).catch(() => null);
  // A11: scuffed leather for boots and gloves
  const bootT = await tex('a11_boot_leather', [2.2, 2.2]).catch(() => null);
  // wall clone of the granite with wall-scaled tiling
  const wallGraniteT = graniteT.clone();
  wallGraniteT.needsUpdate = true;
  wallGraniteT.repeat.set(12, 2.3);

  // --- derived relief -----------------------------------------------------
  // normalScale per material: granite coarse and speckled, fabric woven,
  // polished stone with relief only in the veining.
  const REL: Record<string, [THREE.Texture, number]> = {
    granite: [graniteT, 0.85], floor: [floorT, 0.28], metal: [metalT, 0.35],
    brass: [brassT, 0.3], coat: [coatT, 0.7], latex: [latexT, 0.35],
    shirt: [shirtT, 0.55], darkCloth: [darkClothT, 0.7], wall: [wallGraniteT, 0.7],
    skin: [skinT ?? graniteT, 0.22],
    substrate: [subT, 1.15],
    black: [bootT ?? graniteT, 0.6],
  };
  const NAME: Record<string, string> = {
    granite: 'granite_tile', floor: 'floor_green', metal: 'brushed_metal',
    brass: 'brass', coat: 'coat_fabric', latex: 'latex_black',
    shirt: 'shirt_white', darkCloth: 'coat_fabric', wall: 'granite_tile',
  };
  const rel: Record<string, { n: THREE.Texture | null; r: THREE.Texture | null; s: number }> = {};
  await Promise.all(Object.keys(REL).map(async (k) => {
    const [src, scale] = REL[k];
    const [n, r] = await Promise.all([
      dataTex(`${NAME[k]}_n`, src), dataTex(`${NAME[k]}_r`, src),
    ]);
    rel[k] = { n, r, s: scale };
  }));
  /** attach the derived normal/roughness maps to a finished material */
  const withRelief = (mat: THREE.MeshStandardMaterial, key: string) => {
    const d = rel[key];
    if (!d) return mat;
    if (d.n) {
      mat.normalMap = d.n;
      mat.normalScale = new THREE.Vector2(d.s, d.s);
    }
    if (d.r && !mat.roughnessMap) mat.roughnessMap = d.r;
    return mat;
  };

  const M = THREE.MeshStandardMaterial;
  return {
    marble: withRelief(new M({ map: graniteT, roughness: 0.34, metalness: 0.04, color: 0xe8ece6, envMapIntensity: 0.6 }), 'granite'),
    wall: withRelief(new M({ map: wallGraniteT, roughness: 0.4, metalness: 0.02, color: 0xd6dcd2 }), 'wall'),
    floorOverlay: withRelief(new M({
      map: floorT, roughness: 0.08, metalness: 0.2, color: 0xd2d8d0,
      transparent: true, opacity: 0.8, envMapIntensity: 0.75,
    }), 'floor'),
    ceiling: new M({ map: ceilT, roughness: 0.8, color: 0x878f86 }),
    metal: withRelief(new M({ map: metalT, roughness: 0.32, metalness: 0.85, envMapIntensity: 1.0 }), 'metal'),
    // elevator door leaves: dark brushed metal (B2 supplement); they read
    // against the granite via the bank downlight + architrave contrast
    elevatorDoor: new M({
      map: metalT, roughness: 0.3, metalness: 0.55,
      color: 0x596066, envMapIntensity: 1.0,
    }),
    // cab interior: dark blue-grey metal panels, lit from the cab ceiling
    cabWall: new M({
      map: metalT, roughness: 0.55, metalness: 0.2, color: 0x99a5b5,
    }),
    brass: withRelief(new M({ map: brassT, roughness: 0.28, metalness: 0.85, color: 0xf0c568 }), 'brass'),
    // B8: the layer revealed when granite is shot off — deliberately a
    // different material, not a paler granite: chalky, matte, coarse.
    substrate: withRelief(new M({
      map: subT, roughness: 0.98, metalness: 0, color: 0xb6b8ae,
    }), 'substrate'),
    coat: withRelief(new M({ map: coatT, roughness: 0.62, color: 0x83868c }), 'coat'),
    latex: withRelief(new M({
      map: latexT, roughnessMap: latexT, roughness: 0.55, metalness: 0.22,
      color: 0x232328, envMapIntensity: 1.1,
    }), 'latex'),
    shirt: withRelief(new M({ map: shirtT, roughness: 0.66, color: 0xf0eee6 }), 'shirt'),
    guardTrouser: new M({ map: darkClothT, roughness: 0.8, color: 0x37453a }),
    darkCloth: withRelief(new M({ map: darkClothT, roughness: 0.82, color: 0x43484e }), 'darkCloth'),
    skin: withRelief(new M({ color: 0xc9a186, roughness: 0.6 }), 'skin'),
    skinW: withRelief(new M({ color: 0xd9b096, roughness: 0.55 }), 'skin'),
    black: withRelief(new M({ color: 0x191a1c, roughness: 0.45, map: bootT ?? undefined }), 'black'),
    trouser: new M({ color: 0x26282c, roughness: 0.78 }),
    gunmetal: new M({ color: 0x2a2d31, roughness: 0.35, metalness: 0.8 }),
    glass: new M({
      color: 0x8fa79c, roughness: 0.05, metalness: 0.3,
      transparent: true, opacity: 0.28, envMapIntensity: 1.2,
    }),
    wood: new M({ color: 0x241d16, roughness: 0.55 }),
    textures: {
      bulletHole: holeT,
      crack: crackT,
      substrate: subT,
      radialAlpha: radialAlphaTexture(),
      dust: dustSprite(),
    },
  };
}
