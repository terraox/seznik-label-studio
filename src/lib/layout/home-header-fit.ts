/**
 * How much of the printer pill the home header can show.
 *
 * The header is a row: brand lockup, gap, pill. The lockup never shrinks, so whatever width is left
 * decides the pill's form. Deciding from the room actually left (not from a phone model or a width
 * bucket) is what keeps it right on every screen width, Display size and font size.
 *
 * Pure data so node:test can load it.
 */

export type PillVariant = 'full' | 'compact' | 'minimal';

/** Pill parts (dp) that do not depend on text: icon disc + gaps + padding + border. */
const PILL_CHROME = 32 + 9 + 9 + 16 + 2;
const CHEVRON = 14;
/** The pill's text column at font scale 1 ("Tap to connect" / "NOT CONNECTED"). */
const PILL_TEXT = 95;
/** The icon disc and the gap after it. */
const DISC = 32 + 9;
/** Text columns shrink to this fraction of their natural width before the pill drops parts. */
const MIN_TEXT_FRACTION = 0.8;

export function pillNaturalWidth(fontScale: number): number {
  return PILL_CHROME + CHEVRON + PILL_TEXT * fontScale;
}

export function pillVariant(available: number, fontScale: number): PillVariant {
  const full = pillNaturalWidth(fontScale);
  if (available >= full) return 'full';
  const compact = full - CHEVRON;
  if (available >= compact * MIN_TEXT_FRACTION) return 'compact';
  return 'minimal';
}

/** Room left for the pill in the header row. */
export function pillRoom(headerWidth: number, pad: number, brandWidth: number, gap: number): number {
  return headerWidth - pad * 2 - brandWidth - gap;
}

/** The pill width after dropping parts, for tests. */
export function pillWidth(variant: PillVariant, fontScale: number): number {
  const full = pillNaturalWidth(fontScale);
  if (variant === 'full') return full;
  if (variant === 'compact') return full - CHEVRON;
  return full - CHEVRON - DISC;
}

/** Width (dp) the brand lockup was drawn for; phones this wide or wider show it at full size. */
export const BRAND_REFERENCE_WIDTH = 393;
const BRAND_MIN_SCALE = 0.82;

/**
 * Size of the SEZNIK / LABEL STUDIO lockup (badge, both text lines, spacing) relative to its drawn
 * size. Full size on phones at least BRAND_REFERENCE_WIDTH wide; on narrower screens it shrinks in
 * proportion to the width, so badge and text keep the same proportions on every phone.
 */
export function brandScale(headerWidth: number): number {
  if (!(headerWidth > 0)) return 1;
  return Math.min(1, Math.max(BRAND_MIN_SCALE, headerWidth / BRAND_REFERENCE_WIDTH));
}
