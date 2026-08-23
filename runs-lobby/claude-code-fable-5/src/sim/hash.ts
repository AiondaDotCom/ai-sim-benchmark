/** FNV-1a hash over the full quantized simulation state (determinism tests). */
import type { World } from './world';
import { hashSlabs } from './damage';

function fnv(h: number, x: number): number {
  h ^= x & 0xff;
  h = Math.imul(h, 0x01000193) >>> 0;
  h ^= (x >>> 8) & 0xff;
  h = Math.imul(h, 0x01000193) >>> 0;
  h ^= (x >>> 16) & 0xff;
  h = Math.imul(h, 0x01000193) >>> 0;
  h ^= (x >>> 24) & 0xff;
  return Math.imul(h, 0x01000193) >>> 0;
}

const q = (x: number) => Math.round(x * 1000) | 0;

function hashStr(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) h = fnv(h, s.charCodeAt(i));
  return h;
}

export function hashWorld(w: World): number {
  let h = 0x811c9dc5;
  // B8: cladding damage is persistent simulation state
  h = hashSlabs(w.slabs, fnv, h);
  h = fnv(h, q(w.t));
  for (const a of w.actors.values()) {
    h = hashStr(h, a.id);
    h = hashStr(h, a.pose.action);
    h = fnv(h, q(a.pose.pos[0]));
    h = fnv(h, q(a.pose.pos[1]));
    h = fnv(h, q(a.pose.pos[2]));
    h = fnv(h, q(a.pose.yaw));
    h = fnv(h, q(a.pose.phase));
    h = fnv(h, a.alive ? 1 : 0);
  }
  for (const c of w.casings) {
    h = fnv(h, q(c.pos[0]));
    h = fnv(h, q(c.pos[1]));
    h = fnv(h, q(c.pos[2]));
    h = fnv(h, c.resting ? 1 : 0);
  }
  for (const d of w.debris) {
    h = fnv(h, q(d.pos[0]));
    h = fnv(h, q(d.pos[1]));
    h = fnv(h, q(d.pos[2]));
    h = fnv(h, q(d.size));
    h = fnv(h, d.resting ? 1 : 0);
  }
  for (const d of w.decals) {
    h = hashStr(h, d.surface);
    h = hashStr(h, d.kind);
    h = fnv(h, q(d.pos[0]));
    h = fnv(h, q(d.pos[1]));
    h = fnv(h, q(d.pos[2]));
    h = fnv(h, q(d.size));
  }
  for (const g of w.droppedGuns) {
    h = fnv(h, q(g.pos[0]));
    h = fnv(h, q(g.pos[2]));
    h = fnv(h, q(g.yaw));
  }
  return h >>> 0;
}
