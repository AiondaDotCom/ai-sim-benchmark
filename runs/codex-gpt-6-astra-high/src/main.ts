import { generateTerrain } from './simulation/terrain';
import { WaterSimulation } from './simulation/water';
import { AlpineScene } from './rendering/scene';

const query=new URLSearchParams(location.search);
function numberParameter(name:string,fallback:number,min:number,max:number):number {
  const raw=query.get(name);if(raw===null || raw.trim()==='') return fallback;
  const value=Number(raw);return Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
}
const seed=Math.trunc(numberParameter('seed',7319,0,4294967295));
const speed=numberParameter('speed',3,.1,12);
const rain=numberParameter('rain',0,0,.003);
const terrain=generateTerrain(seed);
const water=new WaterSimulation(terrain,{rain});
const view=new AlpineScene(terrain,seed);
let last=performance.now(),elapsed=0,accumulator=0,frame=0,disposed=false;
const fixedStep=.05;

// A short hydrological pre-roll gives the opening frame established streams.
// It uses exactly the same solver and sources as the ongoing simulation.
view.render(water,0);
async function start():Promise<void> {
  for(let batch=0;batch<24;batch++) {
    if(disposed)return;
    for(let i=0;i<50;i++) water.step(fixedStep);
    view.render(water,0);
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
  }
  last=performance.now();
  const animate=(now:number)=>{
    if(disposed)return;
    const dt=Math.min((now-last)/1000,.08);last=now;elapsed+=dt;
    accumulator+=dt*speed;
    let steps=0;
    while(accumulator>=fixedStep && steps<20) {water.step(fixedStep);accumulator-=fixedStep;steps++;}
    view.render(water,elapsed);
    frame=requestAnimationFrame(animate);
  };
  frame=requestAnimationFrame(animate);
}
void start();
// Background tabs pause instead of accumulating a large catch-up burst.
const onVisibility=()=>{last=performance.now();accumulator=0;};
document.addEventListener('visibilitychange',onVisibility);
if(import.meta.hot) import.meta.hot.dispose(()=>{disposed=true;cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',onVisibility);view.dispose();});
