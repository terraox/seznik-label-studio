import type { ExportSummary } from './export';
import type { MissingItem, MissingKind } from './schema';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Shared 'Name' - 3 images, no data" */
export function shareResultLine(name: string, summary: ExportSummary): string {
  const parts = [plural(summary.images, 'image')];
  if (summary.userClipart > 0) parts.push(`${summary.userClipart} own clipart`);
  if (summary.fontFiles > 0) parts.push(`${summary.fontFiles} font${summary.fontFiles === 1 ? '' : 's'}`);
  parts.push('no data');
  return `Shared '${name}' - ${parts.join(', ')}`;
}

const TYPE_NAMES: Record<string, [string, string]> = {
  text: ['text', 'texts'],
  barcode: ['barcode', 'barcodes'],
  qrcode: ['QR code', 'QR codes'],
  line: ['line', 'lines'],
  shape: ['shape', 'shapes'],
  table: ['table', 'tables'],
  time: ['time', 'times'],
  arctext: ['arc text', 'arc texts'],
  degrees: ['serial', 'serials'],
  image: ['image', 'images'],
  clipart: ['clipart', 'clipart'],
  border: ['border', 'borders'],
  signature: ['signature', 'signatures'],
};

/** "3 texts, 1 QR code, 2 shapes" */
export function countsLine(counts: Record<string, number>): string {
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([type, n]) => `${n} ${(TYPE_NAMES[type] ?? [type, type])[n === 1 ? 0 : 1]}`);
  return parts.length ? parts.join(', ') : 'no elements';
}

const KIND_TITLES: Record<MissingKind, string> = {
  'element-type': 'Skipped (this app does not know them)',
  'element-invalid': 'Skipped (damaged)',
  image: 'Pictures missing from the file',
  clipart: 'Clipart this app does not have',
  'user-clipart': "Sender's own clipart missing",
  'border-style': 'Border styles this app does not have',
  font: 'Fonts not on this phone',
  outline: 'Label outline',
  background: 'Background picture',
  'reference-image': 'Guide photo',
};

export type MissingGroup = { title: string; items: MissingItem[] };

/** Group the missing items for the import screen, in a stable order. */
export function groupMissing(missing: readonly MissingItem[]): MissingGroup[] {
  const order = Object.keys(KIND_TITLES) as MissingKind[];
  return order
    .map((kind) => ({ title: KIND_TITLES[kind], items: missing.filter((m) => m.kind === kind) }))
    .filter((g) => g.items.length > 0);
}

/**
 * The note shown once an imported label is open. Fonts come first: a font the phone lacks keeps its
 * name, but the text is drawn with the system font until the font is installed.
 */
export function importNote(
  missing: readonly MissingItem[],
  paletteChanged = false,
  installedFonts: readonly string[] = [],
): string | null {
  const lines: string[] = [];
  if (installedFonts.length > 0) {
    lines.push(`Installed ${installedFonts.length === 1 ? 'the font' : 'the fonts'} that came with this label: ${installedFonts.join(', ')}.`);
  }
  const fonts = missing.filter((m) => m.kind === 'font').map((m) => m.name);
  if (fonts.length > 0) {
    lines.push(
      `This label uses ${fonts.length === 1 ? 'a font' : 'fonts'} that ${fonts.length === 1 ? 'is' : 'are'} not on this phone: ${fonts.join(', ')}. ` +
        'Install it (Font Library) so the text looks and wraps the same, or the system font is used.',
    );
  }
  const other = missing.filter((m) => m.kind !== 'font');
  if (other.length > 0) {
    const names = other.slice(0, 4).map((m) => m.name).join(', ');
    lines.push(`Some items are not available here and were skipped or left blank: ${names}${other.length > 4 ? '…' : ''}.`);
  }
  if (paletteChanged) lines.push('Ink colours were set up differently in the app that made this label. Check colours before printing.');
  return lines.length ? lines.join('\n\n') : null;
}
