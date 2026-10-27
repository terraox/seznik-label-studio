/**
 * Which data rows of an Excel bulk job print. Row numbers are 1-based data rows (the first row under
 * the header is row 1), the same numbering the copies warning uses.
 */
export type RowSelection =
  | { mode: 'all' }
  | { mode: 'even' }
  | { mode: 'odd' }
  | { mode: 'custom'; text: string };

export const ALL_ROWS: RowSelection = { mode: 'all' };

export type RowRange = { from: number; to: number };

export type ParsedRowText = { ranges: RowRange[]; error: string | null };

/** "1-5, 8, 12-" → [1..5], [8..8], [12..end]. Commas or spaces separate; "12-" runs to the last row. */
export function parseRowText(text: string, rowCount: number): ParsedRowText {
  const ranges: RowRange[] = [];
  const parts = text
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { ranges, error: 'Enter row numbers, like 1-5, 8, 12-' };
  for (const part of parts) {
    const m = /^(\d+)?(?:\s*[-–to]+\s*(\d+)?)?$/i.exec(part);
    if (!m || (m[1] == null && m[2] == null)) return { ranges: [], error: `"${part}" is not a row or range` };
    const hasDash = /[-–]/.test(part);
    const from = m[1] != null ? Number(m[1]) : 1;
    const to = hasDash ? (m[2] != null ? Number(m[2]) : rowCount) : from;
    if (from < 1 || to < 1) return { ranges: [], error: 'Row numbers start at 1' };
    if (from > to) return { ranges: [], error: `"${part}" goes backwards` };
    ranges.push({ from, to });
  }
  return { ranges, error: null };
}

/** The 0-based row indexes to print, or null when every row prints. */
export function selectedRowIndexes(
  selection: RowSelection | null | undefined,
  rowCount: number,
): Set<number> | null {
  if (!selection || selection.mode === 'all') return null;
  const out = new Set<number>();
  if (selection.mode === 'even' || selection.mode === 'odd') {
    const start = selection.mode === 'odd' ? 0 : 1; // row 1 is index 0
    for (let i = start; i < rowCount; i += 2) out.add(i);
    return out;
  }
  const { ranges, error } = parseRowText(selection.text, rowCount);
  if (error) return out; // an unreadable custom list selects nothing; the setup screen blocks Confirm first
  for (const { from, to } of ranges) {
    for (let n = from; n <= Math.min(to, rowCount); n++) out.add(n - 1);
  }
  return out;
}

export function rowSelectionSummary(selection: RowSelection | null | undefined, rowCount: number): string {
  const picked = selectedRowIndexes(selection, rowCount);
  if (!picked) return 'All rows';
  const label =
    selection?.mode === 'even' ? 'Even rows' : selection?.mode === 'odd' ? 'Odd rows' : 'Custom rows';
  return `${label} · ${picked.size} of ${rowCount}`;
}
