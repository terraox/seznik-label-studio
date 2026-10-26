export type RingPaths = {
  /** Top centre, clockwise, to bottom centre. */
  right: string;
  /** Top centre, anticlockwise, to bottom centre. */
  left: string;
  /** Length of each half, for the dash-draw. */
  halfLength: number;
};

/** Rounded rectangle outline split at the top and bottom centre, so it can draw from both sides. */
export function ringPaths(width: number, height: number, radius: number, inset = 0.75): RingPaths {
  const cx = width / 2;
  const t = inset;
  const b = height - inset;
  const l = inset;
  const r = width - inset;
  const rad = radius - inset;
  const right = [
    `M ${cx} ${t}`,
    `H ${r - rad}`,
    `A ${rad} ${rad} 0 0 1 ${r} ${t + rad}`,
    `V ${b - rad}`,
    `A ${rad} ${rad} 0 0 1 ${r - rad} ${b}`,
    `H ${cx}`,
  ].join(' ');
  const left = [
    `M ${cx} ${t}`,
    `H ${l + rad}`,
    `A ${rad} ${rad} 0 0 0 ${l} ${t + rad}`,
    `V ${b - rad}`,
    `A ${rad} ${rad} 0 0 0 ${l + rad} ${b}`,
    `H ${cx}`,
  ].join(' ');
  const halfLength = 2 * (cx - inset - rad) + (b - t - 2 * rad) + Math.PI * rad;
  return { right, left, halfLength };
}
