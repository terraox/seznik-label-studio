/**
 * Sample content for a catalogue template: a short list of elements placed in millimetres on the
 * template's own size. The admin designs it, the server stores it as JSON on the template, and the
 * app turns it into real editor elements. Pure data and validation, so admin and app share it.
 */
export const SAMPLE_ELEMENT_TYPES = ['text', 'barcode', 'qrcode', 'line'] as const;
export type SampleElementType = (typeof SAMPLE_ELEMENT_TYPES)[number];

export type SampleElement = {
  id: string;
  type: SampleElementType;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Text shown (text) or encoded (barcode, qrcode). */
  text?: string;
  /** Points. Text only. */
  fontSize?: number;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  /**
   * Quarter turn clockwise (0, 90, 180, 270) about the box centre, as editor elements turn.
   * left / top / width / height stay the unturned box. Absent means 0.
   */
  rotation?: SampleRotation;
};

export type SampleRotation = 0 | 90 | 180 | 270;

const quarterTurn = (deg: unknown): SampleRotation => {
  const n = typeof deg === 'number' ? deg : Number(deg);
  if (!Number.isFinite(n)) return 0;
  return ((((Math.round(n / 90) * 90) % 360) + 360) % 360) as SampleRotation;
};

export const MAX_SAMPLE_ELEMENTS = 60;
const MAX_TEXT_CHARS = 500;

const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : fallback;
};

/** Keeps only what the app can draw; returns an error message for input that is not a layout at all. */
export function cleanSampleLayout(
  input: unknown,
  widthMm: number,
  heightMm: number,
): { ok: true; layout: SampleElement[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'The sample layout must be a list of elements.' };
  if (input.length > MAX_SAMPLE_ELEMENTS) return { ok: false, error: `At most ${MAX_SAMPLE_ELEMENTS} elements.` };
  const layout: SampleElement[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Each element must be an object.' };
    const e = raw as Record<string, unknown>;
    if (!SAMPLE_ELEMENT_TYPES.includes(e.type as SampleElementType)) {
      return { ok: false, error: `Unknown element type “${String(e.type)}”.` };
    }
    const type = e.type as SampleElementType;
    const out: SampleElement = {
      id: String(e.id ?? `e${layout.length + 1}`).slice(0, 40),
      type,
      left: num(e.left, -widthMm, widthMm * 2, 0),
      top: num(e.top, -heightMm, heightMm * 2, 0),
      width: num(e.width, 0.1, 1000, 10),
      height: num(e.height, 0.1, 1000, type === 'line' ? 0.4 : 5),
    };
    if (type !== 'line') out.text = String(e.text ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, MAX_TEXT_CHARS);
    const rotation = quarterTurn(e.rotation);
    if (rotation) out.rotation = rotation;
    if (type === 'text') {
      out.fontSize = num(e.fontSize, 3, 120, 8);
      out.bold = e.bold === true;
      out.align = e.align === 'center' || e.align === 'right' ? e.align : 'left';
    }
    layout.push(out);
  }
  return { ok: true, layout };
}

/** Height of a text block in mm for the given point size and line count (matches the editor closely enough to place boxes). */
export const sampleTextHeightMm = (fontSize: number, lines: number) =>
  Math.round(fontSize * 0.3528 * 1.25 * Math.max(1, lines) * 100) / 100;

/** The box an element covers on the label once turned (a quarter turn swaps width and height about the centre). */
export function sampleVisualBox(el: Pick<SampleElement, 'left' | 'top' | 'width' | 'height' | 'rotation'>) {
  const sideways = el.rotation === 90 || el.rotation === 270;
  const width = sideways ? el.height : el.width;
  const height = sideways ? el.width : el.height;
  return { left: el.left + (el.width - width) / 2, top: el.top + (el.height - height) / 2, width, height };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Turns the sample with its template a quarter turn: the label goes from W x H to H x W, every
 * element moves to where it lands and turns with it, so the design looks the same, just turned.
 */
export function turnSampleLayout(layout: SampleElement[], widthMm: number, heightMm: number, clockwise: boolean): SampleElement[] {
  return layout.map((el) => {
    const cx = el.left + el.width / 2;
    const cy = el.top + el.height / 2;
    // Clockwise: (x, y) on W x H lands at (H - y, x). Anticlockwise: at (y, W - x).
    const [nx, ny] = clockwise ? [heightMm - cy, cx] : [cy, widthMm - cx];
    const rotation = quarterTurn((el.rotation ?? 0) + (clockwise ? 90 : 270));
    const next: SampleElement = { ...el, left: r2(nx - el.width / 2), top: r2(ny - el.height / 2) };
    if (rotation) next.rotation = rotation;
    else delete next.rotation;
    return next;
  });
}
