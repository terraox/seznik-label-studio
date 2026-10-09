import { type AutoWrapping, type LineSpacing } from '@/components/editor/types';

/**
 * Convert typography points to millimetres.
 * Self-contained worklet function to avoid circular imports.
 */
export function ptToMm(pt: number): number {
  'worklet';
  return (pt * 25.4) / 72;
}

/**
 * Convert millimetres to typography points.
 */
export function mmToPt(mm: number): number {
  'worklet';
  return (mm * 72) / 25.4;
}

/**
 * Convert stored char spacing (mm) to React Native `letterSpacing`.
 * iOS expects points; Android expects em units relative to font size.
 */
export function charSpacingToLetterSpacing(
  charSpacingMm: number,
  fontSizePt: number,
  platformOs: 'ios' | 'android' | 'macos' | 'windows' | 'web',
): number {
  if (!charSpacingMm) return 0;
  if (platformOs === 'ios' || platformOs === 'macos') {
    return mmToPt(charSpacingMm);
  }
  const emMm = ptToMm(fontSizePt);
  return emMm > 0 ? charSpacingMm / emMm : 0;
}

/**
 * Line spacing multiplier helper.
 */
export function lineSpacingMultiplier(spacing?: LineSpacing): number {
  'worklet';
  switch (spacing) {
    case '1.5':
      return 1.5;
    case '2.0':
      return 2.0;
    case 'Custom':
      return 1.75;
    default:
      return 1.0;
  }
}

/** Roboto Mono and the Monospace library entry share one advance. */
export function usesMonospaceMetrics(fontFamily?: string): boolean {
  'worklet';
  if (!fontFamily) return false;
  const key = fontFamily.toLowerCase().replace(/[\s_-]/g, '');
  return key === 'mono' || key === 'monospace' || key === 'menlo' || key.indexOf('robotomono') >= 0;
}

/** Installed / decorative faces need extra vertical room vs Default metrics. */
export function textLineHeightScale(fontFamily?: string): number {
  'worklet';
  if (!fontFamily || fontFamily === 'Default') return 1;
  return 1.18;
}

/** Fraction of font size used as left/right inset inside the selection frame (editor + layout). */
export const TEXT_FRAME_PADDING_X_RATIO = 0.26;
/** Fraction of font size used as top/bottom inset. */
export const TEXT_FRAME_PADDING_Y_RATIO = 0.1;

/** Side inset inside the dashed frame — matches editor `paddingHorizontal`. */
export function textHorizontalPaddingMm(fontSizePt: number): number {
  'worklet';
  return Math.max(0.55, ptToMm(fontSizePt) * TEXT_FRAME_PADDING_X_RATIO);
}

/** Horizontal inset inside the selection frame. */
export function textInnerWidthMm(boxWidthMm: number, fontSizePt: number): number {
  'worklet';
  const inset = textHorizontalPaddingMm(fontSizePt) * 2;
  return Math.max(0.5, boxWidthMm - inset);
}

/** Wrap width for layout. Conservative mode counts extra lines for height. */
export function textWrapWidthMm(boxWidthMm: number, fontSizePt: number, conservative = false): number {
  'worklet';
  const inner = textInnerWidthMm(boxWidthMm, fontSizePt);
  return conservative ? inner * 0.9 : inner;
}

/** One line box in mm — mirrors `textStyleFor` lineHeight. */
export function textLineBoxHeightMm(fontSizePt: number, lineSpacing?: LineSpacing, fontFamily?: string): number {
  'worklet';
  const fontMm = ptToMm(fontSizePt);
  const mult = lineSpacingMultiplier(lineSpacing);
  return fontMm * 1.25 * mult * textLineHeightScale(fontFamily);
}

/** Top + bottom inset — matches editor `paddingVertical`. */
export function textVerticalPaddingMm(fontSizePt: number): number {
  'worklet';
  return Math.max(0.32, ptToMm(fontSizePt) * TEXT_FRAME_PADDING_Y_RATIO);
}

