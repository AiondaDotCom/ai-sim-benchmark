import * as THREE from 'three';
import { hashString, mulberry32 } from '../simulation/random';
import { sampleTerrainHeight, type TerrainData } from '../simulation/terrain';
import type { WaterSimulation } from '../simulation/water';

const FOG_COLOR = new THREE.Color(0xd4edf3);

function createSkyGradientTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create the procedural sky texture.');

  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#62b6e3');
  gradient.addColorStop(0.16, '#b7dfec');
  gradient.addColorStop(0.24, '#d4edf3');
  gradient.addColorStop(0.42, '#d4edf3');
  gradient.addColorStop(1, '#b9ddcf');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function makeGridIndices(width: number, height: number): Uint32Array {
  const indices = new Uint32Array((width - 1) * (height - 1) * 6);
  let cursor = 0;
  for (let z = 0; z < height - 1; z += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const a = z * width + x;
      const b = a + 1;
      const c = a + width;
      const d = c + 1;
      indices[cursor++] = a;
      indices[cursor++] = c;
      indices[cursor++] = b;
      indices[cursor++] = b;
      indices[cursor++] = c;
      indices[cursor++] = d;
    }
  }
  return indices;
}

function terrainColor(height: number, normalizedHeight: number, slope: number): THREE.Color {
  const lowland = new THREE.Color(0x526f36);
  const alpine = new THREE.Color(0x78804b);
  const rock = new THREE.Color(0x77736a);
  const snow = new THREE.Color(0xe9eef0);
  const color = new THREE.Color();

  if (normalizedHeight < 0.42) {
    color.copy(lowland).lerp(alpine, normalizedHeight / 0.42);
  } else if (normalizedHeight < 0.72) {
    color.copy(alpine).lerp(rock, (normalizedHeight - 0.42) / 0.3);
  } else {
    color.copy(rock).lerp(snow, (normalizedHeight - 0.72) / 0.28);
  }
  if (slope > 2.4 && height > 7) color.lerp(rock, Math.min(0.68, (slope - 2.4) * 0.12));
  return color;
}

