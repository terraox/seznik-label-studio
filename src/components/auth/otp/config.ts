/** Geometry shared by the typed boxes and the verified animation, so the hand-off is seamless. */
export const OTP_BOX = {
  height: 54,
  gap: 7,
  radius: 14,
  /** The single box the digits merge into. */
  badge: 54,
  badgeRadius: 16,
} as const;

/** Ocean blue. Kept separate from AUTH_COLORS so the animation can be retuned on its own. */
export const OTP_GLOW = {
  accent: '#1A9BFF',
  hot: '#4FC3FF',
  core: '#C9EEFF',
  fill: '#0C1B2A',
  /** Resting look of a typed box, which the animation starts from. */
  restBorder: '#3F3F45',
  restFill: '#242427',
  dimBorder: '#164A73',
  dimFill: '#13202D',
} as const;

/**
 * One clock, in milliseconds, drives the whole verified animation. Each part below is a window on
 * that clock, so retiming is a matter of editing numbers here.
 */
export const VERIFY_TIMELINE = {
  /** Blue line leaves the top of every box and runs round both sides to the bottom. */
  ring: [0, 520],
  /** Soft light spreads behind the row and builds to full. */
  haze: [0, 700],
  /** Boxes lean and slide together into one. */
  merge: [560, 920],
  /** Digits fade as the boxes start to move. */
  digits: [520, 700],
  /** The merged badge takes over from the boxes. */
  badge: [800, 920],
  /** Badge swells while the tick draws, then settles smaller. */
  swell: [900, 1180],
  settle: [1180, 1560],
  check: [980, 1280],
  /** Glow eases down to a calm resting level after the tick lands. */
  cool: [1200, 1700],
  /** The caller is told it is done here; the clock itself runs a little longer. */
  done: 1450,
  total: 1700,
} as const;

export const VERIFY_LEVELS = {
  badgeSwell: 1.12,
  badgeRest: 0.86,
  restGlow: 0.4,
  /** Largest lean, in radians, as the boxes slide together. */
  lean: 0.3,
} as const;
