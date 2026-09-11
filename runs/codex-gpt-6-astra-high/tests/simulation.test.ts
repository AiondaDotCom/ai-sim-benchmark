import {describe,it,expect} from 'vitest';
import {generateTerrain,type Terrain} from '../src/simulation/terrain';
import {WaterSimulation} from '../src/simulation/water';

function field(n:number,fn:(x:number,z:number)=>number):Terrain {
  return {size:n,width:n-1,spacing:1,heights:Float64Array.from({length:n*n},(_,i)=>fn(i%n,Math.floor(i/n))),springs:[],channels:[]};
}
describe('deterministic terrain',()=>{
  it('reproduces every elevation and spring from a seed',()=>{
    const a=generateTerrain(42,51),b=generateTerrain(42,51);
    expect(a.heights).toEqual(b.heights);expect(a.springs).toEqual(b.springs);
  });
  it('changes terrain for a different seed',()=>{
    expect(generateTerrain(42,51).heights).not.toEqual(generateTerrain(43,51).heights);
  });
  it('has finite elevations, mountain relief, and valid source cells',()=>{
    const t=generateTerrain();expect([...t.heights].every(Number.isFinite)).toBe(true);
    expect(Math.max(...t.heights)-Math.min(...t.heights)).toBeGreaterThan(25);
    expect(t.springs.every(s=>s.index>=0 && s.index<t.heights.length && t.heights[s.index]>12)).toBe(true);
  });
});
describe('water transport',()=>{
  it('conserves water on irregular closed terrain over many steps',()=>{
    const t=generateTerrain(7,35,34),w=new WaterSimulation(t,{springs:false});
    for(let i=0;i<w.depth.length;i++) w.depth[i]=i%13===0?1.4:0;
    const initial=w.volume;for(let i=0;i<600;i++) w.step(.05);
    expect(w.volume).toBeCloseTo(initial,8);expect(Math.min(...w.depth)).toBeGreaterThanOrEqual(0);
  });
  it('accounts for rainfall and spring input in physical volume units',()=>{
    const t=generateTerrain(9,25,48),w=new WaterSimulation(t,{rain:.002});
    for(let i=0;i<150;i++) w.step(.05);
    const expected=(t.heights.length*t.spacing**2*.002+11)*7.5;
    expect(w.volume).toBeCloseTo(expected,8);expect(w.addedVolume).toBeCloseTo(expected,8);
  });
  it('sends the first flow downhill, with no dry uphill transfer',()=>{
    const w=new WaterSimulation(field(9,x=>x),{springs:false});
    const center=4*9+4;w.depth[center]=.4;w.step(.05);
    expect(w.depth[center-1]).toBeGreaterThan(0);expect(w.depth[center+1]).toBe(0);
    expect(w.velocityX[center-1]).toBeLessThan(0);
  });
  it('retains water in a depression and levels its surface',()=>{
    const w=new WaterSimulation(field(9,(x,z)=>x<2||x>6||z<2||z>6?5:0),{springs:false});
    w.depth[4*9+4]=10;for(let i=0;i<2500;i++) w.step(.05);
    expect(w.volume).toBeCloseTo(10,9);
    const inside:number[]=[];
    for(let z=2;z<=6;z++)for(let x=2;x<=6;x++)inside.push(w.depth[z*9+x]);
    expect(Math.max(...inside)-Math.min(...inside)).toBeLessThan(.01);
    expect(w.depth[0]).toBe(0);
  });
  it('damps deep-water disturbances without checkerboard oscillation',()=>{
    const t=field(9,()=>0);t.spacing=.5;
    const w=new WaterSimulation(t,{springs:false});
    for(let i=0;i<w.depth.length;i++)w.depth[i]=5+(i%2===0?.2:-.2);
    const initial=w.volume;for(let i=0;i<600;i++)w.step(.05);
    expect(Math.max(...w.depth)-Math.min(...w.depth)).toBeLessThan(.001);
    expect(w.volume).toBeCloseTo(initial,9);
  });
  it('keeps a level lake at rest even over an uneven bed',()=>{
    const t=field(9,(x,z)=>(x+z)%3*.2),w=new WaterSimulation(t,{springs:false});
    for(let i=0;i<w.depth.length;i++)w.depth[i]=2-t.heights[i];
    const before=w.depth.slice();for(let i=0;i<100;i++)w.step(.05);
    expect(w.depth).toEqual(before);
  });
  it('rejects unstable or invalid time steps',()=>{
    const w=new WaterSimulation(field(5,()=>0));
    for(const dt of [0,-1,NaN,Infinity,.11])expect(()=>w.step(dt)).toThrow();
  });
});
