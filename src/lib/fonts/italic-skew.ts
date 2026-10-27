/** Same shear as print (`ITALIC_SKEW` −0.2 → about −11.3°). Kept here so node tests can load this file without react-native. */
export const ITALIC_SHEAR_DEG = -11.3;

/**
 * Android reduces a view's transform to rotate + scale and drops any shear, so a single `skewX`
 * does nothing. A shear is the same as rotate → scale → rotate (its singular value decomposition),
 * so three nested views, each with a plain rotate or scale, draw the same slant.
 *
 *   M = Rot(outerDeg) · diag(scaleX, scaleY) · Rot(innerDeg)
 */
export type ItalicSkewChain = {
  outerDeg: number;
  scaleX: number;
  scaleY: number;
  innerDeg: number;
};

const RAD = 180 / Math.PI;

export function italicSkewChain(skewDeg: number = ITALIC_SHEAR_DEG): ItalicSkewChain {
  const k = Math.tan(skewDeg / RAD);
  // Matrix [[1, k], [0, 1]] in the screen's x-right, y-down coordinates.
  const e = 1;
  const f = 0;
  const g = k / 2;
  const h = -k / 2;
  const q = Math.hypot(e, h);
  const r = Math.hypot(f, g);
  const a1 = Math.atan2(g, f);
  const a2 = Math.atan2(h, e);
  return {
    outerDeg: ((a2 + a1) / 2) * RAD,
    scaleX: q + r,
    scaleY: q - r,
    innerDeg: ((a2 - a1) / 2) * RAD,
  };
}