/**
 * Character width estimation in em units relative to font size (1.0 em = 1 font size unit).
 * Calibrated against standard system / sans-serif fonts (Roboto, Inter, San Francisco, Arial).
 * Monospace faces use a flat 0.6 em so wrap matches Roboto Mono on screen and in print.
 */
export function charWidthEm(ch: string, bold = false, fontFamily?: string): number {
  'worklet';
  const code = ch.charCodeAt(0);
  // Indic scripts (Devanagari through Malayalam, plus Devanagari Extended).
  if ((code >= 0x0900 && code <= 0x0d7f) || (code >= 0xa8e0 && code <= 0xa8ff)) {
    return 1.0;
  }
  if (usesMonospaceMetrics(fontFamily)) {
    if (
      (code >= 0x2e80 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff01 && code <= 0xff60)
    ) {
      return 1.0;
    }
    return bold ? 0.63 : 0.6;
  }

  // CJK / Full-width ideographs (Chinese, Japanese, Korean, full-width forms)
  if (
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff01 && code <= 0xff60)
  ) {
    return 1.0;
  }

  let baseWidth: number;

  switch (ch) {
    // Wide uppercase
    case 'W':
    case 'M':
      baseWidth = 0.85;
      break;
    // Medium-wide uppercase
    case 'Q':
    case 'O':
    case 'C':
    case 'G':
    case 'D':
    case 'U':
      baseWidth = 0.7;
      break;
    // Standard uppercase
    case 'A':
    case 'B':
    case 'E':
    case 'F':
    case 'H':
    case 'K':
    case 'N':
    case 'P':
    case 'R':
    case 'S':
    case 'T':
    case 'V':
    case 'X':
    case 'Y':
    case 'Z':
      baseWidth = 0.6;
      break;
    // Narrow uppercase
    case 'I':
    case 'J':
    case 'L':
      baseWidth = 0.35;
      break;

    // Wide lowercase
    case 'w':
    case 'm':
      baseWidth = 0.8;
      break;
    // Standard lowercase
    case 'a':
    case 'b':
    case 'c':
    case 'd':
    case 'e':
    case 'g':
    case 'h':
    case 'k':
    case 'n':
    case 'o':
    case 'p':
    case 'q':
    case 'u':
    case 'v':
    case 'x':
    case 'y':
    case 'z':
      baseWidth = 0.52;
      break;
    // Narrow lowercase
    case 'f':
    case 'r':
    case 't':
      baseWidth = 0.35;
      break;
    case 'i':
    case 'j':
    case 'l':
      baseWidth = 0.25;
      break;

    // Digits
    case '0':
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
      baseWidth = 0.55;
      break;

    // Space
    case ' ':
      baseWidth = 0.28;
      break;

    // Narrow punctuation
    case '.':
    case ',':
    case ':':
    case ';':
    case '!':
    case "'":
    case '|':
    case '`':
      baseWidth = 0.25;
      break;

    // Medium punctuation
    case '-':
    case '(':
    case ')':
    case '[':
    case ']':
    case '{':
    case '}':
    case '/':
    case '\\':
    case '?':
      baseWidth = 0.35;
      break;

    // Wide punctuation & math
    case '"':
    case '*':
    case '+':
    case '=':
    case '<':
    case '>':
    case '~':
    case '^':
    case '_':
      baseWidth = 0.55;
      break;

    case '@':
    case '#':
    case '%':
    case '&':
    case '$':
      baseWidth = 0.78;
      break;

    default:
      baseWidth = 0.55;
      break;
  }

  return bold ? baseWidth * 1.05 : baseWidth;
}

/**
 * Measure total physical width in millimetres of a single-line string at a given font size.
 */
export function measureTextWidthMm(
  text: string,
  fontSizePt: number,
  charSpacingMm = 0,
  bold = false,
  fontFamily?: string,
): number {
  'worklet';
  if (!text || text.length === 0) return 0;
  const emToMm = ptToMm(fontSizePt);
  let totalMm = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    totalMm += charWidthEm(ch, bold, fontFamily) * emToMm + charSpacingMm;
  }
  return totalMm;
}

