/**
 * Skia Paragraph drawing for scripts that need shaping (Devanagari matras, etc.).
 * `canvas.drawText` + `SkFont` does not reorder combining marks.
 */


import type { TextDrawStyle } from './skia-surface';

const LAYOUT_WIDTH = 1_000_000;

type SkColor = unknown;
type SkTypeface = unknown;

type SkParagraph = {
  layout: (width: number) => void;
  paint: (canvas: unknown, x: number, y: number) => void;
  getLongestLine: () => number;
};

type SkParagraphBuilder = {
  pushStyle: (style: Record<string, unknown>) => SkParagraphBuilder;
  addText: (text: string) => SkParagraphBuilder;
  pop: () => SkParagraphBuilder;
  build: () => SkParagraph;
};

type SkParagraphBuilderFactory = {
  Make: (style?: Record<string, unknown>, provider?: unknown) => SkParagraphBuilder;
};

type SkTypefaceFontProvider = {
  registerFont: (typeface: SkTypeface, familyName: string) => void;
};

type ShapedSkia = {
  Skia: {
    Color: (c: string | number) => SkColor;
    ParagraphBuilder: SkParagraphBuilderFactory;
    TypefaceFontProvider: { Make: () => SkTypefaceFontProvider };
  };
};

let fontProvider: SkTypefaceFontProvider | null = null;
const registeredFamilies = new Set<string>();

function grayToHex(gray: number): string {
  const v = gray < 0 ? 0 : gray > 255 ? 255 : gray | 0;
  const hex = v.toString(16).padStart(2, '0');
  return `#${hex}${hex}${hex}`;
}

function ensureProvider(skia: ShapedSkia): SkTypefaceFontProvider {
  if (!fontProvider) {
    fontProvider = skia.Skia.TypefaceFontProvider.Make();
  }
  return fontProvider;
}

function registerPrintFace(skia: ShapedSkia, family: string, bold?: boolean): void {
  if (registeredFamilies.has(family)) return;
  try {
    const { printTypeface } = require('./print-typeface') as {
      printTypeface: (family?: string, bold?: boolean) => SkTypeface | null;
    };
    const face = printTypeface(family, bold);
    if (!face) return;
    ensureProvider(skia).registerFont(face, family);
    registeredFamilies.add(family);
  } catch {
    // matchFont / system fallback when print faces are not loaded.
  }
}

function paragraphStyle(skia: ShapedSkia, style: TextDrawStyle): Record<string, unknown> {
  const families: string[] = [];
  if (style.family) {
    registerPrintFace(skia, style.family, style.bold);
    families.push(style.family);
  }
  if (families.length === 0) families.push('sans-serif');
  return {
    color: skia.Skia.Color(grayToHex(style.ink)),
    fontFamilies: families,
    fontSize: style.fontSizeDots,
    fontStyle: {
      weight: style.bold ? 700 : 400,
      slant: style.italic ? 1 : 0,
    },
  };
}

function buildParagraph(skia: ShapedSkia, text: string, style: TextDrawStyle): SkParagraph | null {
  const builderApi = skia.Skia.ParagraphBuilder;
  if (!builderApi?.Make) return null;
  const provider = style.family != null ? ensureProvider(skia) : undefined;
  try {
    return builderApi
      .Make({}, provider)
      .pushStyle(paragraphStyle(skia, style))
      .addText(text)
      .pop()
      .build();
  } catch {
    return null;
  }
}

export function measureShapedTextWidth(
  skiaMod: ShapedSkia,
  text: string,
  style: TextDrawStyle,
): number | null {
  const para = buildParagraph(skiaMod, text, style);
  if (!para) return null;
  para.layout(LAYOUT_WIDTH);
  return para.getLongestLine();
}

export function drawShapedTextLine(
  skiaMod: ShapedSkia,
  canvas: unknown,
  text: string,
  x: number,
  yTop: number,
  style: TextDrawStyle,
): boolean {
  const para = buildParagraph(skiaMod, text, style);
  if (!para) return false;
  para.layout(LAYOUT_WIDTH);
  para.paint(canvas, x, yTop);
  return true;
}

/** Test hook — reset cached font provider between cases. */
export function resetShapedTextFontProviderForTests(): void {
  fontProvider = null;
  registeredFamilies.clear();
}
