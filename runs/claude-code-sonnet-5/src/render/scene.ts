import * as THREE from 'three';
import { createSkyDome, FOG_COLOR } from './sky';

export interface SceneEnvironment {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  resize: () => void;
  dispose: () => void;
}

/** Sets up the renderer, scene, camera, sky, fog and lighting. No UI elements are created here. */
export function createSceneEnvironment(container: HTMLElement): SceneEnvironment {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true, // TEMP: needed for canvas.toDataURL() screenshot verification
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(FOG_COLOR, 1);
  container.appendChild(renderer.domElement);

  // render/cameraPath.ts computes camera distance analytically every frame so the
  // terrain's bounding box always fills a fixed fraction of frame (see cameraFillTarget
  // in config.ts) - the exact worst-case distance across every aspect ratio/elevation/
  // breathing combination was numerically swept (see debug/verify_framing.mjs) and
  // stays comfortably under ~1300 units. Sky dome, fog range and camera far-plane are
  // sized well beyond that so the camera always stays inside the dome and terrain never
  // gets fogged away.
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG_COLOR, 400, 1800);
  scene.add(createSkyDome(2000));

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 4000);
  camera.position.set(0, 150, 300);

  // Sun-like directional light for crisp terrain shading + shadows.
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
  sun.position.set(120, 180, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0015;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x4a3a2a, 0.75);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(ambient);

  function resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  window.addEventListener('resize', resize);

  function dispose(): void {
    window.removeEventListener('resize', resize);
    renderer.dispose();
  }

  return { renderer, scene, camera, resize, dispose };
}
