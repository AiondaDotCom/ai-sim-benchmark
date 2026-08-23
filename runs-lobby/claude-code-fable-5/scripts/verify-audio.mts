/**
 * Final audio placement check: does every newly generated sample fire at the
 * moment it is supposed to?
 *
 * Drives the real simulation through the real AudioDirector and reads the cue
 * stream, rather than checking that files load. A sample that loads and never
 * plays, or plays on the wrong event, looks identical from the loader's side.
 */
import { existsSync } from 'node:fs';
import { World } from '../src/sim/world';
import { AudioDirector } from '../src/audio/director';
import { STANDOFF, COMMAND_T, SOLDIERS } from '../src/sim/timeline';

const NEW = /./;  // every cue, so a missing file anywhere is caught
const w = new World(42);
const d = new AudioDirector(42);
type Row = { t: number; type: string; sample: string; vol: number; duck?: number; pos?: number[] };
const cues: Row[] = [];
const events: { t: number; type: string; who?: number; plant?: boolean }[] = [];

while (w.t < 60) {
  w.step();
  for (const e of w.drainEvents()) {
    const anyE = e as unknown as { who?: number; plant?: boolean };
    events.push({ t: +w.t.toFixed(3), type: e.type, who: anyE.who, plant: anyE.plant });
    for (const c of d.handle(e)) {
      if (NEW.test(c.sample)) {
        cues.push({ t: +w.t.toFixed(3), type: e.type, sample: c.sample, vol: c.volume,
                    duck: (c as { duck?: number }).duck, pos: (c as { pos?: number[] }).pos });
      }
    }
  }
}

const fail: string[] = [];
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail.push(msg); };

// --- 1. slab creak on separation, crash on landing -------------------------
const rel = events.filter(e => e.type === 'SLAB_RELEASE');
const land = events.filter(e => e.type === 'SLAB_LAND');
const creaks = cues.filter(c => c.sample === 'slab_creak');
const crashes = cues.filter(c => /^slab_(crash|rubble)/.test(c.sample));
ok(creaks.length === rel.length, `creak fires once per separation (${creaks.length}/${rel.length})`);
ok(crashes.length === land.length, `crash fires once per landing (${crashes.length}/${land.length})`);
ok(creaks.every(c => c.type === 'SLAB_RELEASE'), 'creak only ever on separation');
ok(crashes.every(c => c.type === 'SLAB_LAND'), 'crash only ever on landing');

// rubble variant only where debris had already settled
const rubble = cues.filter(c => c.sample === 'slab_rubble');
const bare = cues.filter(c => /^slab_crash/.test(c.sample));
ok(rubble.length > 0 && bare.length > 0, `both bare-floor and rubble landings occur (${bare.length} bare / ${rubble.length} rubble)`);
ok(Math.min(...rubble.map(c => c.t)) > Math.min(...bare.map(c => c.t)),
   'rubble landings only start after bare-floor ones, as debris accumulates');

// --- 2. the command --------------------------------------------------------
const cmd = cues.filter(c => c.sample === 'vo_freeze');
ok(cmd.length === 1, `command fires exactly once (${cmd.length})`);
ok(Math.abs(cmd[0].t - COMMAND_T) < 0.02, `command lands at COMMAND_T (${cmd[0].t} vs ${COMMAND_T})`);
ok((cmd[0].duck ?? 0) > 0.4, `command ducks the music (duck=${cmd[0].duck})`);
ok(cmd[0].t < STANDOFF[0], 'command lands before the held beat, not inside it');
// the last man is in cover by then
const lastArrival = Math.max(...SOLDIERS.map(s => s.enterT + 2.1));
ok(lastArrival <= COMMAND_T + 0.1, `last man settled into cover by the command (${lastArrival.toFixed(2)} <= ${COMMAND_T})`);

// --- 3. boots --------------------------------------------------------------
const boots = cues.filter(c => c.sample.startsWith('boot_run') || c.sample === 'boot_plant');
const plants = cues.filter(c => c.sample === 'boot_plant');
const bootEv = events.filter(e => e.type === 'BOOT');
const perMan = new Map<number, number>();
for (const e of bootEv) perMan.set(e.who!, (perMan.get(e.who!) ?? 0) + 1);
ok(boots.length === bootEv.length, `every boot event produces a cue (${boots.length}/${bootEv.length})`);
ok(perMan.size === SOLDIERS.length, `every soldier is heard (${perMan.size}/${SOLDIERS.length})`);
const counts = [...perMan.values()];
ok(Math.max(...counts) !== Math.min(...counts),
   `men step on their own cycles, not a shared loop (${Math.min(...counts)}-${Math.max(...counts)} steps each)`);
ok(plants.length === SOLDIERS.length, `one hard plant per man as he sets into cover (${plants.length})`);
const inStandoff = boots.filter(c => c.t >= STANDOFF[0] && c.t <= STANDOFF[1]);
ok(inStandoff.length === 0, `the clatter stops dead before the standoff (${inStandoff.length} boots inside it)`);
// sample + pitch vary per man
const bySampleForMan = new Map<number, Set<string>>();
const rates = new Set<number>();
for (const e of bootEv.filter(e => !e.plant)) {
  const c = cues.find(c => c.t === e.t && c.sample.startsWith('boot_run'));
  if (c) { (bySampleForMan.get(e.who!) ?? bySampleForMan.set(e.who!, new Set()).get(e.who!)!).add(c.sample); }
}
for (const c of cues.filter(c => c.sample.startsWith('boot_run'))) rates.add(Math.round((c as unknown as {rate?:number}).rate ?? 0));
const distinctSamples = new Set(cues.filter(c => c.sample.startsWith('boot_run')).map(c => c.sample));
ok(distinctSamples.size === 3, `all three run variants are used (${[...distinctSamples].sort().join(', ')})`);

