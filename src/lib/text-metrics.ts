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

function containsIndicText(text: string): boolean {
  'worklet';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if ((code >= 0x0900 && code <= 0x0d7f) || (code >= 0xa8e0 && code <= 0xa8ff)) return true;
  }
  return false;
}

/** Marks that must stay on the same line as the base letter. Width is ~0. */
function isIndicCombiningMark(code: number): boolean {
  'worklet';
  if (code >= 0x0900 && code <= 0x0903) return true;
  if (code >= 0x093a && code <= 0x094d) return true;
  if (code >= 0x0951 && code <= 0x0957) return true;
  if (code === 0x0962 || code === 0x0963) return true;
  if (code >= 0x0981 && code <= 0x0983) return true;
  if (code >= 0x09bc && code <= 0x09cd) return true;
  if (code === 0x09e2 || code === 0x09e3) return true;
  if (code >= 0x0a01 && code <= 0x0a03) return true;
  if (code >= 0x0a3c && code <= 0x0a4d) return true;
  if (code >= 0x0a70 && code <= 0x0a71) return true;
  if (code >= 0x0a81 && code <= 0x0a83) return true;
  if (code >= 0x0abc && code <= 0x0acd) return true;
  if (code === 0x0ae2 || code === 0x0ae3) return true;
  if (code === 0x0b82 || code === 0x0b83) return true;
  if (code >= 0x0bbe && code <= 0x0bcd) return true;
  if (code >= 0x0c00 && code <= 0x0c04) return true;
  if (code >= 0x0c3e && code <= 0x0c56) return true;
  if (code >= 0x0c81 && code <= 0x0c83) return true;
  if (code >= 0x0cbc && code <= 0x0ccd) return true;
  if (code === 0x0ce2 || code === 0x0ce3) return true;
  if (code >= 0x0d00 && code <= 0x0d03) return true;
  if (code >= 0x0d3e && code <= 0x0d4d) return true;
  if (code >= 0x0d62 && code <= 0x0d63) return true;
  return false;
}

/** Base letter plus the combining marks that follow it. */
function takeCluster(text: string, index: number): string {
  'worklet';
  let end = index + 1;
  while (end < text.length && isIndicCombiningMark(text.charCodeAt(end))) end += 1;
  return text.slice(index, end);
}

