/**
 * Copy finished 1-bit image dots (0 = ink, 255 = paper) onto a page, using only `fillRect`.
 * Paper dots inside the image overwrite what is under them, like an opaque picture. `mask` (when
 * the image was turned by an odd angle) leaves the pixels outside the picture untouched.
 * Neighbouring rows with the same ink run are merged into one rectangle.
 */
export type FillRect = (x: number, y: number, w: number, h: number, gray: number) => void;

export function blitTileViaRects(
  fill: FillRect,
  x0: number,
  y0: number,
  w: number,
  h: number,
  gray: Uint8Array,
  mask: Uint8Array | null,
): void {
  if (!mask) {
    fill(x0, y0, w, h, 255);
  } else {
    // Paper under the picture: one run of mask per row, merged downward when identical.
    mergeRuns(h, (y) => runs(w, (x) => mask[y * w + x] !== 0), (x, y, len, rows) => fill(x0 + x, y0 + y, len, rows, 255));
  }
  mergeRuns(h, (y) => runs(w, (x) => gray[y * w + x] === 0 && (!mask || mask[y * w + x] !== 0)), (x, y, len, rows) =>
    fill(x0 + x, y0 + y, len, rows, 0),
  );
}

type Run = { x: number; len: number };

function runs(w: number, on: (x: number) => boolean): Run[] {
  const out: Run[] = [];
  let start = -1;
  for (let x = 0; x < w; x++) {
    if (on(x)) {
      if (start < 0) start = x;
    } else if (start >= 0) {
      out.push({ x: start, len: x - start });
      start = -1;
    }
  }
  if (start >= 0) out.push({ x: start, len: w - start });
  return out;
}

function mergeRuns(
  h: number,
  rowRuns: (y: number) => Run[],
  emit: (x: number, y: number, len: number, rows: number) => void,
): void {
  let open = new Map<string, { x: number; len: number; y: number; rows: number }>();
  for (let y = 0; y < h; y++) {
    const next = new Map<string, { x: number; len: number; y: number; rows: number }>();
    for (const r of rowRuns(y)) {
      const key = `${r.x}:${r.len}`;
      const prev = open.get(key);
      if (prev) {
        prev.rows++;
        next.set(key, prev);
        open.delete(key);
      } else {
        next.set(key, { x: r.x, len: r.len, y, rows: 1 });
      }
    }
    for (const done of open.values()) emit(done.x, done.y, done.len, done.rows);
    open = next;
  }
  for (const done of open.values()) emit(done.x, done.y, done.len, done.rows);
}
