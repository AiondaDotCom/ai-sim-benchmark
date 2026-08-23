/**
 * A9: rim light for the characters.
 *
 * The protagonists are near-black figures in a near-black hall, so in the wide
 * shots their silhouettes dissolve into the granite. This adds a thin cool
 * edge along the contours facing away from the lens.
 *
 * It is a Fresnel term injected into the standard material rather than extra
 * lights in the scene, for three reasons: it costs no additional light
 * evaluation, it is view-dependent by construction (so it tracks the camera
 * for free — the rim direction is expressed in VIEW space and therefore
 * follows the camera without any per-frame update), and it can be applied to
 * exactly the character materials and nothing else.
 *
 * The direction weighting is what keeps it from looking like a glowing
 * outline: only contours facing up-and-back-left catch the light, the way a
 * practical back light behaves, instead of the whole silhouette glowing evenly.
 */
import * as THREE from 'three';

/** Cool back light, up and behind the subject's left, in view space. */
const RIM_DIR = new THREE.Vector3(-0.45, 0.55, -0.7).normalize();
const RIM_COLOR = new THREE.Color(0x9fc4d8);

export interface RimOptions {
  strength: number;
  power: number;
}

function patch(mat: THREE.Material, opt: RimOptions) {
  const m = mat as THREE.MeshStandardMaterial;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: RIM_COLOR };
    shader.uniforms.uRimDir = { value: RIM_DIR };
    shader.uniforms.uRimStrength = { value: opt.strength };
    shader.uniforms.uRimPower = { value: opt.power };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uRimColor;
        uniform vec3 uRimDir;
        uniform float uRimStrength;
        uniform float uRimPower;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          // grazing angle to the lens
          vec3 rimV = normalize( vViewPosition );
          float rimF = pow( 1.0 - clamp( dot( normal, rimV ), 0.0, 1.0 ), uRimPower );
          // ...restricted to contours facing the back light
          float rimD = clamp( dot( normal, uRimDir ) * 0.5 + 0.5, 0.0, 1.0 );
          outgoingLight += uRimColor * uRimStrength * rimF * rimD * rimD;
        }
        #include <opaque_fragment>`,
      );
  };
  // a distinct cache key so patched and unpatched materials never share a
  // compiled program
  m.customProgramCacheKey = () => `rim${opt.strength}_${opt.power}`;
  m.needsUpdate = true;
}

/**
 * Apply the rim to the character materials only. The set keeps its own
 * lighting — rimming the granite would flatten the hall.
 */
export function applyCharacterRim(mats: Record<string, unknown>) {
  const cloth: RimOptions = { strength: 0.5, power: 3.0 };
  const shiny: RimOptions = { strength: 0.42, power: 3.4 };
  const flesh: RimOptions = { strength: 0.26, power: 3.6 };
  const table: [string, RimOptions][] = [
    ['coat', cloth], ['latex', shiny], ['shirt', { strength: 0.3, power: 3.2 }],
    ['darkCloth', cloth], ['trouser', cloth], ['guardTrouser', cloth],
    ['black', cloth], ['skin', flesh], ['skinW', flesh],
  ];
  for (const [key, opt] of table) {
    const m = mats[key];
    if (m instanceof THREE.Material) patch(m, opt);
  }
}
