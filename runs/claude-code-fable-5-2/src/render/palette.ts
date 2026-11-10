/** Shared colours. The fog colour equals the sky's horizon colour so the sea melts into the sky. */
export const SKY_HORIZON = 0xb9e2f5;
export const SKY_MID = 0x87ceeb;
export const SKY_ZENITH = 0x5aa9e3;
export const FOG_COLOR = SKY_HORIZON;

/** Unit vector pointing towards the sun. */
export const SUN_DIRECTION: readonly [number, number, number] = (() => {
  const v: [number, number, number] = [0.52, 0.66, 0.38];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
})();
