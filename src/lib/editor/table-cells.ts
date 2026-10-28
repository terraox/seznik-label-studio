import type { SerialConfig } from '@/lib/serial/types';
import {
  type AutoWrapping,
  type ContentType,
  type EditorElementState,
  type LineSpacing,
  type TableElementState,
  type TextAlign,
} from '@/components/editor/types';

/** Which cell of which table is currently selected. Single source of truth. */
export type SelectedTableCell = { tableId: string; row: number; col: number };

/** Value equality for a cell selection, so memo comparators survive object rebuilds. */
export function sameTableCellSelection(
  a: { row: number; col: number } | null | undefined,
  b: { row: number; col: number } | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.row === b.row && a.col === b.col;
}

export type TableCellContent = {
  text: string;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  align: TextAlign;
  contentType: ContentType;
  columnNameContent: string;
  charSpacing: number;
  lineSpacing: LineSpacing;
  autoWrapping: AutoWrapping;
  verticalDisplay: boolean;
  antiColor: boolean;
  drawingColorIndex: number;
  degreesOffset?: number;
  /** New Serial settings for this cell (active when contentType is 'Degrees'). */
  serial?: SerialConfig;
};

export function createDefaultTableCell(): TableCellContent {
  return {
    text: '',
    fontSize: 10,
    fontFamily: 'Default',
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    align: 'left',
    contentType: 'Manual',
    columnNameContent: '',
    charSpacing: 0,
    lineSpacing: '1.0',
    autoWrapping: 'Word',
    verticalDisplay: false,
    antiColor: false,
    drawingColorIndex: 0,
  };
}

export function resizeTableCells(
  existing: TableCellContent[][] | undefined,
  rowCount: number,
  columnCount: number,
): TableCellContent[][] {
  const rows: TableCellContent[][] = [];
  for (let r = 0; r < rowCount; r++) {
    const row: TableCellContent[] = [];
    for (let c = 0; c < columnCount; c++) {
      row.push(existing?.[r]?.[c] ? { ...existing[r][c] } : createDefaultTableCell());
    }
    rows.push(row);
  }
  return rows;
}

export function ensureTableCells<T extends TableElementState>(table: T): T {
  const cells = table.cells;
  if (
    cells &&
    cells.length === table.rowCount &&
    cells.every((row) => row.length === table.columnCount)
  ) {
    return table;
  }
  return {
    ...table,
    cells: resizeTableCells(cells, table.rowCount, table.columnCount),
  };
}

/** Artboard mm → table-local mm (accounts for element rotation). */
export function pointerMmToTableLocal(
  table: TableElementState,
  pointerMm: { x: number; y: number },
): { x: number; y: number } {
  const rotation = table.rotation ?? 0;
  if (!rotation) {
    return { x: pointerMm.x - table.left, y: pointerMm.y - table.top };
  }
  const cx = table.left + table.width / 2;
  const cy = table.top + table.height / 2;
  const rad = (-rotation * Math.PI) / 180;
  const dx = pointerMm.x - cx;
  const dy = pointerMm.y - cy;
  return {
    x: dx * Math.cos(rad) - dy * Math.sin(rad) + table.width / 2,
    y: dx * Math.sin(rad) + dy * Math.cos(rad) + table.height / 2,
  };
}

/** Cumulative 0..1 positions of every horizontal (row) grid line, including outer edges. */
export function tableRowLineFractions(table: TableElementState): number[] {
  const totalRow =
    table.rowHeights.reduce((sum, h) => sum + h, 0) || table.height || table.rowCount;
  const lines = [0];
  let y = 0;
  for (let r = 0; r < table.rowCount; r++) {
    y += (table.rowHeights[r] ?? totalRow / table.rowCount) / totalRow;
    lines.push(r === table.rowCount - 1 ? 1 : y);
  }
  return lines;
}

/** Cumulative 0..1 positions of every vertical (column) grid line, including outer edges. */
export function tableColumnLineFractions(table: TableElementState): number[] {
  const totalCol =
    table.columnWidths.reduce((sum, w) => sum + w, 0) || table.width || table.columnCount;
  const lines = [0];
  let x = 0;
  for (let c = 0; c < table.columnCount; c++) {
    x += (table.columnWidths[c] ?? totalCol / table.columnCount) / totalCol;
    lines.push(c === table.columnCount - 1 ? 1 : x);
  }
  return lines;
}

