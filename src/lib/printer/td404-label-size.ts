/**
 * TD-404 label-size scale. The firmware cannot report the size it measured, so
 * we calibrate on the gap (separate write, see `buildLabelSizeCalibrateJob`) and
 * then print a mm ruler down the feed direction. Read the number printed at the
 * label edge (the gap) — that is the label length in mm.
 *
 * The ruler job carries the same header every other TD-404 job uses (SIZE, GAP,
 * DIRECTION, REFERENCE). A TSPL job with no SIZE is silently dropped by the
 * firmware, which is why this used to print nothing.
 */

const DOTS_PER_MM = 12; // 304 dpi, matches the TD-404 pipeline (not 11.97, whole dots keep ticks aligned)
const MAX_MM = 150;
const RULER_WIDTH_MM = 30;
const RULER_X = 16;
const NUMBER_X = 84;
const TICK_DOTS = { mm: 16, five: 36, ten: 60 } as const;
const TICK_THICKNESS = 2;
const NUMBER_FONT = '2';

/** Sent on its own, before the ruler: calibration blocks the printer while it feeds. */
export function buildLabelSizeCalibrateJob(): string {
  return '\r\nGAPDETECT\r\n';
}

/** Time to let the calibration feed finish before the ruler is sent. */
export const LABEL_SIZE_CALIBRATE_WAIT_MS = 3000;

export function buildLabelSizeScaleJob(maxMm = MAX_MM): string {
  let job =
    '\r\n' +
    `SIZE ${RULER_WIDTH_MM} mm,${maxMm + 2} mm\r\n` +
    'GAP 3 mm,0 mm\r\n' +
    'SPEED 3\r\n' +
    'DENSITY 8\r\n' +
    'DIRECTION 0,0\r\n' +
    'REFERENCE 0,0\r\n' +
    'CLS\r\n';
  // Spine along the feed direction.
  job += `BAR ${RULER_X},0,${TICK_THICKNESS},${maxMm * DOTS_PER_MM}\r\n`;
  for (let mm = 0; mm <= maxMm; mm += 1) {
    const y = mm * DOTS_PER_MM;
    const len = mm % 10 === 0 ? TICK_DOTS.ten : mm % 5 === 0 ? TICK_DOTS.five : TICK_DOTS.mm;
    job += `BAR ${RULER_X},${y},${len},${TICK_THICKNESS}\r\n`;
    if (mm > 0 && mm % 10 === 0) {
      job += `TEXT ${NUMBER_X},${y - 10},"${NUMBER_FONT}",0,1,1,"${mm}"\r\n`;
    }
  }
  job += 'PRINT 1\r\n';
  return job;
}