/** Installed, decorative, and Indic faces need extra vertical room vs Default Latin. */
export function textLineHeightScale(fontFamily?: string, sample?: string): number {
  'worklet';
  if (sample && containsIndicText(sample)) return 1.18;
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
export function textLineBoxHeightMm(
  fontSizePt: number,
  lineSpacing?: LineSpacing,
  fontFamily?: string,
  sample?: string,
): number {
  'worklet';
  const fontMm = ptToMm(fontSizePt);
  const mult = lineSpacingMultiplier(lineSpacing);
  return fontMm * 1.25 * mult * textLineHeightScale(fontFamily, sample);
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
  // Combining marks sit on the previous letter and must not add a full em,
  // or a syllable wraps in the middle and the matra clips off.
  if ((code >= 0x0900 && code <= 0x0d7f) || (code >= 0xa8e0 && code <= 0xa8ff)) {
    return isIndicCombiningMark(code) ? 0 : 1.0;
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
  /**
   * Real font width in mm. The editor and the printer pass the same function
   * so a line breaks in the same place on screen and on paper.
   * The resize worklet omits it and uses the em table.
   */
  measureWidth?: (sample: string) => number;
};

/** Hard stop on line count. A guard against runaway layouts, not the wrapping rule. */
export const MAX_WRAP_LINES = 500;

function computeWrappedLinesCore({
  text,
  fontSize,
  widthMm,
  autoWrapping = 'Word',
  charSpacing = 0,
  bold = false,
  verticalDisplay = false,
  fontFamily,
  measureWidth,
}: ComputeWrappedLinesParams): string[] {
  'worklet';
  const widthOf = (sample: string) => {
    if (measureWidth) return measureWidth(sample);
    return measureTextWidthMm(sample, fontSize, charSpacing, bold, fontFamily);
  };
  if (!text || text.length === 0) return [''];

  if (verticalDisplay) {
    const chars = text.split('');
    return chars.length > 0 ? chars : [''];
  }

  if (autoWrapping === 'Close') {
    // One line, never wrapped or cut: typed line breaks become spaces (the preview does the same).
    return [text.replace(/\r?\n/g, ' ')];
  }

  // Width <= 0, NaN or Infinity must not stall wrapping. 0.5 mm is below any glyph, so a
  // too-narrow box still puts one cluster on each line (progress per line is guaranteed).
  const safeWidthMm = widthMm === widthMm && widthMm > 0.5 ? widthMm : 0.5;
  const paragraphs = text.split('\n');
  const result: string[] = [];
  let capWarned = false;
  const atCap = () => {
    if (result.length < MAX_WRAP_LINES) return false;
    if (!capWarned) {
      capWarned = true;
      console.warn('[wrap] MAX_WRAP_LINES reached, len=' + text.length + ' width=' + widthMm);
    }
    return true;
  };

  if (autoWrapping === 'Char') {
    for (let p = 0; p < paragraphs.length; p++) {
      if (atCap()) {
        result.push(paragraphs.slice(p).join(' '));
        break;
      }
      const para = paragraphs[p];
      if (para.length === 0) {
        result.push('');
        continue;
      }
      let currentLine = '';
      for (let i = 0; i < para.length; ) {
        if (atCap()) {
          // Nothing typed is dropped: the rest rides on the last line.
          currentLine += para.slice(i);
          break;
        }
        const chunk = takeCluster(para, i);
        i += chunk.length;
        const testLine = currentLine + chunk;
        if (currentLine.length > 0 && widthOf(testLine) > safeWidthMm) {
          result.push(currentLine);
          currentLine = chunk;
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
    if (atCap()) {
      result.push(paragraphs.slice(p).join(' '));
      break;
    }
    const para = paragraphs[p];
    if (para.length === 0) {
      result.push('');
      continue;
    }

    const words = para.split(' ');
    let currentLine = '';

    for (let w = 0; w < words.length; w++) {
      if (atCap()) {
        currentLine = (currentLine.length > 0 ? currentLine + ' ' : '') + words.slice(w).join(' ');
        break;
      }
      const word = words[w];
      const candidate = currentLine.length > 0 ? currentLine + ' ' + word : word;

      if (widthOf(candidate) <= safeWidthMm) {
        currentLine = candidate;
      } else {
        if (currentLine.length > 0) {
          result.push(currentLine);
          currentLine = '';
        }

        // Like any text editor: a word is only broken when it alone is wider than the line.
        if (widthOf(word) <= safeWidthMm) {
          currentLine = word;
        } else {
          let partial = '';
          for (let c = 0; c < word.length; ) {
            if (atCap()) {
              partial += word.slice(c);
              break;
            }
            const chunk = takeCluster(word, c);
            c += chunk.length;
            const testPartial = partial + chunk;
            if (partial.length > 0 && widthOf(testPartial) > safeWidthMm) {
              result.push(partial);
              partial = chunk;
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

/**
 * Compute the wrapped line segments for text content given width constraints and wrapping mode.
 * The core worklet is declared above: a worklet captures callees when it is created, so the
 * callee has to exist first.
 */
export function computeWrappedLines(params: ComputeWrappedLinesParams): string[] {
  'worklet';
  return computeWrappedLinesCore(params);
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

  const lineH = textLineBoxHeightMm(fontSize, lineSpacing, fontFamily, text);
  const vertPad = textVerticalPaddingMm(fontSize);
  return Math.max(2.2, vertPad * 2 + lineH * Math.max(1, lines.length));
}

/**
 * Largest font size (pt, half-point steps) whose wrapped block fits in `heightMm`.
 * Never returns larger than `fontSize`. A box that already fits keeps `fontSize`.
 */
export function fitFontSizeToBoxMm(opts: ComputeTextElementHeightParams & { heightMm: number; minFontSize?: number }): number {
  'worklet';
  const maxFs = opts.fontSize > 0 ? opts.fontSize : 12;
  const minFs = Math.max(4, opts.minFontSize ?? 4);
  const heightMm = opts.heightMm > 0 ? opts.heightMm : maxFs;
  const measure = (fontSize: number) =>
    computeTextElementHeightMm({
      text: opts.text,
      fontSize,
      widthMm: opts.widthMm,
      autoWrapping: opts.autoWrapping ?? 'Word',
      lineSpacing: opts.lineSpacing ?? '1.0',
      charSpacing: opts.charSpacing ?? 0,
      bold: opts.bold ?? false,
      verticalDisplay: opts.verticalDisplay ?? false,
      fontFamily: opts.fontFamily,
    });
  if (measure(maxFs) <= heightMm + 0.05) return maxFs;
  let best = minFs;
  let low = Math.round(minFs * 2);
  let high = Math.round(maxFs * 2);
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const fs = mid / 2;
    if (measure(fs) <= heightMm + 0.05) {
      best = fs;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

/** Font size to draw. Shrinks only when the wrapped block is taller than the box. */
export function resolveDrawFontSizePt(opts: ComputeTextElementHeightParams & { heightMm?: number }): number {
  'worklet';
  if (!(typeof opts.heightMm === 'number') || !(opts.heightMm > 0)) return opts.fontSize;
  return fitFontSizeToBoxMm({
    text: opts.text,
    fontSize: opts.fontSize,
    widthMm: opts.widthMm,
    heightMm: opts.heightMm,
    autoWrapping: opts.autoWrapping,
    lineSpacing: opts.lineSpacing,
    charSpacing: opts.charSpacing,
    bold: opts.bold,
    verticalDisplay: opts.verticalDisplay,
    fontFamily: opts.fontFamily,
  });
}

/** Drop a trailing line that would be sliced by the box. Complete lines stay. */
export function linesThatFitBox(
  lines: string[],
  fontSize: number,
  heightMm: number,
  lineSpacing?: LineSpacing,
  fontFamily?: string,
  sample?: string,
): string[] {
  'worklet';
  if (lines.length <= 1 || !(heightMm > 0)) return lines;
  const lineH = textLineBoxHeightMm(fontSize, lineSpacing, fontFamily, sample);
  const pad = textVerticalPaddingMm(fontSize) * 2;
  if (!(lineH > 0)) return lines;
  const cap = Math.max(1, Math.floor((heightMm - pad + 0.04) / lineH));
  return lines.length > cap ? lines.slice(0, cap) : lines;
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
  /** One line, in mm. Same box the editor Text uses (1.25 × spacing × face scale). */
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
    lineHeightMm: textLineBoxHeightMm(fontSize, lineSpacing, fontFamily, text),
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
