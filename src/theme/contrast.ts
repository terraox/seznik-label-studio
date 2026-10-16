/** WCAG 2.x contrast helpers. Pure functions, no react-native import. */

type Rgba = { r: number; g: number; b: number; a: number };

export function parseColor(input: string): Rgba {
  const s = input.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const raw = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    const n = parseInt(raw, 16);
    return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (rgb) {
    return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 1 : +rgb[4] };
  }
  throw new Error(`Unsupported colour: ${input}`);
}

/** Paint `top` (may be translucent) over an opaque `bottom`; returns #rrggbb. */
export function composite(top: string, bottom: string): string {
  const t = parseColor(top);
  const b = parseColor(bottom);
  const mix = (x: number, y: number) => Math.round(x * t.a + y * (1 - t.a));
  const hex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${hex(mix(t.r, b.r))}${hex(mix(t.g, b.g))}${hex(mix(t.b, b.b))}`;
}

export function relativeLuminance(color: string): number {
  const { r, g, b } = parseColor(color);
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
