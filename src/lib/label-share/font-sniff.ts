/** Identify a TrueType / OpenType font by its bytes and check its table directory is sane. */

export type SniffedFont = { ext: 'ttf' | 'otf' };

const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const tag = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

export function sniffFont(bytes: Uint8Array): SniffedFont | null {
  if (bytes.length < 12 + 16) return null;
  const sig = u32(bytes, 0);
  let ext: 'ttf' | 'otf';
  if (sig === 0x00010000 || tag(bytes, 0) === 'true') ext = 'ttf';
  else if (tag(bytes, 0) === 'OTTO') ext = 'otf';
  else return null; // includes font collections ('ttcf'), WOFF, and anything else
  const tables = u16(bytes, 4);
  if (tables < 4 || tables > 64 || bytes.length < 12 + tables * 16) return null;
  let hasHead = false;
  let hasGlyphs = false;
  for (let i = 0; i < tables; i++) {
    const rec = 12 + i * 16;
    const name = tag(bytes, rec);
    const offset = u32(bytes, rec + 8);
    const length = u32(bytes, rec + 12);
    // Every table must lie inside the file.
    if (offset > bytes.length || length > bytes.length || offset + length > bytes.length) return null;
    if (name === 'head') hasHead = true;
    if (name === 'glyf' || name === 'CFF ' || name === 'CFF2') hasGlyphs = true;
  }
  return hasHead && hasGlyphs ? { ext } : null;
}
