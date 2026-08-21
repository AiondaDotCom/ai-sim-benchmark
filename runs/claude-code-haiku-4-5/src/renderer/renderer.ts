/**
 * Three.js renderer for water simulation visualization.
 */

import * as THREE from 'three';
import { SimulationState } from '../simulation/simulator.js';
import { Config } from '../config.js';

export class WaterSimulationRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private terrainMesh: THREE.Mesh;
  private waterMesh: THREE.Mesh;
  private time: number = 0;

  constructor(width: number, height: number) {
    // Scene setup with sky blue
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 500, 1000);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      width / height,
      0.1,
      10000
    );
    this.camera.position.set(100, 80, 100);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    document.body.appendChild(this.renderer.domElement);

    // Lighting
    const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    sunLight.position.set(100, 150, 100);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.far = 500;
    sunLight.shadow.camera.left = -200;
    sunLight.shadow.camera.right = 200;
    sunLight.shadow.camera.top = 200;
    sunLight.shadow.camera.bottom = -200;
    this.scene.add(sunLight);

    const skyLight = new THREE.HemisphereLight(0xb3d9ff, 0x80a080, 0.5);
    this.scene.add(skyLight);

    // Placeholder meshes (will be updated)
    this.terrainMesh = new THREE.Mesh();
    this.waterMesh = new THREE.Mesh();
    this.scene.add(this.terrainMesh);
    this.scene.add(this.waterMesh);

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());
  }

  private onWindowResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  updateTerrainVisualization(state: SimulationState): void {
    // Remove old mesh
    this.scene.remove(this.terrainMesh);

    const terrain = state.terrain;
    const geometry = new THREE.BufferGeometry();

    // Create vertices with 3.5x scale on x,z to make terrain much larger and visible
    const vertices: number[] = [];
    const indices: number[] = [];
    const scale = 3.5;

    for (let y = 0; y < terrain.height; y++) {
      for (let x = 0; x < terrain.width; x++) {
        const height = terrain.heights[y * terrain.width + x];
        vertices.push(
          (x - terrain.width / 2) * scale,
          height * scale, // CRITICAL FIX: scale height too, not just x/z!
          (y - terrain.height / 2) * scale
        );
      }
    }

    // Create indices for triangles
    for (let y = 0; y < terrain.height - 1; y++) {
      for (let x = 0; x < terrain.width - 1; x++) {
        const a = y * terrain.width + x;
        const b = y * terrain.width + (x + 1);
        const c = (y + 1) * terrain.width + x;
        const d = (y + 1) * terrain.width + (x + 1);

        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    // Compute normals
    geometry.setAttribute('position', new THREE.BufferAttribute(
      new Float32Array(vertices),
      3
    ));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    geometry.computeVertexNormals();

    // DEBUG: Check vertex relief
    const positions = geometry.attributes.position.array as Float32Array;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < positions.length; i += 3) {
      minY = Math.min(minY, positions[i]);
      maxY = Math.max(maxY, positions[i]);
    }
    console.log(`[TERRAIN] Vertex Y range: ${minY.toFixed(2)} to ${maxY.toFixed(2)} (relief: ${(maxY - minY).toFixed(2)})`);
    console.log(`[TERRAIN] Terrain heights in data: ${terrain.minHeight.toFixed(2)} to ${terrain.maxHeight.toFixed(2)}`);
    console.log(`[TERRAIN] Terrain scale factor: ${scale}`);

    // Material
    const material = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      metalness: 0.2,
      roughness: 0.8,
    });

    this.terrainMesh = new THREE.Mesh(geometry, material);
    this.terrainMesh.castShadow = true;
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);
  }

  updateWaterVisualization(state: SimulationState): void {
    // Remove old mesh
    this.scene.remove(this.waterMesh);

    const terrain = state.terrain;
    const water = state.water;
    const geometry = new THREE.BufferGeometry();

    const vertices: number[] = [];
    const indices: number[] = [];
    const scale = 3.5; // Must match terrain scale
    const waterThreshold = 0.15; // CRITICAL FIX: Raise threshold to skip uniform film, only show deep water

    // Create water surface mesh at terrain height + water height
    // Only add vertices where water exists
    const vertexMap: Map<number, number> = new Map();
    let vertexCount = 0;
    let cellsWithWater = 0;
    let totalCells = water.gridHeight * water.width;

    for (let y = 0; y < water.gridHeight; y++) {
      for (let x = 0; x < water.width; x++) {
        const terrainHeight = terrain.heights[y * terrain.width + x];
        const waterHeight = water.waterHeight[y * water.width + x];

        // Only render water where it's significant
        if (waterHeight > waterThreshold) {
          cellsWithWater++;
          const totalHeight = (terrainHeight + waterHeight) * scale; // CRITICAL FIX: scale total height!
          vertices.push(
            (x - terrain.width / 2) * scale,
            totalHeight,
            (y - terrain.height / 2) * scale
          );
          vertexMap.set(y * water.width + x, vertexCount);
          vertexCount++;
        }
      }
    }

    // DEBUG: Check water coverage
    const wetPercent = (cellsWithWater / totalCells) * 100;
    console.log(`[WATER] Wet cells: ${cellsWithWater}/${totalCells} (${wetPercent.toFixed(1)}%)`);
    if (cellsWithWater > 0) {
      let minWater = Infinity, maxWater = -Infinity;
      for (let i = 0; i < water.waterHeight.length; i++) {
        if (water.waterHeight[i] > 0) {
          minWater = Math.min(minWater, water.waterHeight[i]);
          maxWater = Math.max(maxWater, water.waterHeight[i]);
        }
      }
      console.log(`[WATER] Water height range: ${minWater.toFixed(4)} to ${maxWater.toFixed(4)}`);
    }

    // Create indices only for water cells
    for (let y = 0; y < water.gridHeight - 1; y++) {
      for (let x = 0; x < water.width - 1; x++) {
        const a = y * water.width + x;
        const b = y * water.width + (x + 1);
        const c = (y + 1) * water.width + x;
        const d = (y + 1) * water.width + (x + 1);

        const aIdx = vertexMap.get(a);
        const bIdx = vertexMap.get(b);
        const cIdx = vertexMap.get(c);
        const dIdx = vertexMap.get(d);

        // Only add triangles if all vertices have water
        if (aIdx !== undefined && bIdx !== undefined && cIdx !== undefined) {
          indices.push(aIdx, cIdx, bIdx);
        }
        if (bIdx !== undefined && cIdx !== undefined && dIdx !== undefined) {
          indices.push(bIdx, cIdx, dIdx);
        }
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(
      new Float32Array(vertices),
      3
    ));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    geometry.computeVertexNormals();

    // Water material - bright cyan, highly visible
    const material = new THREE.MeshStandardMaterial({
      color: 0x00BFFF, // Bright cyan
      metalness: 0.6,
      roughness: 0.3,
      transparent: true,
      opacity: 0.8,
      emissive: 0x0088FF,
      emissiveIntensity: 0.2,
    });

    this.waterMesh = new THREE.Mesh(geometry, material);
    this.waterMesh.castShadow = true;
    this.waterMesh.receiveShadow = true;
    this.scene.add(this.waterMesh);
  }

  updateCamera(config: Config, time: number, terrainMaxHeight?: number): void {
    const angle = time * config.cameraOrbitSpeed;

    // CRITICAL FIX: Derive camera from actual terrain bounds, not hardcoded values
    const terrainWidth = this.getTerrainWidth();
    const maxHeight = terrainMaxHeight || 100;
    const radius = Math.max(config.cameraOrbitRadius, terrainWidth * 1.2);
    const cameraHeight = maxHeight * 2.5; // Safely above terrain
    const lookAtHeight = maxHeight * 0.3; // Look at middle of terrain

    this.camera.position.x = Math.cos(angle) * radius;
    this.camera.position.y = cameraHeight;
    this.camera.position.z = Math.sin(angle) * radius;
    this.camera.lookAt(0, lookAtHeight, 0);
  }

  private getTerrainWidth(): number {
    // Get terrain width from first mesh in scene
    for (const child of this.scene.children) {
      if (child instanceof THREE.Mesh && child === this.terrainMesh) {
        const box = new THREE.Box3().setFromObject(child);
        return Math.max(
          box.max.x - box.min.x,
          box.max.z - box.min.z
        );
      }
    }
    return 256; // Default fallback
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  getDomElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }
}
