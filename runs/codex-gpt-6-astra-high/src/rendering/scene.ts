import * as THREE from 'three';
import { channelDistance, random, type Terrain } from '../simulation/terrain';
import type { WaterSimulation } from '../simulation/water';

export class AlpineScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(39, 1, 0.5, 700);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly waterGeometry: THREE.BufferGeometry;
  private readonly waterMaterial: THREE.ShaderMaterial;
  private readonly waterPositions: Float32Array;
  private readonly waterDepth: Float32Array;
  private readonly terrain: Terrain;
  private readonly sky: THREE.Mesh;
  private readonly resizeHandler = () => this.resize();

  constructor(terrain: Terrain, seed: number) {
    this.terrain = terrain;
    this.renderer = new THREE.WebGLRenderer({antialias: true, alpha: false});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor('#87ceeb');
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.domElement.setAttribute('aria-label', 'Autonomous alpine landscape with flowing streams and a growing lake');
    document.body.appendChild(this.renderer.domElement);
    this.scene.fog = new THREE.Fog('#b8dfe8', 210, 420);
    this.scene.add(new THREE.HemisphereLight('#e6f7ff', '#748967', 2.5));
    const sunlight = new THREE.DirectionalLight('#fff2d6', 3.3);
    sunlight.position.set(-65, 110, 45);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    Object.assign(sunlight.shadow.camera, {left:-85,right:85,top:85,bottom:-85,near:1,far:240});
    sunlight.shadow.bias = -0.00035;
    sunlight.shadow.normalBias = 0.12;
    this.scene.add(sunlight);

    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vPosition; void main(){vPosition=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec3 vPosition; void main(){float h=clamp(normalize(vPosition).y*.9+.12,0.,1.); gl_FragColor=vec4(mix(vec3(.74,.88,.91),vec3(.27,.62,.82),h),1.);}',
    }));
    this.sky = sky;
    this.scene.add(sky);

    const geometry = this.makeGrid();
    const positions = geometry.getAttribute('position');
    const colors = new Float32Array(positions.count * 3), color = new THREE.Color();
    const grass = new THREE.Color('#668b4f'), meadow = new THREE.Color('#9da567');
    const rock = new THREE.Color('#8c9188'), snow = new THREE.Color('#eff5ee'), shore = new THREE.Color('#b8ae86');
    for (let k = 0; k < positions.count; k++) {
      const h = terrain.heights[k], x = k % terrain.size, z = Math.floor(k / terrain.size);
      const east = terrain.heights[z * terrain.size + Math.min(x + 1, terrain.size - 1)];
      const south = terrain.heights[Math.min(z + 1, terrain.size - 1) * terrain.size + x];
      const slope = Math.hypot(east - h, south - h) / terrain.spacing;
      const wx = positions.getX(k), wz = positions.getZ(k);
      const channel = Math.min(...terrain.channels.map(p => channelDistance(wx,wz,p).distance));
      color.copy(grass).lerp(meadow, Math.max(0, Math.sin(wx * .17 + wz * .12)) * .5);
      if (h < 4.7 || channel < 1.65) color.lerp(shore, .85);
      color.lerp(rock, Math.min(1, Math.max(0, (h - 15) / 9, (slope - .75) * .55)));
      if (h > 26) color.lerp(snow, Math.min(1, (h - 26) / 3.6) * Math.max(.2, 1 - slope * .24));
      color.multiplyScalar(.94 + .06 * Math.sin(k * 13.317));
      color.toArray(colors, k * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({vertexColors:true, roughness:1, flatShading:true}));
    ground.receiveShadow = true; ground.castShadow = true;
    this.scene.add(ground);
    this.addCutaway();
    this.addForest(seed);

    this.waterGeometry = this.makeGrid();
    this.waterPositions = this.waterGeometry.getAttribute('position').array as Float32Array;
    this.waterDepth = new Float32Array(terrain.heights.length);
    this.waterGeometry.setAttribute('waterDepth', new THREE.BufferAttribute(this.waterDepth, 1));
    this.waterMaterial = new THREE.ShaderMaterial({
      transparent:true, depthWrite:true, side:THREE.DoubleSide,
      uniforms:{uTime:{value:0}, uSun:{value:sunlight.position.clone().normalize()}, uFog:{value:new THREE.Color('#b8dfe8')}},
      vertexShader: `attribute float waterDepth; varying float vDepth; varying vec3 vWorld; varying float vDistance;
        void main(){ vDepth=waterDepth; vec4 world=modelMatrix*vec4(position,1.); vWorld=world.xyz;
        vec4 view=modelViewMatrix*vec4(position,1.); vDistance=-view.z; gl_Position=projectionMatrix*view; }`,
      fragmentShader: `uniform float uTime; uniform vec3 uSun; uniform vec3 uFog; varying float vDepth; varying vec3 vWorld; varying float vDistance;
        void main(){
          if(vDepth<.018) discard;
          vec3 N=normalize(cross(dFdx(vWorld),dFdy(vWorld))); if(N.y<0.) N=-N;
          float rip=sin(vWorld.x*2.3+vWorld.z*1.8-uTime*3.3)*.018;
          N=normalize(N+vec3(rip,0.,cos(vWorld.z*2.7-vWorld.x*.8-uTime*2.8)*.025));
          vec3 V=normalize(cameraPosition-vWorld);
          float fresnel=pow(1.-max(dot(N,V),0.),3.);
          vec3 shallow=vec3(.035,.38,.36), deep=vec3(.009,.12,.16);
          vec3 col=mix(shallow,deep,1.-exp(-vDepth*.7));
          col=mix(col,vec3(.36,.68,.78),.12+fresnel*.35);
          float spec=pow(max(dot(N,normalize(V+uSun)),0.),140.);
          col+=vec3(1.,.98,.83)*spec*.45;
          float ribbon=pow(max(0.,sin(vWorld.z*3.+vWorld.x*1.5-uTime*5.)),16.);
          float rapids=clamp((1.-N.y)*4.,0.,.7)*ribbon;
          col=mix(col,vec3(.83,.96,.95),rapids);
          col=mix(col,uFog,smoothstep(210.,420.,vDistance));
          gl_FragColor=vec4(col,mix(.68,.96,smoothstep(.018,.3,vDepth)));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const water = new THREE.Mesh(this.waterGeometry,this.waterMaterial);
    water.frustumCulled = false; water.renderOrder = 2;
    this.scene.add(water);
    window.addEventListener('resize',this.resizeHandler);
    this.resize();
  }

  private makeGrid(): THREE.BufferGeometry {
    const {size:n,width,spacing,heights} = this.terrain;
    const positions = new Float32Array(n*n*3), indices: number[] = [];
    for(let z=0;z<n;z++) for(let x=0;x<n;x++) {
      const k=z*n+x;
      positions.set([x*spacing-width/2,heights[k],z*spacing-width/2],k*3);
      if(x<n-1 && z<n-1) indices.push(k,k+n,k+1,k+1,k+n,k+n+1);
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(positions,3));
    g.setIndex(indices); g.computeVertexNormals(); return g;
  }

  private addCutaway(): void {
    const {size:n,width,spacing,heights} = this.terrain;
    const edge: number[]=[];
    for(let x=0;x<n;x++) edge.push(x);
    for(let z=1;z<n;z++) edge.push(z*n+n-1);
    for(let x=n-2;x>=0;x--) edge.push((n-1)*n+x);
    for(let z=n-2;z>0;z--) edge.push(z*n);
    const p: number[]=[], c: number[]=[], indices:number[]=[];
    const top=new THREE.Color('#716f58'), middle=new THREE.Color('#8f8268'), bottom=new THREE.Color('#5c665d');
    edge.forEach((k,i)=>{
      const x=(k%n)*spacing-width/2,z=Math.floor(k/n)*spacing-width/2;
      p.push(x,heights[k]-.02,z,x,-.7,z,x,-5.5,z);
      top.toArray(c,i*9);middle.toArray(c,i*9+3);bottom.toArray(c,i*9+6);
      const a=i*3,b=((i+1)%edge.length)*3;
      indices.push(a,b,a+1,b,b+1,a+1,a+1,b+1,a+2,b+1,b+2,a+2);
    });
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.setIndex(indices);g.computeVertexNormals();
    this.scene.add(new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide})));
    const base=new THREE.Mesh(new THREE.BoxGeometry(width,1,width),new THREE.MeshStandardMaterial({color:'#5c665d',roughness:1}));
    base.position.y=-5.7;this.scene.add(base);
  }

  private addForest(seed:number):void {
    const rng=random(seed+51),{size:n,width,spacing,heights}=this.terrain;
    const trees:{x:number;y:number;z:number;s:number}[]=[];
    for(let attempt=0;attempt<5000 && trees.length<780;attempt++) {
      const x=(rng()-.5)*(width-7),z=(rng()-.5)*(width-7);
      const ix=Math.round((x+width/2)/spacing),iz=Math.round((z+width/2)/spacing),k=iz*n+ix,h=heights[k];
      const slope=Math.hypot(heights[k+1]-h,heights[k+n]-h)/spacing;
      const distance=Math.min(...this.terrain.channels.map(p=>channelDistance(x,z,p).distance));
      if(h<5.3 || h>18 || slope>.95 || distance<3 || rng()>.65) continue;
      trees.push({x,y:h-.2,z,s:.7+rng()*.8});
    }
    const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.12,.21,2,5),new THREE.MeshStandardMaterial({color:'#655541',roughness:1}),trees.length);
    const foliage=new THREE.InstancedMesh(new THREE.ConeGeometry(1.1,3.8,7),new THREE.MeshStandardMaterial({color:'#315e48',roughness:1,flatShading:true}),trees.length*2);
    const m=new THREE.Object3D(), tint=new THREE.Color();
    trees.forEach((t,i)=>{
      m.position.set(t.x,t.y+t.s,t.z);m.scale.setScalar(t.s);m.updateMatrix();trunks.setMatrixAt(i,m.matrix);
      for(let tier=0;tier<2;tier++) {
        m.position.y=t.y+(2.3+tier*1.3)*t.s;m.scale.setScalar(t.s*(1-tier*.24));m.updateMatrix();foliage.setMatrixAt(i*2+tier,m.matrix);
        tint.setHSL(.37+rng()*.025,.25+rng()*.15,.19+rng()*.07);foliage.setColorAt(i*2+tier,tint);
      }
    });
    trunks.castShadow=true;foliage.castShadow=true;foliage.receiveShadow=true;
    this.scene.add(trunks,foliage);
  }

  private resize():void {
    this.renderer.setSize(innerWidth,innerHeight);
    this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();
  }

  render(water:WaterSimulation,elapsed:number):void {
    for(let k=0;k<water.depth.length;k++) {
      this.waterDepth[k]=water.depth[k];
      this.waterPositions[k*3+1]=this.terrain.heights[k]+water.depth[k]+.035;
    }
    this.waterGeometry.getAttribute('position').needsUpdate=true;
    this.waterGeometry.getAttribute('waterDepth').needsUpdate=true;
    this.waterMaterial.uniforms.uTime.value=elapsed;
    // A broad, unhurried arc always keeps the lake in front of the mountain ridge.
    const angle=.18+Math.sin(elapsed*.035)*.46;
    const distance=190*Math.max(1, 1.12/this.camera.aspect);
    this.camera.position.set(Math.sin(angle)*distance,102+Math.sin(elapsed*.055)*4,Math.cos(angle)*distance);
    this.camera.lookAt(0,8,0);
    this.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene,this.camera);
  }

  dispose():void {
    window.removeEventListener('resize',this.resizeHandler);
    this.scene.traverse(object=>{
      if(object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials=Array.isArray(object.material)?object.material:[object.material];
        materials.forEach(material=>material.dispose());
      }
    });
    this.renderer.dispose();this.renderer.domElement.remove();
  }
}
