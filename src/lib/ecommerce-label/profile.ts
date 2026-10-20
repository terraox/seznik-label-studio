/**
 * Ecommerce shipping labels — placing the label on a page from a row profile alone.
 *
 * The full detector costs about 100 ms a page on a phone, which is minutes for a 300-page file.
 * One page is analysed in full (the template). Every other page is read as a profile: for each
 * pixel row, how much of the label column is ink. Fixed layouts (Amazon, Flipkart) reuse the
 * template once their rules line up; Meesho's label height changes per page, so its bottom edge
 * is read from the horizontal rules. A page that does not fit returns null and goes through
 * the full detector.
 */

import type { NormRect } from '@/lib/pdf-editor/smart-crop';
import type { LocatedPage, PlatformId } from '@/lib/ecommerce-label/platforms';

/** Ink percent (0–100) of the label column, one entry per pixel row of the page. */
export type RowProfile = Uint8Array;

export type PageTemplate = {
  platform: PlatformId;
  label: NormRect;
  invoice: NormRect | null;
  /** Fixed layouts only: rows (fractions of the page) that were solid rules inside the label. */
  ruleRows: number[];
  /** Mean ink percent over the label's rows on the template page. */
  meanInk: number;
};

const SOLID = 85;
const PAD = 0.008;
const ROW_TOLERANCE = 2;

type Rule = { y: number; end: number };

/** Runs of solid rows, as fractions of the page. `end` is just past the last row of the run. */
export function ruleGroups(profile: RowProfile): Rule[] {
  const h = profile.length;
  const out: Rule[] = [];
  let start = -1;
  for (let i = 0; i <= h; i++) {
    const solid = i < h && profile[i] >= SOLID;
    if (solid && start < 0) start = i;
    if (!solid && start >= 0) {
      out.push({ y: start / h, end: i / h });
      start = -1;
    }
  }
  return out;
}

function meanInk(profile: RowProfile, y0: number, y1: number): number {
  const a = Math.max(0, Math.floor(y0 * profile.length));
  const b = Math.min(profile.length, Math.ceil(y1 * profile.length));
  if (b <= a) return 0;
  let sum = 0;
  for (let i = a; i < b; i++) sum += profile[i];
  return sum / (b - a);
}

function lastInkRow(profile: RowProfile, from: number): number {
  for (let i = profile.length - 1; i >= Math.floor(from * profile.length); i--) {
    if (profile[i] >= 2) return (i + 1) / profile.length;
  }
  return from;
}

export function buildTemplate(platform: PlatformId, found: LocatedPage, profile: RowProfile): PageTemplate {
  const y1 = found.label.y + found.label.h;
  return {
    platform,
    label: found.label,
    invoice: found.invoice,
    ruleRows: ruleGroups(profile)
      .filter((r) => r.y >= found.label.y && r.end <= y1)
      .map((r) => r.y),
    meanInk: meanInk(profile, found.label.y, y1),
  };
}

function fixedLayout(t: PageTemplate, profile: RowProfile): LocatedPage | null {
  if (t.ruleRows.length >= 3) {
    const rules = ruleGroups(profile);
    const tol = ROW_TOLERANCE / profile.length;
    const matched = t.ruleRows.filter((y) => rules.some((r) => Math.abs(r.y - y) <= tol)).length;
    if (matched / t.ruleRows.length < 0.7) return null;
  } else if (meanInk(profile, t.label.y, t.label.y + t.label.h) < t.meanInk * 0.4) {
    return null;
  }
  return { label: t.label, invoice: t.invoice };
}

function meesho(t: PageTemplate, profile: RowProfile): LocatedPage | null {
  const rules = ruleGroups(profile);
  if (rules.length < 2 || rules[0].y > 0.04) return null;

  // The invoice's title band starts a little under the label's bottom border.
  let bottom = -1;
  let invoiceTop = -1;
  for (let i = 1; i + 1 < rules.length; i++) {
    const gap = rules[i + 1].y - rules[i].y;
    if (rules[i].y > 0.25 && gap >= 0.018 && gap <= 0.032) {
      bottom = rules[i].end;
      invoiceTop = rules[i + 1].y;
      break;
    }
  }
  if (bottom < 0) {
    // Exchange labels have no invoice: the last rule is the label's bottom border.
    const last = rules[rules.length - 1];
    if (last.y < 0.3 || last.y > 0.55) return null;
    bottom = last.end;
  }

  const y = t.label.y;
  const label = { ...t.label, h: Math.min(1, bottom + PAD) - y };
  if (invoiceTop < 0 || !t.invoice) return { label, invoice: null };
  const invoiceBottom = Math.min(1, lastInkRow(profile, invoiceTop) + 0.004);
  return {
    label,
    invoice: { ...t.invoice, y: invoiceTop, h: Math.max(0.02, invoiceBottom - invoiceTop) },
  };
}

export function locateFromProfile(t: PageTemplate, profile: RowProfile): LocatedPage | null {
  return t.platform === 'meesho' ? meesho(t, profile) : fixedLayout(t, profile);
}