/**
 * Finger-friendly half-width around a grid line, as a fraction of the table box.
 * Prefers ~2 mm / stroke thickness, floors at ~10 px when the view size is known,
 * and caps so small cells keep a usable interior.
 */
export function tableLineToleranceFractions(
  table: TableElementState,
  viewWidthPx?: number,
  viewHeightPx?: number,
): { tx: number; ty: number } {
  const lineMm = Math.max(0.25, table.lineWidth || 0.75);
  const tolMm = Math.max(lineMm * 2, 2);
  let tx = tolMm / Math.max(table.width, 1);
  let ty = tolMm / Math.max(table.height, 1);
  // Keep a ~10 px finger target even when the table is small on screen.
  if (viewWidthPx != null && viewWidthPx > 0) tx = Math.max(tx, 10 / viewWidthPx);
  if (viewHeightPx != null && viewHeightPx > 0) ty = Math.max(ty, 10 / viewHeightPx);
  // Leave room to tap cell content even on dense tables.
  const maxFrac = Math.min(0.18, 0.35 / Math.max(table.rowCount, table.columnCount, 1));
  return { tx: Math.min(tx, maxFrac), ty: Math.min(ty, maxFrac) };
}

/** True when the point sits on (or near) a drawn grid / border line. */
export function isNearTableGridLineByFraction(
  table: TableElementState,
  fracX: number,
  fracY: number,
  tolerance?: { tx: number; ty: number },
): boolean {
  if (fracX < 0 || fracY < 0 || fracX > 1 || fracY > 1) return false;
  const { tx, ty } = tolerance ?? tableLineToleranceFractions(table);
  for (const x of tableColumnLineFractions(table)) {
    if (Math.abs(fracX - x) <= tx) return true;
  }
  for (const y of tableRowLineFractions(table)) {
    if (Math.abs(fracY - y) <= ty) return true;
  }
  return false;
}

/**
 * Map a fraction of the table box (0..1) onto a cell, using the same
 * rowHeights/columnWidths proportions as TableContent rendering.
 * Visual size is `heightPx * (rowH / sum(rowHeights))`, which diverges from
 * absolute millimetres when the table has been resized without rewriting arrays.
 */
export function hitTestTableCellByFraction(
  table: TableElementState,
  fracX: number,
  fracY: number,
): { row: number; col: number } | null {
  if (fracX < 0 || fracY < 0 || fracX > 1 || fracY > 1) return null;
  const totalRow =
    table.rowHeights.reduce((sum, h) => sum + h, 0) || table.height || table.rowCount;
  const totalCol =
    table.columnWidths.reduce((sum, w) => sum + w, 0) || table.width || table.columnCount;
  let y = 0;
  for (let r = 0; r < table.rowCount; r++) {
    const h = (table.rowHeights[r] ?? totalRow / table.rowCount) / totalRow;
    const inRow =
      r === table.rowCount - 1 ? fracY >= y && fracY <= y + h : fracY >= y && fracY < y + h;
    if (inRow) {
      let x = 0;
      for (let c = 0; c < table.columnCount; c++) {
        const w = (table.columnWidths[c] ?? totalCol / table.columnCount) / totalCol;
        const inCol =
          c === table.columnCount - 1
            ? fracX >= x && fracX <= x + w
            : fracX >= x && fracX < x + w;
        if (inCol) return { row: r, col: c };
        x += w;
      }
      return { row: r, col: Math.max(0, table.columnCount - 1) };
    }
    y += h;
  }
  return { row: Math.max(0, table.rowCount - 1), col: Math.max(0, table.columnCount - 1) };
}

/**
 * Point-sensitive table target: grid/border lines open the table adjust menu;
 * the cell interior opens the text-content menu.
 */
export type TablePointerTarget =
  | { kind: 'cell'; row: number; col: number }
  | { kind: 'line' };

export function hitTestTableTargetByFraction(
  table: TableElementState,
  fracX: number,
  fracY: number,
  tolerance?: { tx: number; ty: number },
): TablePointerTarget | null {
  if (fracX < 0 || fracY < 0 || fracX > 1 || fracY > 1) return null;
  if (isNearTableGridLineByFraction(table, fracX, fracY, tolerance)) {
    return { kind: 'line' };
  }
  const cell = hitTestTableCellByFraction(table, fracX, fracY);
  return cell ? { kind: 'cell', row: cell.row, col: cell.col } : null;
}

/**
 * Touch point inside the table view. Gesture x/y are already in that view's
 * local space (rotation is applied by the parent transform), so this must not
 * un-rotate again.
 */
