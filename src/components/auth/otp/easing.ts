/** Small easing helpers that run on the UI thread. */

export function clamp01(x: number) {
  'worklet';
  return Math.min(1, Math.max(0, x));
}

/** Position of `t` inside the window [from, to], as 0..1. */
export function windowed(t: number, window: readonly [number, number]) {
  'worklet';
  return clamp01((t - window[0]) / (window[1] - window[0]));
}

export function easeOutCubic(x: number) {
  'worklet';
  return 1 - Math.pow(1 - x, 3);
}

export function easeInOutCubic(x: number) {
  'worklet';
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeInOutSine(x: number) {
  'worklet';
  return -(Math.cos(Math.PI * x) - 1) / 2;
}
