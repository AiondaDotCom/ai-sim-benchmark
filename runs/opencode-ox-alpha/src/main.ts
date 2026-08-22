import * as THREE from "three";
import { parseConfig } from "./config";
import { Terrain } from "./terrain/terrain";
import { WaterSimulation } from "./water/simulation";
import { createTerrainMesh } from "./render/terrainMesh";
import { WaterMesh } from "./render/waterMesh";
import { createSky } from "./render/sky";
import { CameraRig } from "./render/cameraRig";

/**
 * Bootstrap: wires terrain -> simulation -> rendering together and runs the
 * fixed-step loop. Fully autonomous; all configuration comes from the URL.
 */
export function main(container: HTMLElement, query?: string): () => void {
  const config = parseConfig(query);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  // Sky + matching fog.
  createSky(scene);

  // Surrounding sea: hides the terrain-square edge and turns the map into
  // an island; fades into the fog at the horizon.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color("#2277ad"),
      roughness: 0.35,
      metalness: 0.1,
    }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -4;
  scene.add(sea);

  // Lights: warm sun plus soft sky fill.
  const sunDir = new THREE.Vector3(0.5, 0.8, 0.35).normalize();
  const sun = new THREE.DirectionalLight(0xfff2d9, 2.4);
  sun.position.copy(sunDir).multiplyScalar(300);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x5a5040, 0.8));

  // Terrain + water.
  const terrain = new Terrain({ seed: config.seed, gridN: config.gridN, size: config.size });
  const waterSim = new WaterSimulation(terrain);
  waterSim.setConfig({ rainRate: config.rainRate });

  scene.add(createTerrainMesh(terrain));
  const waterMesh = new WaterMesh(terrain);
  scene.add(waterMesh.mesh);

  // Camera.
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 2000);
  const rig = new CameraRig(
    new THREE.Vector3(0, (terrain.maxHeight - Math.abs(terrain.minHeight)) * 0.25, 0),
    config.size * 0.85,
    terrain.maxHeight * 1.15,
  );

  // Fixed-step simulation, render every frame.
  const dt = waterSim.config_.dt;
  let accumulator = 0;
  let elapsed = 0;
  let last = performance.now();
  let raf = 0;

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", onResize);

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const realDt = Math.min((now - last) / 1000, 0.1);
    last = now;
    elapsed += realDt;

    accumulator += realDt * config.simSpeed;
    while (accumulator >= dt) {
      waterSim.step();
      accumulator -= dt;
    }

    rig.update(camera, realDt);
    waterMesh.update(waterSim, elapsed);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    renderer.dispose();
    container.removeChild(renderer.domElement);
  };
}

const app = document.getElementById("app");
if (app) main(app);
