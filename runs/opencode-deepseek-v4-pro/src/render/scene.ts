import * as THREE from 'three';
import { AutoOrbit } from './camera';

/** Sky / atmosphere palette. Fog uses the horizon colour so land fades into sky. */
const HORIZON = new THREE.Color(0xc9e7f5);
const ZENITH = new THREE.Color(0x3f8fd4);

export interface SceneHandle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  orbit: AutoOrbit;
  resize: () => void;
  updateWater: (depth: ArrayLike<number>) => void;
  render: () => void;
}

function terrainColor(h: number, slope: number): THREE.Color {
  const c = new THREE.Color();
  if (slope > 0.6) {
    c.setHSL(0.06, 0.14, 0.45 + slope * 0.25);
  } else if (h > 0.8) {
    c.setHSL(0.58, 0.12, 0.93);
  } else if (h > 0.58) {
    c.setHSL(0.11, 0.24, 0.47);
  } else if (h > 0.28) {
    c.setHSL(0.26, 0.5, 0.4);
  } else {
    c.setHSL(0.32, 0.4, 0.28);
  }
  return c;
}

/** Force all vertex normals to point "up" regardless of winding order. */
function normaliseUpwards(geo: THREE.BufferGeometry): void {
  const n = geo.attributes.normal as THREE.BufferAttribute;
  for (let i = 1; i < n.count * 3; i += 3) {
    if (n.getY(i / 3) < 0) {
      n.setX(i / 3, -n.getX(i / 3));
      n.setY(i / 3, -n.getY(i / 3));
      n.setZ(i / 3, -n.getZ(i / 3));
    }
  }
  n.needsUpdate = true;
}

const WATER_VERTEX = /* glsl */ `
attribute float aDepth;
varying float vDepth;
varying vec3 vWorldPos;
varying vec3 vNormalW;

void main() {
  vDepth = aDepth;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const WATER_FRAGMENT = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uAlphaGain;
varying float vDepth;
varying vec3 vWorldPos;
varying vec3 vNormalW;

void main() {
  float depth = max(vDepth, 0.0);

  if (depth < 0.0005) discard; // dry land stays dry

  // Deep blue for lakes, pale turquoise for thin sheets / streams.
  vec3 shallow = vec3(0.38, 0.71, 0.93);
  vec3 deep = vec3(0.02, 0.16, 0.42);
  vec3 base = mix(shallow, deep, clamp(depth / 0.03, 0.0, 1.0));

  vec3 N = normalize(vNormalW);
  float diff = max(dot(N, uSunDir), 0.0);

  vec3 col = base * (0.78 + 0.4 * diff);

  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 halfDir = normalize(uSunDir + viewDir);
  float spec = pow(max(dot(N, halfDir), 0.0), 80.0);
  col += uSunColor * spec * 0.4;

  float alpha = 1.0 - exp(-depth * uAlphaGain);
  alpha = clamp(alpha, 0.0, 0.92);

  gl_FragColor = vec4(col, alpha);
}
`;

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uZenith;
varying vec3 vDir;
void main() {
  float h = clamp(normalize(vDir).y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createScene(
  container: HTMLElement,
  size: number,
  heights: Float32Array,
  heightScale: number
): SceneHandle {
  const width = container.clientWidth;
  const height = container.clientHeight;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = HORIZON.clone();
  scene.fog = new THREE.Fog(HORIZON.getHex(), size * 1.1, size * 4.2);

  const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, size * 30);
  camera.position.set(0, size * 0.22, size * 0.85);

  // ---- Lights ------------------------------------------------------------
  const sunDir = new THREE.Vector3(0.55, 0.62, 0.35).normalize();

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xbfe0ff, 0x55744a, 1.5);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.copy(sunDir).multiplyScalar(size * 2);
  scene.add(sun);

  // Soft fill from the opposite side to keep the shadowed faces readable.
  const fill = new THREE.DirectionalLight(0xc6d9ec, 1.0);
  fill.position.set(-sunDir.x, 0.2, -sunDir.z).multiplyScalar(size * 2);
  scene.add(fill);

  // ---- Sky dome ----------------------------------------------------------
  const skyGeo = new THREE.SphereGeometry(size * 20, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uHorizon: { value: HORIZON.clone() },
      uZenith: { value: ZENITH.clone() }
    },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -1;
  scene.add(sky);

  // ---- Terrain -----------------------------------------------------------
  const terrainGeo = new THREE.PlaneGeometry(size - 1, size - 1, size - 1, size - 1);
  const half = (size - 1) / 2;
  const pos = terrainGeo.attributes.position as THREE.BufferAttribute;
  for (let v = 0; v < pos.count; v++) {
    const ix = v % size;
    const iy = Math.floor(v / size);
    pos.setX(v, ix - half);
    pos.setY(v, heights[v] * heightScale);
    pos.setZ(v, iy - half);
  }
  terrainGeo.computeVertexNormals();
  normaliseUpwards(terrainGeo);

  const colors = new Float32Array(pos.count * 3);
  {
    const n = terrainGeo.attributes.normal as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      const slope = 1 - n.getY(v);
      terrainColor(heights[v], slope).toArray(colors, v * 3);
    }
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.0,
    side: THREE.DoubleSide
  });
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  scene.add(terrain);

  // ---- Water -------------------------------------------------------------
  const baseY = new Float32Array(pos.count);
  for (let v = 0; v < pos.count; v++) baseY[v] = heights[v] * heightScale;

  const waterGeo = new THREE.PlaneGeometry(size - 1, size - 1, size - 1, size - 1);
  const wPos = waterGeo.attributes.position as THREE.BufferAttribute;
  for (let v = 0; v < wPos.count; v++) {
    const ix = v % size;
    const iy = Math.floor(v / size);
    wPos.setX(v, ix - half);
    wPos.setY(v, baseY[v]);
    wPos.setZ(v, iy - half);
  }
  const depthAttr = new Float32Array(wPos.count);
  waterGeo.setAttribute('aDepth', new THREE.BufferAttribute(depthAttr, 1));
  waterGeo.computeVertexNormals();
  normaliseUpwards(waterGeo);

  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: sunDir.clone() },
      uSunColor: { value: new THREE.Color(0xffffff) },
      uAlphaGain: { value: 120 }
    },
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.renderOrder = 1;
  scene.add(water);

  // ---- Orbit / camera ----------------------------------------------------
  const center = new THREE.Vector3(0, size * 0.05, 0);
  const orbit = new AutoOrbit(center, size * 0.62, size * 0.34);
  orbit.apply(camera);

  const updateWater = (depth: ArrayLike<number>): void => {
    for (let v = 0; v < wPos.count; v++) {
      wPos.setY(v, baseY[v] + depth[v] * heightScale);
      depthAttr[v] = depth[v];
    }
    wPos.needsUpdate = true;
    (waterGeo.attributes.aDepth as THREE.BufferAttribute).needsUpdate = true;
    waterGeo.computeVertexNormals();
    normaliseUpwards(waterGeo);
  };

  const resize = (): void => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };

  return {
    renderer,
    scene,
    camera,
    orbit,
    resize,
    updateWater,
    // Apply the orbit to the camera every frame (keeps the camera in sync even
    // though orbit.update() only advances the angle).
    render: () => {
      orbit.apply(camera);
      renderer.render(scene, camera);
    }
  };
}