export function hitTestTableCellFromViewPoint(
  table: TableElementState,
  viewX: number,
  viewY: number,
  viewWidthPx: number,
  viewHeightPx: number,
  _rotationDeg = 0,
): { row: number; col: number } | null {
  if (!(viewWidthPx > 0) || !(viewHeightPx > 0)) return null;
  return hitTestTableCellByFraction(table, viewX / viewWidthPx, viewY / viewHeightPx);
}

export function hitTestTableTargetFromViewPoint(
  table: TableElementState,
  viewX: number,
  viewY: number,
  viewWidthPx: number,
  viewHeightPx: number,
): TablePointerTarget | null {
  if (!(viewWidthPx > 0) || !(viewHeightPx > 0)) return null;
  const tol = tableLineToleranceFractions(table, viewWidthPx, viewHeightPx);
  return hitTestTableTargetByFraction(
    table,
    viewX / viewWidthPx,
    viewY / viewHeightPx,
    tol,
  );
}

export function hitTestTableCell(
  table: TableElementState,
  localXMm: number,
  localYMm: number,
): { row: number; col: number } | null {
  if (localXMm < 0 || localYMm < 0 || localXMm > table.width || localYMm > table.height) {
    return null;
  }
  const fracX = table.width > 0 ? localXMm / table.width : 0;
  const fracY = table.height > 0 ? localYMm / table.height : 0;
  return hitTestTableCellByFraction(table, fracX, fracY);
}

export function hitTestTableTarget(
  table: TableElementState,
  localXMm: number,
  localYMm: number,
): TablePointerTarget | null {
  if (localXMm < 0 || localYMm < 0 || localXMm > table.width || localYMm > table.height) {
    return null;
  }
  const fracX = table.width > 0 ? localXMm / table.width : 0;
  const fracY = table.height > 0 ? localYMm / table.height : 0;
  return hitTestTableTargetByFraction(table, fracX, fracY, tableLineToleranceFractions(table));
}

export function tableCellToEditorState(
  cell: TableCellContent,
  table: TableElementState,
  row: number,
  col: number,
): EditorElementState {
  const width = table.columnWidths[col] ?? table.width / table.columnCount;
  const height = table.rowHeights[row] ?? table.height / table.rowCount;
  return {
    text: cell.text,
    fontSize: cell.fontSize,
    fontFamily: cell.fontFamily,
    bold: cell.bold,
    italic: cell.italic,
    underline: cell.underline,
    strikethrough: cell.strikethrough,
    align: cell.align,
    rotation: 0,
    left: 0,
    top: 0,
    width,
    height,
    lockMovement: false,
    needPrinting: true,
    antiColor: cell.antiColor,
    drawingColorIndex: cell.drawingColorIndex,
    contentType: cell.contentType,
    columnNameContent: cell.columnNameContent,
    charSpacing: cell.charSpacing,
    lineSpacing: cell.lineSpacing,
    autoWrapping: cell.autoWrapping,
    verticalDisplay: cell.verticalDisplay,
    autoTextHeight: false,
    ...(cell.degreesOffset != null ? { degreesOffset: cell.degreesOffset } : {}),
    ...(cell.serial ? { serial: cell.serial } : {}),
  };
}

const CELL_KEYS = new Set([
  'text',
  'fontSize',
  'fontFamily',
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'align',
  'contentType',
  'columnNameContent',
  'charSpacing',
  'lineSpacing',
  'autoWrapping',
  'verticalDisplay',
  'antiColor',
  'drawingColorIndex',
  'degreesOffset',
  'serial',
]);

export function pickTableCellPatch(
  updates: Partial<EditorElementState & { degreesOffset?: number }>,
): Partial<TableCellContent> {
  const patch: Partial<TableCellContent> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (CELL_KEYS.has(key)) {
      (patch as Record<string, unknown>)[key] = value;
    }
  }
  return patch;
}

export function patchTableCellInElement<T extends TableElementState>(
  table: T,
  row: number,
  col: number,
  updates: Partial<EditorElementState & { degreesOffset?: number }>,
): T {
  const normalized = ensureTableCells(table);
  const cellPatch = pickTableCellPatch(updates);
  if (Object.keys(cellPatch).length === 0) return normalized;
  const cells = normalized.cells!.map((r, ri) =>
    r.map((cell, ci) => (ri === row && ci === col ? { ...cell, ...cellPatch } : cell)),
  );
  return { ...normalized, cells };
}
