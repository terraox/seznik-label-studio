/**
 * Paper type → the sensor command each active printer actually sends.
 * Cardstock and Transparent have no SDK value; they use the label gap command.
 * Receipt sends the continuous command. That command is unconfirmed on hardware.
 */

import { JOSH_GAP_TYPE } from '@/lib/printer/josh-print';

export const PAPER_TYPES = ['Receipt', 'Label', 'Cardstock', 'Transparent', 'Black mark'] as const;

export type PaperPrinterId = 'josh' | 'td404' | 'dev';
export type PaperMedia = 'gap' | 'bline' | 'continuous';

const GAP_MIN_MM = 0;
const GAP_MAX_MM = 20;

export function paperPrinterId(flags: { isJosh: boolean; isDev: boolean }): PaperPrinterId {
  if (flags.isJosh) return 'josh';
  if (flags.isDev) return 'dev';
  return 'td404';
}

/** Receipt is continuous. Black mark is the mark sensor. Every other stock is gap paper. */
export function mediaForPaperType(paperType: string | null | undefined): PaperMedia {
  if (paperType === 'Receipt') return 'continuous';
  if (paperType === 'Black mark') return 'bline';
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
  /** LPAPI GAP_TYPE. 0 = GAP_NONE, 2 = GAP_GAP, 3 = GAP_BLACK. Never -1 for a chosen type. */
  joshGapType: number;
  /** LPAPI GAP_LENGTH, 0.01 mm. */
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
  const media = input.media ?? mediaForPaperType(input.paperType);
  const fallback = input.printer === 'td404' ? 2 : 3;
  const clamped = media === 'continuous' ? 0 : clampGapMm(input.gapMm, fallback);
  const gapMm = input.printer === 'dev' ? Math.max(0, Math.round(clamped)) : clamped;
  const joshGapType =
    media === 'continuous'
      ? JOSH_GAP_TYPE.receipt
      : media === 'bline'
        ? JOSH_GAP_TYPE.blackMark
        : JOSH_GAP_TYPE.label;
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

/** Log and label text. No trailing CRLF. */
export function formatPaperTypeSetting(command: PaperTypeCommand): string {
  if (command.printer === 'josh') {
    return `GAP_TYPE=${command.joshGapType} GAP_LENGTH=${command.joshGapLength01mm}`;
  }
  return command.mediaLine.replace(/\r\n$/, '');
}

/** Chip badge. Receipt and Black mark stay marked Test until a roll confirms them. */
export function paperTypeTestBadge(paperType: string): 'Test' | null {
  if (paperType === 'Receipt' || paperType === 'Black mark') return 'Test';
  return null;
}

/** Caption under the chips for the selected type. */
export function paperTypeSelectionNote(paperType: string): string | null {
  if (paperType === 'Receipt') return 'Test. Continuous feed. Gap length is 0 mm.';
  if (paperType === 'Black mark') return 'Test. Uses the black-mark sensor.';
  if (paperType === 'Cardstock' || paperType === 'Transparent') return 'Same gap as Label.';
  return null;
}
