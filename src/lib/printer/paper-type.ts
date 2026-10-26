/**
 * Paper type → the sensor command each active printer actually sends.
 * Josh: Label GAP_GAP, Receipt GAP_NONE, Transparent GAP_HOLE, Cardstock GAP_BLACK.
 * TD-404 / Dev: Label GAP n, Receipt GAP 0. Transparent and Cardstock print as Label there.
 * Receipt, Transparent and Cardstock are unconfirmed on hardware. The TSPL BLINE line stays
 * below but no paper type reaches it on TD-404 or Dev.
 */

import { readPaperType, type PaperType } from '@/lib/label-document';
import { JOSH_GAP_TYPE, joshGapTypeFromMedia } from '@/lib/printer/josh-print';

/** TD-404, Dev and the other TSPL-style printers. */
export const PAPER_TYPES = ['Label', 'Receipt'] as const satisfies readonly PaperType[];
/** Josh (LPAPI) has a sensor for each. */
export const JOSH_PAPER_TYPES = ['Label', 'Receipt', 'Transparent', 'Cardstock'] as const satisfies readonly PaperType[];

export type PaperPrinterId = 'josh' | 'td404' | 'dev';
/** 'hole' is Josh only. TSPL builders treat it as gap. */
export type PaperMedia = 'gap' | 'bline' | 'continuous' | 'hole';

/** TSPL has no hole sensor, so a Josh-only 'hole' media goes out as gap. */
export function tsplMedia(media: PaperMedia | null | undefined): 'gap' | 'bline' | 'continuous' {
  return media === 'bline' || media === 'continuous' ? media : 'gap';
}

/** Chips for the printer in use (printer-store sdkId). */
export function paperTypesFor(sdkId: string | null | undefined): readonly PaperType[] {
  return sdkId === 'josh' ? JOSH_PAPER_TYPES : PAPER_TYPES;
}

/** The chip to select: a type this printer does not offer shows as Label. The saved value is kept. */
export function shownPaperType(paperType: unknown, sdkId: string | null | undefined): PaperType {
  const type = readPaperType(paperType);
  return paperTypesFor(sdkId).includes(type) ? type : 'Label';
}

const GAP_MIN_MM = 0;
const GAP_MAX_MM = 20;

export function paperPrinterId(flags: { isJosh: boolean; isDev: boolean }): PaperPrinterId {
  if (flags.isJosh) return 'josh';
  if (flags.isDev) return 'dev';
  return 'td404';
}

/**
 * Receipt is continuous. On Josh, Transparent is the hole sensor and Cardstock the black-mark
 * sensor. Everything else, and Transparent / Cardstock on TD-404 and Dev, is gap paper.
 */
export function mediaForPaperType(
  paperType: string | null | undefined,
  printer: PaperPrinterId = 'td404',
): PaperMedia {
  const type = readPaperType(paperType);
  if (type === 'Receipt') return 'continuous';
  if (printer === 'josh' && type === 'Transparent') return 'hole';
  if (printer === 'josh' && type === 'Cardstock') return 'bline';
  return 'gap';
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampGapMm(value: number | null | undefined, fallback: number): number {
  const raw = value == null || !Number.isFinite(value) ? fallback : value;
  return round2(Math.min(GAP_MAX_MM, Math.max(GAP_MIN_MM, raw)));
}

/** Two-decimal millimetres, including 0.00. Matches the TD-404 native formatter. */
export function formatGapMm(mm: number): string {
  return (Math.round(mm * 100) / 100).toFixed(2);
}

export function joshGapLength01mm(gapMm: number): number {
  return Math.round(gapMm * 100);
}

/** TD-404 live path: `GAP 3.00 mm,0 mm` / `BLINE 3.50 mm,0 mm` / `GAP 0.00 mm,0 mm`. */
export function td404MediaLine(media: PaperMedia, gapMm: number): string {
  if (media === 'bline') return `BLINE ${formatGapMm(gapMm)} mm,0 mm\r\n`;
  if (media === 'continuous') return 'GAP 0.00 mm,0 mm\r\n';
  return `GAP ${formatGapMm(gapMm)} mm,0 mm\r\n`;
}

/** Dev TSPL path. Integer millimetres. Continuous is always `GAP 0`. */
export function devMediaLine(media: PaperMedia, gapMm: number): string {
  const gInt = Math.max(0, Math.round(gapMm));
  if (media === 'bline') return `BLINE ${gInt} mm,0 mm\r\n`;
  if (media === 'continuous') return 'GAP 0 mm,0 mm\r\n';
  return `GAP ${gInt} mm,0 mm\r\n`;
}

export type PaperTypeCommand = {
  printer: PaperPrinterId;
  media: PaperMedia;
  /** Millimetres written to the printer. Receipt is 0. Dev is the rounded integer. */
  gapMm: number;
  /** LPAPI GAP_TYPE. 0 = GAP_NONE, 1 = GAP_HOLE, 2 = GAP_GAP, 3 = GAP_BLACK. Never -1 for a chosen type. */
  joshGapType: number;
  /** LPAPI GAP_LENGTH, 0.01 mm. Receipt is 0 and native does not send it. */
  joshGapLength01mm: number;
  /** The one TSPL line that changes. Josh does not send it. Includes CRLF. */
  mediaLine: string;
};

export function paperTypeCommand(input: {
  printer: PaperPrinterId;
  paperType?: string | null;
  gapMm?: number | null;
  /** When set, this media wins over paperType. The label name never does. */
  media?: PaperMedia | null;
  /** Ignored. Present so tests can show the name does not retarget the sensor. */
  labelName?: string | null;
}): PaperTypeCommand {
  void input.labelName;
  const media = input.media ?? mediaForPaperType(input.paperType, input.printer);
  const fallback = input.printer === 'td404' ? 2 : 3;
  const clamped = media === 'continuous' ? 0 : clampGapMm(input.gapMm, fallback);
  const gapMm = input.printer === 'dev' ? Math.max(0, Math.round(clamped)) : clamped;
  const joshGapType = joshGapTypeFromMedia(media);
  const mediaLine =
    input.printer === 'dev' ? devMediaLine(media, gapMm) : td404MediaLine(media, gapMm);
  return {
    printer: input.printer,
    media,
    gapMm,
    joshGapType,
    joshGapLength01mm: joshGapLength01mm(gapMm),
    mediaLine,
  };
}

/** Log and label text. No trailing CRLF. Josh Receipt sends no GAP_LENGTH. */
export function formatPaperTypeSetting(command: PaperTypeCommand): string {
  if (command.printer === 'josh') {
    if (command.joshGapType === JOSH_GAP_TYPE.receipt) return `GAP_TYPE=${command.joshGapType}`;
    return `GAP_TYPE=${command.joshGapType} GAP_LENGTH=${command.joshGapLength01mm}`;
  }
  return command.mediaLine.replace(/\r\n$/, '');
}

/** Chip text. Cardstock (the black-mark sensor) is shown as Black mark; the saved value stays Cardstock. */
export function paperTypeLabel(paperType: string): string {
  return paperType === 'Cardstock' ? 'Black mark' : paperType;
}