function createTerrainMesh(terrain: TerrainData): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(terrain.heights.length * 3);
  const colors = new Float32Array(terrain.heights.length * 3);
  const elevationRange = terrain.maxHeight - terrain.minHeight;

  for (let z = 0; z < terrain.height; z += 1) {
    for (let x = 0; x < terrain.width; x += 1) {
      const index = z * terrain.width + x;
      const positionOffset = index * 3;
      const height = terrain.heights[index];
      const left = terrain.heights[z * terrain.width + Math.max(0, x - 1)];
      const right = terrain.heights[z * terrain.width + Math.min(terrain.width - 1, x + 1)];
      const north = terrain.heights[Math.max(0, z - 1) * terrain.width + x];
      const south = terrain.heights[Math.min(terrain.height - 1, z + 1) * terrain.width + x];
      const slope = Math.hypot(right - left, south - north) / (2 * terrain.cellSize);
      const color = terrainColor(height, (height - terrain.minHeight) / elevationRange, slope);

      positions[positionOffset] = x * terrain.cellSize - terrain.worldSize / 2;
      positions[positionOffset + 1] = height;
      positions[positionOffset + 2] = z * terrain.cellSize - terrain.worldSize / 2;
      colors[positionOffset] = color.r;
      colors[positionOffset + 1] = color.g;
      colors[positionOffset + 2] = color.b;
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(makeGridIndices(terrain.width, terrain.height), 1));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.93,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

interface WaterVisual {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  positions: Float32Array;
  depthAttribute: THREE.BufferAttribute;
  flowAttribute: THREE.BufferAttribute;
}

function createWaterMesh(terrain: TerrainData): WaterVisual {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(terrain.heights.length * 3);
  const depths = new Float32Array(terrain.heights.length);
  const flows = new Float32Array(terrain.heights.length);
  const edgeFade = new Float32Array(terrain.heights.length);
  for (let z = 0; z < terrain.height; z += 1) {
    for (let x = 0; x < terrain.width; x += 1) {
      const index = z * terrain.width + x;
      positions[index * 3] = x * terrain.cellSize - terrain.worldSize / 2;
      positions[index * 3 + 1] = terrain.heights[index] + 0.06;
      positions[index * 3 + 2] = z * terrain.cellSize - terrain.worldSize / 2;
      edgeFade[index] = Math.min(1, Math.min(x, z, terrain.width - 1 - x, terrain.height - 1 - z) / 2.5);
    }
  }

  const depthAttribute = new THREE.BufferAttribute(depths, 1);
  const flowAttribute = new THREE.BufferAttribute(flows, 1);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aDepth', depthAttribute);
  geometry.setAttribute('aFlow', flowAttribute);
  geometry.setAttribute('aEdgeFade', new THREE.BufferAttribute(edgeFade, 1));
  geometry.setIndex(new THREE.BufferAttribute(makeGridIndices(terrain.width, terrain.height), 1));
  geometry.computeVertexNormals();

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uFogColor: { value: FOG_COLOR },
      uFogNear: { value: 155 },
      uFogFar: { value: 320 },
    },
    vertexShader: `
      attribute float aDepth;
      attribute float aFlow;
      attribute float aEdgeFade;
      varying float vDepth;
      varying float vFlow;
      varying float vEdgeFade;
      varying float vDistance;
      varying vec3 vWorldPosition;
      uniform float uTime;

      void main() {
        vec3 displaced = position;
        float wave = sin(position.x * 0.72 + uTime * 1.8) * cos(position.z * 0.57 - uTime * 1.4);
        displaced.y += wave * min(0.045, aDepth * 0.08);
        vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
        vDepth = aDepth;
        vFlow = aFlow;
        vEdgeFade = aEdgeFade;
        vWorldPosition = worldPosition.xyz;
        vec4 viewPosition = viewMatrix * worldPosition;
        vDistance = -viewPosition.z;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying float vDepth;
      varying float vFlow;
      varying float vEdgeFade;
      varying float vDistance;
      varying vec3 vWorldPosition;
      uniform float uTime;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;

      void main() {
        if (vDepth < 0.0015 || vEdgeFade < 0.04) discard;
        float deep = smoothstep(0.018, 0.34, vDepth);
        float moving = smoothstep(0.0005, 0.035, vFlow);
        float glint = pow(max(0.0, sin(vWorldPosition.x * 2.6 + vWorldPosition.z * 1.9 - uTime * 4.0)), 18.0);
        vec3 shallowColor = vec3(0.16, 0.72, 0.88);
        vec3 deepColor = vec3(0.025, 0.25, 0.47);
        vec3 color = mix(shallowColor, deepColor, deep);
        color = mix(color, vec3(0.69, 0.91, 0.96), glint * (0.16 + moving * 0.44));
        float alpha = (mix(0.5, 0.86, deep) + moving * 0.08) * smoothstep(0.04, 0.85, vEdgeFade);
        float fogFactor = smoothstep(uFogNear, uFogFar, vDistance);
        color = mix(color, uFogColor, fogFactor);
        gl_FragColor = vec4(color, alpha * (1.0 - fogFactor * 0.42));
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 3;
  return { mesh, positions, depthAttribute, flowAttribute };
}

interface RainVisual {
  points: THREE.Points;
  positions: Float32Array;
  speeds: Float32Array;
  random: () => number;
}

function createRain(terrain: TerrainData, seed: string): RainVisual {
  const count = 1300;
  const random = mulberry32(hashString(`${seed}:rain`));
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const x = (random() - 0.5) * terrain.worldSize * 1.08;
    const z = (random() - 0.5) * terrain.worldSize * 1.08;
    positions[index * 3] = x;
    positions[index * 3 + 1] = sampleTerrainHeight(terrain, x, z) + 4 + random() * 38;
    positions[index * 3 + 2] = z;
    speeds[index] = 15 + random() * 13;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xc7efff,
    size: 0.13,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.renderOrder = 2;
  return { points, positions, speeds, random };
}

function addTrees(scene: THREE.Scene, terrain: TerrainData, seed: string): void {
  const count = 430;
  const random = mulberry32(hashString(`${seed}:forest`));
  const geometry = new THREE.ConeGeometry(0.34, 1.9, 5);
  geometry.translate(0, 0.95, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0x274a2c, roughness: 1 });
  const trees = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const usableRange = terrain.maxHeight - terrain.minHeight;
  let placed = 0;

  for (let attempts = 0; attempts < count * 12 && placed < count; attempts += 1) {
    const x = (random() - 0.5) * terrain.worldSize * 0.9;
    const z = (random() - 0.5) * terrain.worldSize * 0.9;
    const y = sampleTerrainHeight(terrain, x, z);
    const elevation = (y - terrain.minHeight) / usableRange;
    if (elevation < 0.08 || elevation > 0.48 || random() > 0.82 - elevation) continue;
    const size = 0.72 + random() * 1.05;
    position.set(x, y - 0.03, z);
    scale.set(size, size, size);
    matrix.compose(position, quaternion, scale);
    trees.setMatrixAt(placed++, matrix);
  }
  trees.count = placed;
  trees.castShadow = true;
  trees.receiveShadow = true;
  scene.add(trees);
}

export class WorldRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(47, 1, 0.1, 600);
  private readonly waterVisual: WaterVisual;
  private readonly rainVisual: RainVisual;
  private readonly terrain: TerrainData;
  private readonly initialAngle: number;
  private readonly rainIntensity: number;

  constructor(container: HTMLElement, terrain: TerrainData, seed: string, rainIntensity: number) {
    this.terrain = terrain;
    this.rainIntensity = rainIntensity;
    this.initialAngle = mulberry32(hashString(`${seed}:camera`))() * Math.PI * 2;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.renderer.setClearColor(0x87ceeb, 1);
    this.scene.background = createSkyGradientTexture();
    this.scene.fog = new THREE.Fog(FOG_COLOR, 155, 320);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(900, 64),
      new THREE.MeshStandardMaterial({ color: 0x7f9b61, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.scene.add(createTerrainMesh(terrain));
    this.waterVisual = createWaterMesh(terrain);
    this.scene.add(this.waterVisual.mesh);
    this.rainVisual = createRain(terrain, seed);
    this.scene.add(this.rainVisual.points);
    addTrees(this.scene, terrain, seed);

    const hemisphere = new THREE.HemisphereLight(0xdaf2ff, 0x53603a, 2.1);
    this.scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(0xfff4d4, 3.3);
    sun.position.set(-70, 95, 45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -85;
    sun.shadow.camera.right = 85;
    sun.shadow.camera.top = 85;
    sun.shadow.camera.bottom = -85;
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 230;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);

    this.camera.position.set(105, 52, 105);
    this.camera.lookAt(0, 10, 0);
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  update(simulation: WaterSimulation, elapsed: number, frameDt: number): void {
    this.updateWater(simulation, elapsed);
    this.updateRain(frameDt);
    this.updateCamera(elapsed);
    this.renderer.render(this.scene, this.camera);
  }

  private readonly resize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private updateWater(simulation: WaterSimulation, elapsed: number): void {
    const depths = this.waterVisual.depthAttribute.array as Float32Array;
    const flows = this.waterVisual.flowAttribute.array as Float32Array;
    for (let index = 0; index < simulation.water.length; index += 1) {
      const visibleDepth = simulation.water[index];
      depths[index] = visibleDepth;
      flows[index] = simulation.flowMagnitude[index];
      this.waterVisual.positions[index * 3 + 1] = this.terrain.heights[index] + Math.max(0.045, visibleDepth);
    }
    (this.waterVisual.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.waterVisual.depthAttribute.needsUpdate = true;
    this.waterVisual.flowAttribute.needsUpdate = true;
    this.waterVisual.mesh.material.uniforms.uTime.value = elapsed;
  }

  private updateRain(frameDt: number): void {
    const { positions, speeds, random, points } = this.rainVisual;
    const material = points.material as THREE.PointsMaterial;
    material.opacity = this.rainIntensity > 0 ? Math.min(0.68, 0.3 + this.rainIntensity * 0.2) : 0;
    for (let index = 0; index < speeds.length; index += 1) {
      const offset = index * 3;
      positions[offset + 1] -= speeds[index] * frameDt;
      const groundHeight = sampleTerrainHeight(this.terrain, positions[offset], positions[offset + 2]);
      if (positions[offset + 1] < groundHeight + 0.15) {
        positions[offset + 1] = groundHeight + 28 + random() * 18;
      }
    }
    (points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateCamera(elapsed: number): void {
    const angle = this.initialAngle + elapsed * 0.032;
    const radius = 124 + Math.sin(elapsed * 0.075) * 8;
    const height = 50 + Math.sin(elapsed * 0.11) * 4;
    this.camera.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    this.camera.lookAt(
      Math.sin(elapsed * 0.045) * 5,
      9.5 + Math.sin(elapsed * 0.08) * 1.8,
      Math.cos(elapsed * 0.052) * 5,
    );
  }
}
