/** Texture loading. Every map here was produced by the image-generation tool and
 *  is checked into `assets/textures` — nothing is fetched from the network. */
import * as THREE from 'three';

export interface TextureSet {
  marble: THREE.Texture;
  floor: THREE.Texture;
  substrate: THREE.Texture;
  plaster: THREE.Texture;
  metal: THREE.Texture;
  brass: THREE.Texture;
  coat: THREE.Texture;
  latex: THREE.Texture;
  uniform: THREE.Texture;
  combat: THREE.Texture;
  veneerEdge: THREE.Texture;
  glass: THREE.Texture;
  bulletHole: THREE.Texture;
  crack: THREE.Texture;
  dust: THREE.Texture;
  spark: THREE.Texture;
}

const BASE = 'textures/';

function tile(t: THREE.Texture, repeat = 1, srgb = true): THREE.Texture {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function loadTextures(): Promise<TextureSet> {
  const loader = new THREE.TextureLoader();
  const get = (file: string) =>
    new Promise<THREE.Texture>((resolve, reject) =>
      loader.load(BASE + file, resolve, undefined, reject),
    );
  const [
    marble, floor, substrate, plaster, metal, brass, coat, latex, uniform, combat,
    veneerEdge, glass, bulletHole, crack, dust, spark,
  ] = await Promise.all([
    get('marble_albedo.jpg'),
    get('marble_dark_floor.jpg'),
    get('substrate.jpg'),
    get('plaster_ceiling.jpg'),
    get('brushed_metal.jpg'),
    get('brass.jpg'),
    get('coat_wool.jpg'),
    get('latex_black.jpg'),
    get('uniform_blue.jpg'),
    get('combat_fabric.jpg'),
    get('marble_veneer_edge.jpg'),
    get('glass_dirt.jpg'),
    get('bullet_hole.png'),
    get('crack_decal.png'),
    get('dust_puff.png'),
    get('spark.png'),
  ]);
  return {
    marble: tile(marble, 1),
    floor: tile(floor, 1),
    substrate: tile(substrate, 1),
    plaster: tile(plaster, 1),
    metal: tile(metal, 1),
    brass: tile(brass, 1),
    coat: tile(coat, 1),
    latex: tile(latex, 1),
    uniform: tile(uniform, 1),
    combat: tile(combat, 1),
    veneerEdge: tile(veneerEdge, 1),
    glass: tile(glass, 1),
    bulletHole: tile(bulletHole, 1),
    crack: tile(crack, 1),
    dust: tile(dust, 1),
    spark: tile(spark, 1),
  };
}
