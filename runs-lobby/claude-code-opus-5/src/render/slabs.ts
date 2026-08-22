/** Destructible marble cladding.
 *
 *  Every slab carries a damage texture written by the simulation. The shader
 *  blends the polished veneer into the rough substrate where the marble has been
 *  shot away, darkens and tints the craters, and pushes the vertices inwards so
 *  that the damage is visible in the silhouette as well.
 */
import * as THREE from 'three';
import type { DamageField } from '../sim/damage.ts';
import type { SurfaceDef } from '../sim/lobby.ts';
import type { TextureSet } from './textures.ts';

export class SlabRenderer {
  readonly group = new THREE.Group();
  private readonly maps: THREE.DataTexture[] = [];
  private readonly data: Uint8Array[] = [];

  constructor(
    private readonly damage: DamageField,
    defs: readonly SurfaceDef[],
    tex: TextureSet,
  ) {
    this.group.name = 'destructible-cladding';
    for (const def of defs) {
      const n = def.tw * def.th;
      const buf = new Uint8Array(n * 4);
      const map = new THREE.DataTexture(buf, def.tw, def.th, THREE.RGBAFormat);
      map.minFilter = THREE.LinearFilter;
      map.magFilter = THREE.LinearFilter;
      map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
      map.needsUpdate = true;
      this.maps.push(map);
      this.data.push(buf);
      this.group.add(this.buildMesh(def, map, tex));
    }
  }

  private buildMesh(def: SurfaceDef, damageMap: THREE.DataTexture, tex: TextureSet): THREE.Mesh {
    const segU = Math.max(6, Math.round(def.uSize * 13));
    const segV = Math.max(6, Math.round(def.vSize * 13));
    const geo = new THREE.PlaneGeometry(def.uSize, def.vSize, segU, segV);

    const marble = tex.marble.clone();
    marble.needsUpdate = true;
    marble.wrapS = marble.wrapT = THREE.RepeatWrapping;
    marble.repeat.set(def.uSize / 2.2, def.vSize / 2.2);
    const sub = tex.substrate.clone();
    sub.needsUpdate = true;
    sub.wrapS = sub.wrapT = THREE.RepeatWrapping;
    sub.repeat.set(def.uSize / 1.1, def.vSize / 1.1);

    const mat = new THREE.MeshStandardMaterial({
      map: marble,
      roughness: 0.12,
      metalness: 0.02,
      color: 0xf2f4f1,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uDamage = { value: damageMap };
      shader.uniforms.uSubstrate = { value: sub };
      shader.uniforms.uCraterDepth = { value: 0.085 };
      shader.uniforms.uSubTile = { value: new THREE.Vector2(def.uSize / 0.55, def.vSize / 0.55) };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform sampler2D uDamage;
           uniform float uCraterDepth;
           varying vec2 vSlabUv;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vSlabUv = uv;
           float crater = texture2D(uDamage, uv).g;
           transformed.z -= crater * uCraterDepth;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform sampler2D uDamage;
           uniform sampler2D uSubstrate;
           uniform vec2 uSubTile;
           varying vec2 vSlabUv;`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           vec2 dmg = texture2D(uDamage, vSlabUv).rg;
           vec4 rough = texture2D(uSubstrate, vSlabUv * uSubTile);
           // break the edge of the stripped area up with the substrate's own
           // grain, so the veneer shears off in ragged chips, not soft blobs
           float grain = rough.r - 0.5;
           float stripped = smoothstep(0.28, 0.48, dmg.r + grain * 0.3);
           #ifdef USE_MAP
             diffuseColor.rgb = mix(diffuseColor.rgb, rough.rgb * 0.74, stripped);
           #endif
           // the rim where the veneer has just sheared off stays bright
           float rim = smoothstep(0.24, 0.33, dmg.r + grain * 0.42) * (1.0 - smoothstep(0.34, 0.46, dmg.r + grain * 0.42));
           diffuseColor.rgb += rim * 0.07;
           diffuseColor.rgb *= 1.0 - dmg.g * 0.42;`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
           roughnessFactor = mix(roughnessFactor, 0.95, smoothstep(0.22, 0.58, texture2D(uDamage, vSlabUv).r));`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
           {
             vec2 texel = vec2(1.0) / vec2(textureSize(uDamage, 0));
             float cx = texture2D(uDamage, vSlabUv + vec2(texel.x, 0.0)).g
                      - texture2D(uDamage, vSlabUv - vec2(texel.x, 0.0)).g;
             float cy = texture2D(uDamage, vSlabUv + vec2(0.0, texel.y)).g
                      - texture2D(uDamage, vSlabUv - vec2(0.0, texel.y)).g;
             normal = normalize(normal + vec3(-cx, -cy, 0.0) * 2.4);
           }`,
        );
    };

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    // orient the plane onto the slab's (u, v, n) basis
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(def.u.x, def.u.y, def.u.z),
      new THREE.Vector3(def.v.x, def.v.y, def.v.z),
      new THREE.Vector3(def.n.x, def.n.y, def.n.z),
    );
    mesh.quaternion.setFromRotationMatrix(m);
    mesh.position.set(
      def.origin.x + def.u.x * def.uSize * 0.5 + def.v.x * def.vSize * 0.5 + def.n.x * 0.004,
      def.origin.y + def.u.y * def.uSize * 0.5 + def.v.y * def.vSize * 0.5 + def.n.y * 0.004,
      def.origin.z + def.u.z * def.uSize * 0.5 + def.v.z * def.vSize * 0.5 + def.n.z * 0.004,
    );
    mesh.renderOrder = 1;
    return mesh;
  }

  /**
   * Upload the damage maps that changed since the last frame. The simulation
   * may run several fixed steps per rendered frame, so the dirty flags are
   * cleared here — by the consumer — rather than at the start of a step.
   */
  sync(force = false): void {
    for (let i = 0; i < this.maps.length; i++) {
      if (!force && !this.damage.dirty[i]) continue;
      this.damage.dirty[i] = false;
      const ven = this.damage.veneer[i];
      const cra = this.damage.crater[i];
      const buf = this.data[i];
      for (let k = 0, p = 0; k < ven.length; k++, p += 4) {
        buf[p] = ven[k];
        buf[p + 1] = cra[k];
      }
      this.maps[i].needsUpdate = true;
    }
  }
}