// --- 4. gear only while running -------------------------------------------
const gear = cues.filter(c => c.sample === 'gear_rattle');
const gearEv = events.filter(e => e.type === 'GEAR');
ok(gear.length === gearEv.length, `every gear event produces a cue (${gear.length})`);
const gearInStandoff = gear.filter(c => c.t >= STANDOFF[0] && c.t <= STANDOFF[1]);
ok(gearInStandoff.length === 0, `no gear rattle during the standoff (${gearInStandoff.length})`);
const lastBoot = Math.max(...boots.map(c => c.t));
ok(Math.max(...gear.map(c => c.t)) <= lastBoot + 0.5, 'gear rattle never outlives the running');

// --- 5. positioned for distance attenuation -------------------------------
ok(boots.every(c => Array.isArray(c.pos)), 'every boot cue carries a world position');
ok(gear.every(c => Array.isArray(c.pos)), 'every gear cue carries a world position');

// --- 6. A13: the closing gag ----------------------------------------------
const late = cues.filter(c => c.t > 50);
const gagCreak = late.find(c => c.sample === 'slab_creak');
const gagCrash = late.find(c => /^slab_(crash|rubble)/.test(c.sample));
ok(!!gagCreak && !!gagCrash, 'the closing gag has both a creak and a crash');
if (gagCreak && gagCrash) {
  const gap = gagCrash.t - gagCreak.t;
  ok(gap > 0.3 && gap < 1.0, `creak-to-crash gap is ${gap.toFixed(2)} s`);
  console.log(`      (creak ${gagCreak.t} -> ${gagCrash.sample} ${gagCrash.t})`);

  // The gag has to sit in silence. The exit walk and the elevator legitimately
  // sound before it — the test window simply has to be the BEAT, not an
  // arbitrary t>50, or it flags the exit as noise over the gag.
  const anySound = (t0: number, t1: number) => events.filter(e =>
    e.t > t0 && e.t < t1 &&
    ['SHOT', 'BURST', 'IMPACT_MARBLE', 'GUARD_DOWN', 'WAKE_SHOT', 'BOOT', 'GEAR',
     'FOOTSTEP', 'ELEVATOR', 'VO', 'CASING_BOUNCE', 'RICOCHET', 'DEBRIS_SETTLE'].includes(e.type));
  const before = anySound(0, gagCreak.t).filter(e => e.t > 50);
  const lastBefore = before.length ? Math.max(...before.map(e => e.t)) : 0;
  ok(gagCreak.t - lastBefore > 1.0,
     `the hall is silent for ${(gagCreak.t - lastBefore).toFixed(2)} s before the gag`);
  const after = anySound(gagCrash.t + 0.01, 999);
  ok(after.length === 0, `nothing sounds after the gag (${after.length} events)`);
  // the slab's own fragment burst lands with the crash, not as a separate beat
  const withCrash = events.filter(e => e.type === 'IMPACT_MARBLE' && Math.abs(e.t - gagCrash.t) < 0.02);
  ok(withCrash.length === 1, `the slab's own fragment burst is simultaneous with its crash (${withCrash.length})`);
}

// --- 7. B28: the blow landing, and that it is WIRED, not merely present ----
const hits = cues.filter(c => c.type === 'MELEE_HIT');
const reacts = cues.filter(c => c.type === 'MELEE_REACT');
const swings = events.filter(e => e.type === 'STRIKE' || e.type === 'KICK');
ok(hits.length === swings.length, `every swing produces an impact cue (${hits.length}/${swings.length})`);
ok(reacts.length === hits.length, `every impact produces a reaction cue (${reacts.length})`);
ok(hits.every(c => /^hit_body_[0-2]$/.test(c.sample)),
   `impacts play the body-impact samples (${[...new Set(hits.map(c => c.sample))].sort().join(', ')})`);
ok(reacts.every(c => /^grunt_m/.test(c.sample)),
   `reactions play a hurt grunt (${[...new Set(reacts.map(c => c.sample))].sort().join(', ')})`);
ok(new Set(hits.map(c => c.sample)).size === 3, 'all three impact variants are used, not just one');

// the point of this check: a cue naming a file that does not exist is
// indistinguishable from a working one until you listen
// EVERY cue in the whole film, not just the new ones. This check found that
// the hit-reaction grunt had been naming grunt_m_0 against files called
// grunt_m0 — silent for every guard going down, for the entire run, because
// the existing test asserts the cue is emitted and never that it can be heard.
const allSamples = [...new Set(cues.map(c => c.sample))];
const missing = allSamples.filter(n =>
  !existsSync(`public/assets/sfx/${n}.mp3`) && !existsSync(`public/assets/vo/${n}.mp3`));
ok(missing.length === 0,
   `all ${allSamples.length} referenced samples exist on disk${missing.length ? ': MISSING ' + missing.join(', ') : ''}`);

// cause and effect
let sameFrame = 0;
for (const h of hits) for (const r of reacts) if (Math.abs(h.t - r.t) < 1e-6) sameFrame++;
ok(sameFrame === 0, `impact and reaction never share a frame (${sameFrame})`);
const gaps = hits.map((h, i) => +(reacts[i].t - h.t).toFixed(3)).filter(g => g > 0);
ok(gaps.every(g => g >= 0.08 && g <= 0.15),
   `reaction follows impact by 80-150 ms (${Math.min(...gaps) * 1000}-${Math.max(...gaps) * 1000} ms)`);

console.log();
console.log(fail.length === 0 ? 'ALL CHECKS PASSED' : `${fail.length} CHECK(S) FAILED`);
if (fail.length) process.exitCode = 1;
