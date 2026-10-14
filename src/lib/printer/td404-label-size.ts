/**
 * TD-404 label-size scale. The firmware cannot report the size it measured, so
 * after calibrating on the gap we print a mm ruler down the feed direction.
 * No SIZE is sent (it would override the calibration), so the printer stops at
 * the real label edge and the last number printed is the label length.
 */

const DOTS_PER_MM = 12; // 304 dpi, matches the TD-404 pipeline (not 11.97, whole dots keep ticks aligned)
const MAX_MM = 150;
const RULER_X = 16;
const NUMBER_X = 84;
const TICK_DOTS = { mm: 16, five: 36, ten: 60 } as const;
const TICK_THICKNESS = 2;
const NUMBER_FONT = '2';

export function buildLabelSizeScaleJob(maxMm = MAX_MM): string {
  let job = 'GAPDETECT\r\nDENSITY 8\r\nSPEED 3\r\nCLS\r\n';
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
  job += 'PRINT 1,1\r\n';
  return job;
}
