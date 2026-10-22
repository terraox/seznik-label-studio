/** Identify an image by its bytes (never by name) and read its size from the header only. */

export type SniffedImage = { kind: 'png' | 'jpeg' | 'webp'; width: number; height: number };

const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function sniffPng(b: Uint8Array): SniffedImage | null {
  if (b.length < 33) return null;
  for (let i = 0; i < 8; i++) if (b[i] !== PNG_SIG[i]) return null;
  // First chunk must be IHDR of length 13.
  if (u32be(b, 8) !== 13) return null;
  if (b[12] !== 0x49 || b[13] !== 0x48 || b[14] !== 0x44 || b[15] !== 0x52) return null;
  return { kind: 'png', width: u32be(b, 16), height: u32be(b, 20) };
}

function sniffJpeg(b: Uint8Array): SniffedImage | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    let marker = b[i + 1];
    while (marker === 0xff && i + 2 < b.length) {
      i += 1;
      marker = b[i + 1];
    }
    i += 2;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda) return null;
    if (i + 2 > b.length) return null;
    const len = u16be(b, i);
    if (len < 2) return null;
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 7 > b.length) return null;
      return { kind: 'jpeg', height: u16be(b, i + 3), width: u16be(b, i + 5) };
    }
    i += len;
  }
  return null;
}

function sniffWebp(b: Uint8Array): SniffedImage | null {
  if (b.length < 30) return null;
  const tag = (o: number, s: string) => s.split('').every((c, k) => b[o + k] === c.charCodeAt(0));
  if (!tag(0, 'RIFF') || !tag(8, 'WEBP')) return null;
  if (tag(12, 'VP8X')) return { kind: 'webp', width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  if (tag(12, 'VP8L')) {
    if (b[20] !== 0x2f) return null;
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
    return { kind: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (tag(12, 'VP8 ')) {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { kind: 'webp', width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  return null;
}

/** Null when the bytes are not a PNG, JPEG or WebP, or the header is damaged. */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  const found = sniffPng(bytes) ?? sniffJpeg(bytes) ?? sniffWebp(bytes);
  if (!found || !(found.width > 0) || !(found.height > 0)) return null;
  return found;
}

export function imageExtension(kind: SniffedImage['kind']): string {
  return kind === 'jpeg' ? 'jpg' : kind;
}