/**
 * Keep a string on one line. When it is wider than `availableMm`, return the
 * negative character spacing (mm) that pulls it back inside that width.
 * Newlines are flattened so nothing drops to a second line.
 */
export function singleLineSqueezeSpacingMm(
  text: string,
  fontSizePt: number,
  availableMm: number,
  bold = false,
): { text: string; charSpacingMm: number } {
  const flat = text.replace(/\r?\n/g, ' ');
  if (!flat) return { text: '', charSpacingMm: 0 };
  const natural = measureTextWidthMm(flat, fontSizePt, 0, bold);
  const target = Math.max(0.2, availableMm);
  if (natural <= target) return { text: flat, charSpacingMm: 0 };
  return { text: flat, charSpacingMm: (target - natural) / flat.length };
}

export type ComputeWrappedLinesParams = {
  text: string;
  fontSize: number;
  widthMm: number;
  autoWrapping?: AutoWrapping;
  charSpacing?: number;
  bold?: boolean;
  verticalDisplay?: boolean;
  /** Library name or family key. Monospace uses a flat advance. */
  fontFamily?: string;
};

/**
 * Compute the wrapped line segments for text content given width constraints and wrapping mode.
 */
export function computeWrappedLines({
  text,
  fontSize,
  widthMm,
  autoWrapping = 'Word',
  charSpacing = 0,
  bold = false,
  verticalDisplay = false,
  fontFamily,
}: ComputeWrappedLinesParams): string[] {
  'worklet';
  if (!text || text.length === 0) return [''];

  if (verticalDisplay) {
    const chars = text.split('');
    return chars.length > 0 ? chars : [''];
  }

  if (autoWrapping === 'Close') {
    const lines = text.split('\n');
    return lines.length > 0 ? lines : [''];
  }

  const safeWidthMm = Math.max(0.5, widthMm);
  const paragraphs = text.split('\n');
  const result: string[] = [];

  if (autoWrapping === 'Char') {
    for (let p = 0; p < paragraphs.length; p++) {
      const para = paragraphs[p];
      if (para.length === 0) {
        result.push('');
        continue;
      }
      let currentLine = '';
      for (let i = 0; i < para.length; i++) {
        const ch = para.charAt(i);
        const testLine = currentLine + ch;
        if (currentLine.length > 0 && measureTextWidthMm(testLine, fontSize, charSpacing, bold, fontFamily) > safeWidthMm) {
          result.push(currentLine);
          currentLine = ch;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine.length > 0) {
        result.push(currentLine);
      }
    }
    return result.length > 0 ? result : [''];
  }

  // AutoWrapping === 'Word' (default)
  for (let p = 0; p < paragraphs.length; p++) {
    const para = paragraphs[p];
    if (para.length === 0) {
      result.push('');
      continue;
    }

    const words = para.split(' ');
    let currentLine = '';

    for (let w = 0; w < words.length; w++) {
      const word = words[w];
      const candidate = currentLine.length > 0 ? currentLine + ' ' + word : word;

      if (measureTextWidthMm(candidate, fontSize, charSpacing, bold, fontFamily) <= safeWidthMm) {
        currentLine = candidate;
      } else {
        if (currentLine.length > 0) {
          result.push(currentLine);
          currentLine = '';
        }

        // Check if individual word exceeds available width on its own
        if (measureTextWidthMm(word, fontSize, charSpacing, bold, fontFamily) <= safeWidthMm) {
          currentLine = word;
        } else {
          // Word is too long to fit in one line, break mid-word
          let partial = '';
          for (let c = 0; c < word.length; c++) {
            const ch = word.charAt(c);
            const testPartial = partial + ch;
            if (partial.length > 0 && measureTextWidthMm(testPartial, fontSize, charSpacing, bold, fontFamily) > safeWidthMm) {
              result.push(partial);
              partial = ch;
            } else {
              partial = testPartial;
            }
          }
          currentLine = partial;
        }
      }
    }

    if (currentLine.length > 0 || para.length === 0) {
      result.push(currentLine);
    }
  }

  return result.length > 0 ? result : [''];
}

export type ComputeTextElementHeightParams = {
  text: string;
  fontSize: number;
  widthMm: number;
  autoWrapping?: AutoWrapping;
  lineSpacing?: LineSpacing;
  charSpacing?: number;
  bold?: boolean;
  verticalDisplay?: boolean;
  fontFamily?: string;
};

/**
 * Compute the rendered & physical height in mm of a text element based on wrapped lines.
 */
export function computeTextElementHeightMm({
  text,
  fontSize,
  widthMm,
  autoWrapping = 'Word',
  lineSpacing = '1.0',
  charSpacing = 0,
  bold = false,
  verticalDisplay = false,
  fontFamily,
}: ComputeTextElementHeightParams): number {
  'worklet';
  const wrapMode = autoWrapping ?? 'Word';
  const lines = computeWrappedLines({
    text,
    fontSize,
    widthMm: textWrapWidthMm(widthMm, fontSize, false),
    autoWrapping: wrapMode,
    charSpacing,
    bold,
    verticalDisplay,
    fontFamily,
  });

  const lineH = textLineBoxHeightMm(fontSize, lineSpacing, fontFamily);
  const vertPad = textVerticalPaddingMm(fontSize);
  return Math.max(2.2, vertPad * 2 + lineH * Math.max(1, lines.length));
}

/**
 * Box height that fits wrapped lines at a given width, including editor padding.
 * Used when the user narrows a text frame so extra lines stay visible.
 */
export function heightForWrappedTextMm(
  params: ComputeTextElementHeightParams & { minHeightMm?: number },
): number {
  'worklet';
  const needed = computeTextElementHeightMm({
    text: params.text,
    fontSize: params.fontSize,
    widthMm: params.widthMm,
    autoWrapping: params.autoWrapping ?? 'Word',
    lineSpacing: params.lineSpacing,
    charSpacing: params.charSpacing,
    bold: params.bold,
    verticalDisplay: params.verticalDisplay,
    fontFamily: params.fontFamily,
  });
  const minH = typeof params.minHeightMm === 'number' && Number.isFinite(params.minHeightMm) ? params.minHeightMm : 0;
  return Math.max(minH, needed);
}

export type PrintTextLayout = {
  lines: string[];
  /** Width of each line from the same charWidthEm measure used to wrap. */
  widthsMm: number[];
  /** One line, in mm: font size × line-spacing multiplier. */
  lineHeightMm: number;
};

/**
 * Wrap and measure a print/editor text run with one function.
 * Editor preview and the headless rasterizer both align from `widthsMm`.
 */
export function layoutPrintText({
  text,
  fontSize,
  widthMm,
  autoWrapping = 'Word',
  lineSpacing = '1.0',
  charSpacing = 0,
  bold = false,
  verticalDisplay = false,
  fontFamily,
}: ComputeTextElementHeightParams): PrintTextLayout {
  'worklet';
  const lines = computeWrappedLines({
    text,
    fontSize,
    widthMm,
    autoWrapping,
    charSpacing,
    bold,
    verticalDisplay,
    fontFamily,
  });
  return {
    lines,
    widthsMm: lines.map((line) => measureTextWidthMm(line, fontSize, charSpacing, bold, fontFamily)),
    lineHeightMm: ptToMm(fontSize) * lineSpacingMultiplier(lineSpacing),
  };
}

/** Split `targetDots` across characters in proportion to charWidthEm. Sum equals targetDots. */
export function contractLineAdvances(text: string, bold: boolean, targetDots: number): number[] {
  const chars = [...text];
  if (chars.length === 0 || targetDots <= 0) return chars.map(() => 0);
  const weights = chars.map((ch) => Math.max(0.01, charWidthEm(ch, bold)));
  const sum = weights.reduce((acc, w) => acc + w, 0);
  const raw = weights.map((w) => (w / sum) * targetDots);
  const floors = raw.map((v) => Math.floor(v));
  let rem = targetDots - floors.reduce((acc, v) => acc + v, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  const out = floors.slice();
  for (let k = 0; k < rem; k++) out[order[k % order.length].i] += 1;
  return out;
}
