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
    blood: THREE.Texture;
    bloodAlpha: THREE.Texture;
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

/**
 * The blood splatter is red-on-black; alphaMap samples the green channel,
 * so build an alpha texture from the red channel procedurally.
 */
function alphaFromRed(img: HTMLImageElement): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const a = Math.max(px[i], px[i + 1], px[i + 2]);
    px[i] = px[i + 1] = px[i + 2] = a;
  }
  g.putImageData(data, 0, 0);
  return new THREE.CanvasTexture(c);
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

  const [
    graniteT, floorT, ceilT, metalT, brassT, subT, coatT, latexT, shirtT, holeT, crackT, bloodT,
  ] = await Promise.all([
    tex('granite_tile', [1, 5.4]),
    tex('floor_green', [8, 19]),
    tex('ceiling_coffer', [5, 11]),
    tex('brushed_metal'),
    tex('brass'),
    tex('substrate', [1, 1]),
    tex('coat_fabric', [2.6, 2.6]),
    tex('latex_black', [2, 2]),
    tex('shirt_white', [3, 3]),
    tex('bullet_hole'),
    tex('crack_decal'),
    tex('blood_stain'),
  ]);
  // independent repeat for the soldiers' dark fatigues
  const darkClothT = coatT.clone();
  darkClothT.needsUpdate = true;
  darkClothT.repeat.set(2.2, 2.2);
  // wall clone of the granite with wall-scaled tiling
  const wallGraniteT = graniteT.clone();
  wallGraniteT.needsUpdate = true;
  wallGraniteT.repeat.set(12, 2.3);

  const M = THREE.MeshStandardMaterial;
  return {
    marble: new M({ map: graniteT, roughness: 0.34, metalness: 0.04, color: 0xe8ece6, envMapIntensity: 0.6 }),
    wall: new M({ map: wallGraniteT, roughness: 0.4, metalness: 0.02, color: 0xd6dcd2 }),
    floorOverlay: new M({
      map: floorT, roughness: 0.08, metalness: 0.2, color: 0xd2d8d0,
      transparent: true, opacity: 0.8, envMapIntensity: 0.75,
    }),
    ceiling: new M({ map: ceilT, roughness: 0.8, color: 0x878f86 }),
    metal: new M({ map: metalT, roughness: 0.32, metalness: 0.85, envMapIntensity: 1.0 }),
    brass: new M({ map: brassT, roughness: 0.28, metalness: 0.85, color: 0xf0c568 }),
    substrate: new M({ map: subT, roughness: 0.95, metalness: 0 }),
    coat: new M({ map: coatT, roughness: 0.62, color: 0x83868c }),
    latex: new M({
      map: latexT, roughnessMap: latexT, roughness: 0.55, metalness: 0.22,
      color: 0x232328, envMapIntensity: 1.1,
    }),
    shirt: new M({ map: shirtT, roughness: 0.66, color: 0xf0eee6 }),
    guardTrouser: new M({ map: darkClothT, roughness: 0.8, color: 0x37453a }),
    darkCloth: new M({ map: darkClothT, roughness: 0.82, color: 0x43484e }),
    skin: new M({ color: 0xc9a186, roughness: 0.6 }),
    skinW: new M({ color: 0xd9b096, roughness: 0.55 }),
    black: new M({ color: 0x0c0c0e, roughness: 0.4 }),
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
      blood: bloodT,
      bloodAlpha: alphaFromRed(bloodT.image as HTMLImageElement),
    },
  };
}
