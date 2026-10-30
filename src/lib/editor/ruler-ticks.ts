/**
 * Millimetre ruler ticks. Positions are in unzoomed artboard pixels so they
 * stay glued to the page edge; view zoom scales the whole pad together.
 */

export type RulerTickKind = 'minor' | 'mid' | 'major';

export type RulerTick = { mm: number; px: number; kind: RulerTickKind };

export function rulerTickPx(mm: number, lengthMm: number, contentPx: number): number {
  const length = Math.max(lengthMm, 0.01);
  const size = Math.max(contentPx, 1);
  return (mm / length) * size;
}

export function tickStepMm(lengthMm: number, sizePx: number): number {
  const pxPerMm = sizePx / Math.max(lengthMm, 0.01);
  if (pxPerMm >= 30) return 0.5;
  if (pxPerMm >= 3) return 1;
  if (pxPerMm >= 1.5) return 2;
  if (pxPerMm >= 0.8) return 5;
  return 10;
}

export function rulerTicksFor(lengthMm: number, sizePx: number): RulerTick[] {
  const length = Math.max(lengthMm, 0.01);
  const size = Math.max(sizePx, 1);
  const step = tickStepMm(lengthMm, size);
  const items: RulerTick[] = [];
  for (let mm = 0; mm <= lengthMm + 0.001; mm += step) {
    const px = rulerTickPx(mm, length, size);
    if (px > size + 0.5) break;
    const rounded = Math.round(mm * 100) / 100;
    const isMajor = rounded < 0.001 || Math.abs(rounded % 10) < 0.001;
    const isMid = !isMajor && Math.abs(rounded % 5) < 0.001;
    items.push({
      mm: rounded,
      px,
      kind: isMajor ? 'major' : isMid ? 'mid' : 'minor',
    });
  }
  return items;
}   


/** Smallest centre-to-centre gap (px) between two ruler numbers: a 3-digit number plus air. */
export const RULER_LABEL_GAP_H = 24;
/** Vertical numbers are one line (~11px) tall, so they can sit closer. */
export const RULER_LABEL_GAP_V = 14;

/**
 * Which major ticks get a number. The 0 mark and the last full major before the far edge always
 * do, so the end of the ruler is never left bare; the ones between are thinned left to right so
 * no two numbers touch. The far-edge tick itself (e.g. 100 on a 100mm label) is not numbered:
 * the artboard edge marks it.
 */
export function rulerLabelTicks(ticks: RulerTick[], minGapPx: number, lengthMm: number): RulerTick[] {
  const majors = ticks.filter((t) => t.kind === 'major' && Math.abs(t.mm - lengthMm) >= 0.01);
  if (majors.length <= 2) return majors;
  const first = majors[0];
  const last = majors[majors.length - 1];
  const kept: RulerTick[] = [first];
  for (const tick of majors.slice(1, -1)) {
    const prev = kept[kept.length - 1];
    if (tick.px - prev.px < minGapPx) continue;
    if (last.px - tick.px < minGapPx) continue;
    kept.push(tick);
  }
  if (last.px - kept[kept.length - 1].px >= minGapPx * 0.5) kept.push(last);
  return kept;
}
