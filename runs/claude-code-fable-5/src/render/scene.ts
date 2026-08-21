import * as THREE from 'three';

export interface SceneBundle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

/** Renderer, scene, camera, lights, fog — no DOM UI besides the canvas. */
export function createScene(): SceneBundle {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  // Sky: gradient dome from a soft light blue at the horizon to a deeper
  // sky blue at the zenith (around #87CEEB), with matching fog so the
  // terrain blends naturally into the horizon.
  const horizonColor = new THREE.Color(0xcfe9f7);
  const zenithColor = new THREE.Color(0x4d9fdd);
  scene.background = horizonColor.clone();
  scene.fog = new THREE.Fog(horizonColor.clone(), 260, 620);
  scene.add(createSkyDome(horizonColor, zenithColor));

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);

  const sun = new THREE.DirectionalLight(0xfff2df, 2.4);
  sun.position.set(180, 240, 120);
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0xbcd8f5, 0x3d4a33, 0.9);
  scene.add(hemi);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera };
}

/** Large inward-facing sphere with a vertical horizon→zenith colour gradient. */
function createSkyDome(horizon: THREE.Color, zenith: THREE.Color): THREE.Mesh {
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      horizonColor: { value: horizon },
      zenithColor: { value: zenith },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      void main() {
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 horizonColor;
      uniform vec3 zenithColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        float t = smoothstep(-0.05, 0.55, h);
        gl_FragColor = vec4(mix(horizonColor, zenithColor, t), 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1;
  return mesh;
}
