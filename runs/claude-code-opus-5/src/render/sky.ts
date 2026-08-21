/**
 * Sky dome, fog and lighting.
 *
 * The background is never black: a large inward-facing sphere paints a soft
 * vertical gradient from a deep zenith blue down to a pale, hazy horizon, and
 * the scene fog is set to exactly that horizon colour so distant terrain melts
 * into the sky instead of ending at a hard silhouette.
 */

import * as THREE from 'three';

export interface SkyPalette {
  zenith: THREE.Color;
  horizon: THREE.Color;
  sun: THREE.Color;
  ground: THREE.Color;
}

export const DEFAULT_SKY: SkyPalette = {
  zenith: new THREE.Color('#2a79cf'),
  horizon: new THREE.Color('#c4e6f6'),
  sun: new THREE.Color('#fff3d6'),
  ground: new THREE.Color('#6f7a5a'),
};



const SKY_VERTEX = /* glsl */ `
varying vec3 vWorldDirection;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform vec3 uSunDirection;
uniform vec3 uFogColor;
varying vec3 vWorldDirection;

void main() {
  vec3 dir = normalize(vWorldDirection);

  // Vertical gradient: pale near the horizon, saturated overhead.
  float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  float t = pow(clamp((h - 0.5) * 2.0, 0.0, 1.0), 0.52);
  vec3 color = mix(uHorizon, uZenith, t);

  // Broad sun glow plus a soft disc.
  float sunDot = max(dot(dir, normalize(uSunDirection)), 0.0);
  color += uSunColor * pow(sunDot, 10.0) * 0.20;
  color += uSunColor * pow(sunDot, 1200.0) * 1.4;

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>

  // Distant geometry is fogged to the scene fog colour, which three mixes in
  // *after* the colour-space conversion. For a perfectly seamless horizon the
  // sky has to land on that same value, so blend to it in output space too.
  float horizonBlend = 1.0 - smoothstep(-0.012, 0.085, dir.y);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, horizonBlend);
}
`;

export interface SkyRig {
  mesh: THREE.Mesh;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ambient: THREE.AmbientLight;
  sunDirection: THREE.Vector3;
}

export function createSky(
  scene: THREE.Scene,
  worldSize: number,
  palette: SkyPalette = DEFAULT_SKY,
): SkyRig {
  const sunDirection = new THREE.Vector3(0.55, 0.62, 0.36).normalize();

  const geometry = new THREE.SphereGeometry(worldSize * 6, 48, 24);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: palette.zenith.clone() },
      uHorizon: { value: palette.horizon.clone() },
      uSunColor: { value: palette.sun.clone() },
      uSunDirection: { value: sunDirection.clone() },
      uFogColor: { value: palette.horizon.clone() },
    },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  scene.add(mesh);

  // Fog colour == horizon colour, so the terrain edge dissolves into the sky.
  //
  // three mixes fog in *after* the output colour-space conversion and therefore
  // uploads an already sRGB-encoded fogColor uniform. The sky shader blends to
  // the horizon in that same output space, so it needs the identically encoded
  // value — otherwise tone mapping leaves a hard seam exactly at eye level.
  const fogColor = palette.horizon.clone();
  scene.fog = new THREE.Fog(fogColor, worldSize * 0.95, worldSize * 3.0);
  fogColor.getRGB(material.uniforms.uFogColor.value as THREE.Color, THREE.SRGBColorSpace);
  scene.background = fogColor.clone();

  const sun = new THREE.DirectionalLight(0xfff2dd, 3.1);
  sun.position.copy(sunDirection).multiplyScalar(worldSize);
  sun.castShadow = true;
  const shadowExtent = worldSize * 0.8;
  sun.shadow.camera.left = -shadowExtent;
  sun.shadow.camera.right = shadowExtent;
  sun.shadow.camera.top = shadowExtent;
  sun.shadow.camera.bottom = -shadowExtent;
  sun.shadow.camera.near = worldSize * 0.2;
  sun.shadow.camera.far = worldSize * 2.4;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.25;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(palette.horizon.clone(), palette.ground.clone(), 0.62);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0xffffff, 0.12);
  scene.add(ambient);

  return { mesh, sun, hemi, ambient, sunDirection };
}
