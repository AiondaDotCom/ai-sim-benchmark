import { Color } from 'three';

/**
 * Shared colours. The fog colour is identical to the sky's horizon colour so
 * distant terrain melts seamlessly into the sky.
 */
export const SKY_ZENITH = new Color('#3f8fd8');
export const SKY_HORIZON = new Color('#a3d8ef');
export const SKY_GROUND = new Color('#b9e1f2');
export const FOG_COLOR = SKY_HORIZON;
export const SUN_COLOR = new Color('#fff4df');
