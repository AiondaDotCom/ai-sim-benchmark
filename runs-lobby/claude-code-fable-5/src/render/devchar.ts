/**
 * A11 look-dev harness: renders ONE character isolated on a neutral,
 * studio-lit turntable so the models can be judged on their own terms rather
 * than guessed at from wide shots of a dark teal hall.
 *
 * Dev-only, reached exclusively through query parameters; the demo path never
 * touches this module.
 *
 *   ?dev=char&who=man|woman|guard|soldier
 *          &view=front|side|back|three-quarter|face|hands
 *          &pose=idle|aim|run
 *          &silhouette=1     solid black figure on white — the silhouette
 *                            readability check a character artist runs
 *          &spin=<deg>       override the turntable angle directly
 */
import * as THREE from 'three';
import type { Mats } from './materials';
import { Character } from './characters';
import type { CharKind } from './characters';
import type { ActorSim } from '../sim/world';

export interface DevCharOptions {
  who: string;
  view: string;
  pose: string;
  silhouette: boolean;
  spin: number | null;
}

const KIND: Record<string, CharKind> = {
  man: 'neo', woman: 'trin', guard: 'guard', soldier: 'soldier',
};

/** Camera placements, in metres, around a figure standing at the origin. */
const VIEWS: Record<string, { eye: [number, number, number]; look: [number, number, number]; fov: number }> = {
  front: { eye: [0, 1.05, 4.2], look: [0, 1.0, 0], fov: 34 },
  side: { eye: [4.2, 1.05, 0], look: [0, 1.0, 0], fov: 34 },
  back: { eye: [0, 1.05, -4.2], look: [0, 1.0, 0], fov: 34 },
  'three-quarter': { eye: [2.7, 1.25, 3.1], look: [0, 1.0, 0], fov: 34 },
  face: { eye: [0.5, 1.68, 1.2], look: [0, 1.62, 0], fov: 30 },
  hands: { eye: [0.85, 1.15, 1.25], look: [0.15, 1.05, 0.1], fov: 30 },
};

function poseFor(kind: CharKind, pose: string): ActorSim {
  const base = { pos: [0, 0, 0] as [number, number, number], yaw: 0, phase: 0.5, speed: 0 };
  const id = kind === 'neo' ? 'neo' : kind === 'trin' ? 'trin' : 'dev';
  const role = kind === 'guard' ? 'guard' : kind === 'soldier' ? 'soldier' : 'protag';
  if (pose === 'aim') {
    return {
      id, role, alive: true,
      aim: [0, 1.35, 7],
      pose: { ...base, action: kind === 'soldier' ? 'cover' : 'shootAdvance', phase: 1 },
    } as ActorSim;
  }
  if (pose === 'run') {
    return {
      id, role, alive: true, aim: null,
      pose: { ...base, action: 'run', speed: 3.4 },
    } as ActorSim;
  }
  return { id, role, alive: true, aim: null, pose: { ...base, action: 'idle' } } as ActorSim;
}

/**
 * Build the isolated turntable scene. Returns a render callback; the caller
 * drives it from its own animation loop.
 */
export function buildDevChar(
  renderer: THREE.WebGLRenderer, mats: Mats, opt: DevCharOptions,
): () => void {
  const kind = KIND[opt.who] ?? 'neo';
  const scene = new THREE.Scene();
  const sil = opt.silhouette;

  // neutral studio backdrop: a large curved-feeling wall + floor, mid grey
  const backdropMat = new THREE.MeshStandardMaterial({
    color: sil ? 0xffffff : 0x6b6b6b, roughness: 0.95, metalness: 0,
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(24, 14), backdropMat);
  wall.position.set(0, 4, -5);
  scene.add(wall);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), backdropMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  for (const [x, rotY] of [[-8, Math.PI / 2], [8, -Math.PI / 2]] as const) {
    const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(24, 14), backdropMat);
    sideWall.position.set(x, 4, 0);
    sideWall.rotation.y = rotY;
    scene.add(sideWall);
  }
  if (sil) {
    // flat, shadowless white so only the outline carries information
    scene.add(new THREE.AmbientLight(0xffffff, 3.2));
  } else {
    // three-point studio rig: key, fill, rim — deliberately NOT the scene grade
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const keyL = new THREE.DirectionalLight(0xfff4e8, 2.6);
    keyL.position.set(3.5, 5, 4.5);
    scene.add(keyL);
    const fillL = new THREE.DirectionalLight(0xdfe8ff, 0.9);
    fillL.position.set(-4.5, 2.2, 3);
    scene.add(fillL);
    const rimL = new THREE.DirectionalLight(0xffffff, 3.4);
    rimL.position.set(-2.5, 3.4, -5);
    scene.add(rimL);
  }

  const character = new Character(kind, mats, scene);
  character.setGuns(opt.pose === 'aim');
  if (kind === 'neo') character.coatOpen = opt.pose === 'aim' ? 1 : 0;
  const actor = poseFor(kind, opt.pose);
  character.update(actor, 3.0);

  if (sil) {
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    character.rig.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = black;
    });
  }

  const v = VIEWS[opt.view] ?? VIEWS['three-quarter'];
  const camera = new THREE.PerspectiveCamera(
    v.fov, window.innerWidth / window.innerHeight, 0.05, 60,
  );
  camera.position.set(v.eye[0], v.eye[1], v.eye[2]);
  camera.lookAt(v.look[0], v.look[1], v.look[2]);

  if (opt.spin !== null) {
    character.rig.root.rotation.y = (opt.spin * Math.PI) / 180;
  }

  // the look-dev pass must not be judged through the scene's colour grade
  renderer.domElement.style.filter = 'none';
  renderer.setClearColor(sil ? 0xffffff : 0x6b6b6b, 1);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  return () => {
    character.update(actor, 3.0);
    if (opt.spin !== null) character.rig.root.rotation.y = (opt.spin * Math.PI) / 180;
    renderer.render(scene, camera);
  };
}
