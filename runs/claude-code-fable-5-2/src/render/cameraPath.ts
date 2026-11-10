/** Pure camera choreography: a slow orbit with gentle breathing of radius and height. */

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

/** Seconds for one full orbit around the island. */
export const ORBIT_PERIOD = 110;

export function cameraPoseAt(seconds: number, startAngle = 0.6): CameraPose {
  const angle = startAngle + (seconds / ORBIT_PERIOD) * Math.PI * 2;
  const radius = 268 + 34 * Math.sin(seconds * 0.043);
  const height = 78 + 16 * Math.sin(seconds * 0.031 + 1.3);
  return {
    position: [Math.cos(angle) * radius, height, Math.sin(angle) * radius],
    target: [6 * Math.sin(seconds * 0.021), 22, 6 * Math.cos(seconds * 0.017)],
  };
}
