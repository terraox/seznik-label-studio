/**
 * Dev-only fingerprint of a print capture (D9, dark mode).
 *
 * Logs the SHA-1 of the captured PNG (base64 text) so the same label printed in light and dark
 * mode can be compared: identical hashes mean identical bytes went to the printer. It only reads
 * the string; nothing is returned or changed. Release builds skip it entirely.
 */

/** SHA-1 of an ASCII string (base64 PNG), as 40 hex chars. */
export function sha1Ascii(text: string): string {
  const n = text.length;
  const words = new Array<number>((((n + 8) >> 6) + 1) * 16).fill(0);
  for (let i = 0; i < n; i++) words[i >> 2] |= (text.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
  words[n >> 2] |= 0x80 << (24 - (n % 4) * 8);
  words[words.length - 1] = n * 8;

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Array<number>(80);
  for (let block = 0; block < words.length; block += 16) {
    for (let t = 0; t < 16; t++) w[t] = words[block + t] | 0;
    for (let t = 16; t < 80; t++) {
      const x = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16];
      w[t] = (x << 1) | (x >>> 31);
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let t = 0; t < 80; t++) {
      let f: number;
      let k: number;
      if (t < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (t < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[t]) | 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }
  return [h0, h1, h2, h3, h4].map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

/** `[print-hash]` log line for a captured PNG. No-op outside __DEV__. */
export function logCaptureSha1(path: string, base64Png: string | null | undefined, uiScheme: string) {
  if (typeof __DEV__ === 'undefined' || !__DEV__ || !base64Png) return;
  console.info(
    `[print-hash] path=${path} theme=${uiScheme} bytes=${base64Png.length} sha1=${sha1Ascii(base64Png)}`,
  );
}
