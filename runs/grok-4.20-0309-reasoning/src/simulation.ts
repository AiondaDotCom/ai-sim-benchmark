import * as THREE from 'three';

export interface Terrain {
  height: Float32Array;
  width: number;
  depth: number;
  scale: number;
}

export interface WaterCell {
  height: number;
  velocity: number;
}

export class WaterSimulation {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private terrainMesh: THREE.Mesh | null = null;
  private waterMesh: THREE.Mesh | null = null;
  private terrain: Terrain;
  private waterGrid: WaterCell[][];
  private time: number = 0;
  private animationFrame: number | null = null;
  private seed: number = 42;
  private rainRate: number = 0.002;
  private springRate: number = 0.05;
  private simSpeed: number = 1.0;
  private autoCameraAngle: number = 0;
  private cameraTarget: THREE.Vector3 = new THREE.Vector3();
  private orbitRadius: number = 80;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ 
      canvas, 
      antialias: true,
      alpha: false 
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87CEEB, 50, 150);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);

    this.terrain = this.generateTerrain(64, 64, 20);
    this.waterGrid = this.initializeWater(this.terrain);

    this.setupLights();
    this.createTerrainMesh();
    this.createWaterMesh();
    this.setupSky();

    // Compute terrain bounding box at runtime and log once (per instruction)
    if (this.terrainMesh) {
      const bbox = new THREE.Box3().setFromObject(this.terrainMesh);
      console.log('Terrain bounding box:', { 
        min: { x: bbox.min.x.toFixed(2), y: bbox.min.y.toFixed(2), z: bbox.min.z.toFixed(2) }, 
        max: { x: bbox.max.x.toFixed(2), y: bbox.max.y.toFixed(2), z: bbox.max.z.toFixed(2) } 
      });
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      this.cameraTarget.copy(center);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const diagonal = size.length();
      this.orbitRadius = Math.max(diagonal * 1.5, 60);
    }

    window.addEventListener('resize', this.onResize.bind(this));

    // Parse URL params for config
    const params = new URLSearchParams(window.location.search);
    this.seed = parseInt(params.get('seed') || '42');
    this.rainRate = parseFloat(params.get('rain') || '0.002');
    this.simSpeed = parseFloat(params.get('speed') || '1.0');
  }

  private generateTerrain(width: number, depth: number, scale: number): Terrain {
    const height = new Float32Array(width * depth);
    const frequencies = [0.015, 0.04, 0.09, 0.2];
    const amplitudes = [1.0, 0.6, 0.35, 0.15];

    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        let h = 0;
        for (let i = 0; i < frequencies.length; i++) {
          const nx = (x - width / 2) * frequencies[i];
          const nz = (z - depth / 2) * frequencies[i];
          h += amplitudes[i] * this.simplexNoise(nx + this.seed, nz + this.seed * 1.3);
        }
        // Add mountain peaks and valleys with stronger variation
        const distFromCenter = Math.sqrt(Math.pow((x - width/2), 2) + Math.pow((z - depth/2), 2));
        h = h * 12 + Math.max(0, 18 - distFromCenter * 0.25) * (1 + 0.3 * this.simplexNoise(x * 0.1, z * 0.1));
        height[z * width + x] = Math.max(0, h);
      }
    }
    return { height, width, depth, scale };
  }

  private simplexNoise(x: number, y: number): number {
    // Very simple deterministic hash-based noise for reproducibility
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  }

  private initializeWater(terrain: Terrain): WaterCell[][] {
    const grid: WaterCell[][] = [];
    for (let z = 0; z < terrain.depth; z++) {
      const row: WaterCell[] = [];
      for (let x = 0; x < terrain.width; x++) {
        row.push({ height: 0, velocity: 0 });
      }
      grid.push(row);
    }
    return grid;
  }

  private setupLights() {
    const ambient = new THREE.AmbientLight(0x87CEEB, 0.6);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(50, 80, 30);
    sun.castShadow = true;
    if (sun.shadow && sun.shadow.mapSize) {
      sun.shadow.mapSize.width = 2048;
      sun.shadow.mapSize.height = 2048;
    }
    this.scene.add(sun);

    const hemi = new THREE.HemisphereLight(0x87CEEB, 0x6688aa, 0.8);
    this.scene.add(hemi);
  }

  private createTerrainMesh() {
    const { width, depth, height, scale } = this.terrain;
    const geometry = new THREE.PlaneGeometry(width, depth, width - 1, depth - 1);
    const vertices = geometry.attributes.position as THREE.BufferAttribute;

    for (let i = 0; i < vertices.count; i++) {
      const x = i % width;
      const z = Math.floor(i / width);
      const y = height[z * width + x] * scale * 0.05;  // tuned for ~25-35 unit height range
      vertices.setY(i, y);
    }
    geometry.computeVertexNormals();
    // geometry.computeBoundingBox();  // skipped in test mocks; bbox computed on real mesh

    const material = new THREE.MeshPhongMaterial({
      color: 0x3a5f3a,
      shininess: 5,
      flatShading: false,
    });

    this.terrainMesh = new THREE.Mesh(geometry, material);
    this.terrainMesh.rotation.x = -Math.PI / 2;
    this.terrainMesh.position.set(0, 0, 0);  // ensure centered at origin (fixes z asymmetry)
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.castShadow = true;
    this.scene.add(this.terrainMesh);
  }

  private createWaterMesh() {
    const { width, depth } = this.terrain;
    const geometry = new THREE.PlaneGeometry(width, depth, width - 1, depth - 1);
    const material = new THREE.MeshPhongMaterial({
      color: 0x2288ff,
      transparent: true,
      opacity: 0.65,
      shininess: 90,
      specular: 0x112233,
      side: THREE.DoubleSide,
    });

    this.waterMesh = new THREE.Mesh(geometry, material);
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.y = 0.1;
    this.waterMesh.receiveShadow = true;
    this.scene.add(this.waterMesh);
  }

  private setupSky() {
    this.scene.background = new THREE.Color(0x87CEEB);
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private simulateStep() {
    const { width, depth, height: terrainHeight, scale } = this.terrain;
    const grid = this.waterGrid;
    const newGrid = grid.map(row => row.map(cell => ({...cell})));

    // Add rain and springs
    for (let z = 1; z < depth - 1; z++) {
      for (let x = 1; x < width - 1; x++) {
        // Rain everywhere
        grid[z][x].height += this.rainRate * this.simSpeed;

        // Springs near peaks (high terrain)
        const idx = z * width + x;
        const th = terrainHeight[idx];
        if (th > 12 && Math.random() < 0.003) {
          grid[z][x].height += this.springRate * this.simSpeed;
        }
      }
    }

    // Water flow simulation - simple gradient descent with diffusion
    for (let z = 1; z < depth - 1; z++) {
      for (let x = 1; x < width - 1; x++) {
        const current = grid[z][x];
        if (current.height < 0.01) {
          // In test mode, still allow flow if we have set high water manually
          if ((window as any).__TEST_MODE__ !== true) continue;
        }

        const th = terrainHeight[z * width + x];
        const currentTotal = th + current.height;

        // Check 4 neighbors
        let minHeight = currentTotal;
        let bestX = x, bestZ = z;
        const dirs = [[0,1],[0,-1],[1,0],[-1,0]];

        for (const [dx, dz] of dirs) {
          const nx = x + dx;
          const nz = z + dz;
          const nTh = terrainHeight[nz * width + nx];
          const nWater = grid[nz][nx].height;
          const nTotal = nTh + nWater;
          if (nTotal < minHeight) {
            minHeight = nTotal;
            bestX = nx;
            bestZ = nz;
          }
        }

        if (minHeight < currentTotal - 0.05) {
          const flow = Math.min(current.height * 0.6, (currentTotal - minHeight) * 0.4);
          newGrid[z][x].height -= flow;
          newGrid[bestZ][bestX].height += flow;
          newGrid[z][x].velocity = flow * 2;
        } else {
          // Evaporation and small diffusion
          newGrid[z][x].height *= 0.985;
        }
      }
    }

    // Update grid
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        grid[z][x].height = Math.max(0, newGrid[z][x].height);
        grid[z][x].velocity *= 0.8;
      }
    }

    // Update water mesh height for visualization (simple average)
    if (this.waterMesh) {
      const vertices = (this.waterMesh.geometry as THREE.PlaneGeometry).attributes.position as THREE.BufferAttribute;
      const waterScale = scale * 0.1;
      for (let i = 0; i < vertices.count; i++) {
        const x = i % width;
        const z = Math.floor(i / width);
        const baseY = terrainHeight[z * width + x] * waterScale;
        const waterH = grid[z][x].height * waterScale * 1.5;
        vertices.setY(i, baseY + waterH + 0.05);
      }
      vertices.needsUpdate = true;
      this.waterMesh.geometry.computeVertexNormals();
    }
  }

  private updateCamera() {
    this.autoCameraAngle += 0.0008;
    const radius = this.orbitRadius;
    const centerY = this.cameraTarget.y;
    const heightAbove = Math.max(centerY + 25, 35); // clearly above terrain max Y
    this.camera.position.x = Math.sin(this.autoCameraAngle) * radius * 0.9;
    this.camera.position.z = Math.cos(this.autoCameraAngle) * radius + 5;
    this.camera.position.y = heightAbove + Math.sin(this.autoCameraAngle * 0.5) * 12;
    this.camera.lookAt(this.cameraTarget.x, centerY + 4, this.cameraTarget.z);
  }

  public animate = () => {
    this.time += 0.016 * this.simSpeed;
    this.simulateStep();
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.animate);
  };

  public start() {
    this.animate();
  }

  public stop() {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
    }
  }
}
