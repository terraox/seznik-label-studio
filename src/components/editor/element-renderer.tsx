import { computeArcTextLayout } from "@/lib/editor/arctext-layout";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import Svg, {
  Circle,
  Ellipse,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";

import { BorderPreview } from "@/components/border-preview";
import { ClipartIcon } from "@/components/clipart-icon";
import { MonoImagePreview } from "@/components/editor/mono-image-preview";
import { SignaturePreview } from "@/components/editor/signature-drawing-board";
import {
  DRAWING_COLORS,
  applyTimeOffsets,
  formatLiveDateTime,
  type ArcTextElementState,
  type BarcodeElementState,
  type DegreesElementState,
  type EditorElementState,
  type LineElementState,
  type QrcodeElementState,
  type ShapeElementState,
  type TableElementState,
  type TimeElementState,
} from "@/components/editor/types";
import { getClipartById } from "@/constants/clipart-library";
import { clipartImageUri, clipartSvgSource } from "@/lib/clipart/types";
import { useUserClipartStore } from "@/stores/user-clipart-store";
import {
  isIndicScriptFamily,
  needsComplexTextShaping,
  resolveEditorFontFamily,
  textContainsEmoji,
} from "@/lib/fonts/text-font-family";
import { useInstalledFontStore } from "@/stores/installed-font-store";
import { barcodeModulesForMode } from "@/lib/barcode-code128";
import {
  snap1DBarcodeModules,
  type SnappedBar,
} from "@/lib/barcode/barcode-snapping";
import { encodeDataMatrix } from "@/lib/barcode/datamatrix";
import { formatBarcodeHri } from "@/lib/barcode/hri";
import { encodePdf417 } from "@/lib/barcode/pdf417";
import { formatDataSourceColumn } from "@/lib/editor/data-source-display";
import {
  looksLikeImageUri,
  resolveEditorColorMode,
} from "@/lib/editor/image-mono";
import { ensureTableCells } from "@/lib/editor/table-cells";
import { ptToMm, type LabelElement } from "@/lib/label-document";
import { dotsPerMm } from "@/lib/printer/print-spec";
import { applySerialOffset } from "@/lib/serial-content";
import {
  measureTextWidthMm,
  computeWrappedLines,
  resolveDrawFontSizePt,
  textHorizontalPaddingMm,
  textLineBoxHeightMm,
  textVerticalPaddingMm,
  textWrapWidthMm,
} from "@/lib/text-metrics";
import {
  cleanNativeLines,
  rememberVisibleLines,
  visibleTextKey,
  visibleWrappedLines,
} from "@/lib/visible-text-layout";
import { stretchThenRoundBars } from "@/printing/raster/barcode-stretch";
import { borderShapeForMedia } from "@/printing/raster/border-shapes";
import { generateQrMatrix } from "@/printing/renderer/qrcode";
import { useDataStore } from "@/stores/data-store";
import { useSettingsStore } from "@/stores/settings-store";

/** Design-space black (gallery/editor). Print still flattens to 1-bit in the raster pipeline. */
export const DESIGN_INK = "#111111";

export function inkColor(drawingColorIndex: number) {
  const color = DRAWING_COLORS[drawingColorIndex] ?? DESIGN_INK;
  return drawingColorIndex === 0 || color === "#FFFFFF" ? DESIGN_INK : color;
}

function paletteColor(drawingColorIndex: number) {
  return DRAWING_COLORS[drawingColorIndex] ?? DESIGN_INK;
}

function shapeFillColor(element: ShapeElementState) {
  if (!element.fill) return "transparent";
  if (element.fillColor) return element.fillColor;
  return paletteColor(element.drawingColorIndex);
}

function fontSizePx(fontSizePt: number, scale: number) {
  return Math.max(1, ptToMm(fontSizePt) * scale);
}

function useClock(enabled: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  return now;
}

type ContentProps = {
  element: LabelElement;
  widthPx: number;
  heightPx: number;
  /** Exact printer-dot box from rectMmToDots — avoids DIP round-trip drift on print. */
  widthDots?: number;
  heightDots?: number;
  scale: number;
  /** Print capture: decode at printer-dot size so import photos match template sharpness. */
  forPrint?: boolean;
  /** Printer dpi for whole-dot border bands during ViewShot capture. */
  printDpi?: number;
  /** Host label media — circular borders draw as rings. */
  mediaShape?: string | null;
  /** Tagged border: the element box is already the outer edge. */
  strokeFromOuterEdge?: boolean;
  selectedTableCell?: { row: number; col: number } | null;
  tableSelectionColor?: string;
  /** When set, text wraps to this width instead of `element.width`. */
  layoutWidthMm?: number;
  /** Live box height during a resize. Font fitting uses this instead of `element.height`. */
  layoutHeightMm?: number;
  /** Live resize box. Line emoji sizes its SVG from these so the stroke tracks the frame. */
  frameWidth?: SharedValue<number>;
  frameHeight?: SharedValue<number>;
  /**
   * True while a text width drag is live. A second, naturally wrapping Text takes over on the
   * UI thread (no React render), so the words reflow with the frame instead of being clipped.
   */
  liveReflowSv?: SharedValue<boolean>;
};

function textStyleFor(
  state: Pick<
    EditorElementState,
    | "fontSize"
    | "fontFamily"
    | "bold"
    | "italic"
    | "underline"
    | "strikethrough"
    | "align"
    | "drawingColorIndex"
    | "antiColor"
  > & { lineSpacing?: EditorElementState["lineSpacing"] },
  scale: number,
  resolvedFamily?: string,
  sampleText?: string,
) {
  const size = fontSizePx(state.fontSize, scale);
  const decorations: string[] = [];
  if (state.underline) decorations.push("underline");
  if (state.strikethrough) decorations.push("line-through");
  const indicFace = isIndicScriptFamily(resolvedFamily);
  const fontFamily =
    sampleText && textContainsEmoji(sampleText) ? undefined : resolvedFamily;
  const faceKey = resolvedFamily ?? state.fontFamily;
  return {
    fontSize: size,
    lineHeight: textLineBoxHeightMm(state.fontSize, state.lineSpacing, faceKey, sampleText) * scale,
    paddingVertical: textVerticalPaddingMm(state.fontSize) * scale,
    paddingHorizontal: textHorizontalPaddingMm(state.fontSize) * scale,
    includeFontPadding: false,
    fontFamily,
    // Android may drop the bundled Indic face when fontWeight is set on a single-weight TTF.
    fontWeight: indicFace
      ? undefined
      : state.bold
        ? ("600" as const)
        : ("400" as const),
    fontStyle: state.italic ? ("italic" as const) : ("normal" as const),
    textDecorationLine: (decorations.join(" ") || "none") as
      | "none"
      | "underline"
      | "line-through"
      | "underline line-through",
    textAlign: (state.align === "spacing" ? "justify" : state.align) as
      | "left"
      | "center"
      | "right"
      | "justify",
    color: state.antiColor ? "#FFFFFF" : inkColor(state.drawingColorIndex),
  };
}

type TextLayoutFields = Pick<
  EditorElementState,
  | "contentType"
  | "columnNameContent"
  | "fontSize"
  | "width"
  | "charSpacing"
  | "bold"
  | "align"
  | "autoWrapping"
  | "verticalDisplay"
  | "lineSpacing"
  | "italic"
  | "underline"
  | "strikethrough"
  | "fontFamily"
  | "drawingColorIndex"
  | "antiColor"
  | "autoTextHeight"
  | "height"
> & { degreesOffset?: number };

function resolveTextRaw(
  element: Pick<
    TextLayoutFields,
    "contentType" | "columnNameContent" | "degreesOffset"
  >,
  textValue: string,
  showColumnName: boolean,
): string {
  if (element.contentType === "Data Source" && element.columnNameContent) {
    return formatDataSourceColumn(element.columnNameContent, showColumnName);
  }
  if (element.contentType === "Degrees") {
    return applySerialOffset(textValue, element.degreesOffset ?? 1, 1);
  }
  return textValue;
}

function dataColumnHighlightStyle(
  element: Pick<TextLayoutFields, "contentType" | "columnNameContent">,
  highlightColumnName: boolean,
) {
  if (
    highlightColumnName &&
    element.contentType === "Data Source" &&
    element.columnNameContent
  ) {
    return { backgroundColor: "rgba(255, 235, 59, 0.35)" };
  }
  return null;
}

function visibleLayout(
  element: TextLayoutFields,
  raw: string,
  layoutWidthMm: number | undefined,
  resolvedFamily: string | undefined,
) {
  return {
    text: raw,
    fontSize: element.fontSize,
    widthMm: layoutWidthMm ?? element.width,
    autoWrapping: element.autoWrapping,
    lineSpacing: element.lineSpacing,
    charSpacing: element.charSpacing ?? 0,
    bold: element.bold ?? false,
    verticalDisplay: element.verticalDisplay ?? false,
    fontFamily: resolvedFamily ?? element.fontFamily,
  };
}

function formatTextForRender(
  element: TextLayoutFields,
  raw: string,
  layoutWidthMm?: number,
  resolvedFamily?: string,
) {
  if (element.autoWrapping === "Close" && !element.verticalDisplay) {
    return {
      text: raw.replace(/\r?\n/g, " "),
      numberOfLines: 1 as number | undefined,
      ellipsizeMode: "tail" as const,
      layoutKey: "",
    };
  }
  const layout = visibleLayout(element, raw, layoutWidthMm, resolvedFamily);
  // Live resize uses the same wrap as the frame height so the lines and the box
  // move together. Resting text keeps the measured preview lines.
  const lines =
    layoutWidthMm != null
      ? computeWrappedLines({
          text: raw,
          fontSize: element.fontSize,
          widthMm: textWrapWidthMm(layoutWidthMm, element.fontSize, false),
          autoWrapping: element.autoWrapping,
          charSpacing: element.charSpacing ?? 0,
          bold: element.bold ?? false,
          verticalDisplay: element.verticalDisplay ?? false,
          fontFamily: resolvedFamily ?? element.fontFamily,
        })
      : visibleWrappedLines(layout);
  return {
    text: lines.join("\n"),
    numberOfLines: undefined as number | undefined,
    layoutKey: visibleTextKey(layout),
  };
}

/**
 * Opacity swap between the resting text (explicit, print-accurate lines) and the live text
 * (native wrap) during a width drag. Both stay mounted so the swap is a UI-thread flip.
 */
function useReflowSwapStyles(liveReflowSv?: SharedValue<boolean>) {
  const resting = useAnimatedStyle(() => ({ opacity: liveReflowSv?.value ? 0 : 1 }));
  const live = useAnimatedStyle(() => ({ opacity: liveReflowSv?.value ? 1 : 0 }));
  return { resting, live };
}

function letterSpacingStyle(
  element: Pick<TextLayoutFields, "charSpacing" | "fontSize">,
  text: string | undefined,
  scale: number,
) {
  const spacing = element.charSpacing ?? 0;
  if (spacing <= 0) return null;
  if (text && needsComplexTextShaping(text)) return null;
  // RN takes letterSpacing in px on both platforms (Android converts to em itself), and the
  // font size is ptToMm * scale, so the spacing must be mm * scale to match print.
  return { letterSpacing: spacing * scale };
}

/**
 * Native lines are only trusted once the preview scale has stopped changing. While the canvas
 * is still fitting, the box is laid out at a throw-away size, the text no longer fits and React
 * Native breaks it mid-word; caching that would freeze the broken lines for good.
 */
function useSettledLineMemory(scale: number) {
  const pendingLines = useRef<{ key: string; lines: string[] } | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settleTimer.current != null) clearTimeout(settleTimer.current);
      settleTimer.current = null;
      pendingLines.current = null;
    },
    [scale],
  );
  return (key: string, lines: string[]) => {
    pendingLines.current = { key, lines };
    if (settleTimer.current != null) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      const pending = pendingLines.current;
      pendingLines.current = null;
      if (pending) rememberVisibleLines(pending.key, pending.lines);
    }, 250);
  };
}

function TextContent({
  element,
  scale,
  heightPx,
  layoutWidthMm,
  layoutHeightMm,
  liveReflowSv,
}: {
  element: TextLayoutFields & { text: string };
  scale: number;
  widthPx: number;
  heightPx?: number;
  layoutWidthMm?: number;
  layoutHeightMm?: number;
  liveReflowSv?: SharedValue<boolean>;
}) {
  const showColumnName = useSettingsStore((s) => s.editor.showColumnName);
  const highlightColumnName = useSettingsStore(
    (s) => s.editor.highlightColumnName,
  );
  const raw = resolveTextRaw(element, element.text, showColumnName);
  const resolvedFamily = resolveEditorFontFamily(raw, element.fontFamily);
  const frameH =
    layoutHeightMm ??
    (scale > 0 && typeof heightPx === "number" && heightPx > 0 ? heightPx / scale : element.height);
  const autoHeight = element.autoTextHeight !== false && element.autoWrapping !== "Close";
  const drawFont =
    autoHeight || layoutWidthMm != null
      ? element.fontSize
      : typeof frameH === "number" && frameH > 0
        ? resolveDrawFontSizePt({
            text: raw,
            fontSize: element.fontSize,
            widthMm: element.width,
            heightMm: frameH,
            autoWrapping: element.autoWrapping,
            lineSpacing: element.lineSpacing,
            charSpacing: element.charSpacing,
            bold: element.bold,
            verticalDisplay: element.verticalDisplay,
            fontFamily: resolvedFamily ?? element.fontFamily,
          })
        : element.fontSize;
  const drawElement = drawFont === element.fontSize ? element : { ...element, fontSize: drawFont };
  const style = textStyleFor(drawElement, scale, resolvedFamily, raw);
  const formatted = formatTextForRender(drawElement, raw, layoutWidthMm, resolvedFamily);
  const align = element.align === "spacing" ? "justify" : element.align;
  const swap = useReflowSwapStyles(liveReflowSv);
  const RestingText = liveReflowSv ? (Animated.Text as unknown as typeof Text) : Text;
  const rememberWhenSettled = useSettledLineMemory(scale);
  // Native underlines sit on the font descent and overlap between lines, so draw the bars at
  // the same offsets as print (em box centred in the line, bar just below the em).
  const hasDecoration = !!(element.underline || element.strikethrough);
  const [decoLines, setDecoLines] = useState<
    { x: number; y: number; width: number; height: number; ascender: number }[]
  >([]);
  const [textOrigin, setTextOrigin] = useState({ x: 0, y: 0 });
  const emPx = Math.max(1, style.fontSize);
  const decoThick = Math.max(1, Math.round(emPx * (element.bold ? 0.09 : 0.065)));
  const decoBars = hasDecoration
    ? decoLines.flatMap((ln, idx) => {
        if (ln.width <= 0) return [];
        const top =
          textOrigin.y + style.paddingVertical + ln.y + (ln.height - emPx) / 2;
        const left = textOrigin.x + style.paddingHorizontal + ln.x;
        const bars: { key: string; left: number; top: number; width: number }[] = [];
        if (element.underline)
          bars.push({ key: `u${idx}`, left, top: top + emPx * 1.02, width: ln.width });
        if (element.strikethrough)
          bars.push({
            key: `s${idx}`,
            left,
            // Centre on the glyphs: a fixed distance above this line's own baseline.
            top:
              textOrigin.y +
              style.paddingVertical +
              ln.y +
              (ln.ascender > 0 ? ln.ascender : (ln.height + emPx) / 2) -
              emPx * 0.32 -
              decoThick / 2,
            width: ln.width,
          });
        return bars;
      })
    : [];
  return (
    <View
      style={[
        styles.fill,
        {
          justifyContent: "flex-start",
          alignItems:
            align === "center"
              ? "center"
              : align === "right"
                ? "flex-end"
                : "stretch",
          overflow: "hidden",
        },
        element.antiColor && styles.antiBg,
        dataColumnHighlightStyle(element, highlightColumnName),
      ]}
    >
      <RestingText
        allowFontScaling={false}
        style={[
          style,
          hasDecoration ? { textDecorationLine: "none" as const } : null,
          styles.textFill,
          { textAlign: align },
          letterSpacingStyle(drawElement, raw, scale),
          liveReflowSv ? swap.resting : null,
        ]}
        onLayout={
          hasDecoration
            ? (e) => setTextOrigin({ x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y })
            : undefined
        }
        numberOfLines={formatted.numberOfLines}
        ellipsizeMode={
          "ellipsizeMode" in formatted ? formatted.ellipsizeMode : undefined
        }
        onTextLayout={
          layoutWidthMm != null && !hasDecoration
            ? undefined
            : (event) => {
                if (hasDecoration) {
                  setDecoLines(
                    event.nativeEvent.lines.map((l) => ({
                      x: l.x,
                      y: l.y,
                      width: l.width,
                      height: l.height,
                      ascender: l.ascender,
                    })),
                  );
                }
                if (layoutWidthMm != null || !formatted.layoutKey) return;
                rememberWhenSettled(
                  formatted.layoutKey,
                  cleanNativeLines(
                    event.nativeEvent.lines.map((line) => line.text),
                    raw,
                  ),
                );
              }
        }
      >
        {formatted.text}
      </RestingText>
      {decoBars.map((bar) => (
        <View
          key={bar.key}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: bar.left,
            top: bar.top,
            width: bar.width,
            height: decoThick,
            backgroundColor: style.color,
          }}
        />
      ))}
      {liveReflowSv ? (
        <Animated.Text
          pointerEvents="none"
          allowFontScaling={false}
          style={[
            textStyleFor(element, scale, resolvedFamily, raw),
            styles.textFill,
            styles.liveReflowText,
            { textAlign: align },
            letterSpacingStyle(element, raw, scale),
            swap.live,
          ]}
        >
          {raw}
        </Animated.Text>
      ) : null}
    </View>
  );
}

function DegreesContent({
  element,
  scale,
  heightPx,
  layoutWidthMm,
  layoutHeightMm,
  liveReflowSv,
}: {
  element: DegreesElementState;
  scale: number;
  widthPx: number;
  heightPx?: number;
  layoutWidthMm?: number;
  layoutHeightMm?: number;
  liveReflowSv?: SharedValue<boolean>;
}) {
  const rememberWhenSettled = useSettledLineMemory(scale);
  const showColumnName = useSettingsStore((s) => s.editor.showColumnName);
  const highlightColumnName = useSettingsStore(
    (s) => s.editor.highlightColumnName,
  );
  const raw = resolveTextRaw(element, element.content, showColumnName);
  const resolvedFamily = resolveEditorFontFamily(raw, element.fontFamily);
  const frameH =
    layoutHeightMm ??
    (scale > 0 && typeof heightPx === "number" && heightPx > 0 ? heightPx / scale : element.height);
  const autoHeight = element.autoTextHeight !== false && element.autoWrapping !== "Close";
  const drawFont =
    autoHeight || layoutWidthMm != null
      ? element.fontSize
      : typeof frameH === "number" && frameH > 0
        ? resolveDrawFontSizePt({
            text: raw,
            fontSize: element.fontSize,
            widthMm: element.width,
            heightMm: frameH,
            autoWrapping: element.autoWrapping,
            lineSpacing: element.lineSpacing,
            charSpacing: element.charSpacing,
            bold: element.bold,
            verticalDisplay: element.verticalDisplay,
            fontFamily: resolvedFamily ?? element.fontFamily,
          })
        : element.fontSize;
  const drawElement = drawFont === element.fontSize ? element : { ...element, fontSize: drawFont };
  const style = textStyleFor(drawElement, scale, resolvedFamily, raw);
  const formatted = formatTextForRender(drawElement, raw, layoutWidthMm, resolvedFamily);
  const align = element.align === "spacing" ? "justify" : element.align;
  const swap = useReflowSwapStyles(liveReflowSv);
  const RestingText = liveReflowSv ? (Animated.Text as unknown as typeof Text) : Text;
  return (
    <View
      style={[
        styles.fill,
        {
          justifyContent: "flex-start",
          alignItems:
            align === "center"
              ? "center"
              : align === "right"
                ? "flex-end"
                : "stretch",
          overflow: "hidden",
        },
        element.antiColor && styles.antiBg,
        dataColumnHighlightStyle(element, highlightColumnName),
      ]}
    >
      <RestingText
        allowFontScaling={false}
        style={[
          style,
          styles.textFill,
          { textAlign: align },
          letterSpacingStyle(drawElement, raw, scale),
          liveReflowSv ? swap.resting : null,
        ]}
        numberOfLines={formatted.numberOfLines}
        ellipsizeMode={
          "ellipsizeMode" in formatted ? formatted.ellipsizeMode : undefined
        }
        onTextLayout={
          layoutWidthMm != null
            ? undefined
            : (event) => {
                if (!formatted.layoutKey) return;
                rememberWhenSettled(
                  formatted.layoutKey,
                  cleanNativeLines(
                    event.nativeEvent.lines.map((line) => line.text),
                    raw,
                  ),
                );
              }
        }
      >
        {formatted.text}
      </RestingText>
      {liveReflowSv ? (
        <Animated.Text
          pointerEvents="none"
          allowFontScaling={false}
          style={[
            textStyleFor(element, scale, resolvedFamily, raw),
            styles.textFill,
            styles.liveReflowText,
            { textAlign: align },
            letterSpacingStyle(element, raw, scale),
            swap.live,
          ]}
        >
          {raw}
        </Animated.Text>
      ) : null}
    </View>
  );
}

function TimeContent({
  element,
  scale,
}: {
  element: TimeElementState;
  scale: number;
  widthPx: number;
}) {
  const now = useClock(true);
  const adjusted = applyTimeOffsets(now, element);
  const liveText = formatLiveDateTime(adjusted);
  const style = textStyleFor(
    element,
    scale,
    resolveEditorFontFamily(liveText, element.fontFamily),
    liveText,
  );
  const align = element.align === "spacing" ? "justify" : element.align;
  return (
    <View
      style={[
        styles.fill,
        {
          justifyContent: "center",
          alignItems:
            align === "center"
              ? "center"
              : align === "right"
                ? "flex-end"
                : "stretch",
          overflow: "hidden",
        },
        element.antiColor && styles.antiBg,
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[style, styles.textFill, { textAlign: align }]}
      >
        {liveText}
      </Text>
    </View>
  );
}

/** Print capture: snap bar edges to whole printer dots (same as headless raster / TD-404 path). */
function BarcodePrintBars({
  bars,
  boxWDots,
  widthPx,
  barsHPx,
  color,
}: {
  bars: SnappedBar[];
  boxWDots: number;
  widthPx: number;
  barsHPx: number;
  color: string;
}) {
  const rounded = useMemo(
    () => stretchThenRoundBars(bars, 0, boxWDots),
    [bars, boxWDots],
  );
  const dotsToDip = boxWDots > 0 ? widthPx / boxWDots : 1;
  return (
    <View style={{ width: widthPx, height: barsHPx }}>
      {rounded.map((bar, index) => (
        <View
          key={`bar-${index}`}
          style={{
            position: "absolute",
            left: bar.x0 * dotsToDip,
            width: Math.max(dotsToDip, bar.width * dotsToDip),
            top: 0,
            height: barsHPx,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

function BarcodeContent({
  element,
  widthPx,
  heightPx,
  widthDots,
  heightDots,
  scale,
  forPrint = false,
  printDpi,
}: {
  element: BarcodeElementState;
  widthPx: number;
  heightPx: number;
  widthDots?: number;
  heightDots?: number;
  scale: number;
  forPrint?: boolean;
  printDpi?: number;
}) {
  const showColumnName = useSettingsStore((s) => s.editor.showColumnName);
  const content =
    element.contentType === "Data Source" && element.columnNameContent
      ? formatDataSourceColumn(element.columnNameContent, showColumnName)
      : element.content || "0123456789";
  const rawModules = useMemo(
    () => barcodeModulesForMode(element.encodeMode, content),
    [content, element.encodeMode],
  );
  const color = element.antiColor
    ? "#FFFFFF"
    : inkColor(element.drawingColorIndex);
  const bgColor = element.antiColor
    ? inkColor(element.drawingColorIndex)
    : "transparent";
  const labelSize = fontSizePx(element.fontSize, scale);
  const showLabel = element.textFlag !== "Hide";
  // The digit line sits in its own band. Text-frame padding is for paragraphs and
  // would push these numbers out of the barcode box, where the element clips them.
  const labelHeight = showLabel ? Math.max(Math.ceil(labelSize + 2), Math.round(labelSize * 1.25)) : 0;
  const hri = formatBarcodeHri(element.encodeMode, content);
  const align = element.align === "spacing" ? "justify" : element.align;
  const labelStyle = textStyleFor(
    element,
    scale,
    resolveEditorFontFamily(hri, element.fontFamily),
    hri,
  );

  const useDotBars =
    forPrint &&
    widthDots != null &&
    widthDots > 0 &&
    heightDots != null &&
    heightDots > 0 &&
    printDpi != null;
  const dpm = useDotBars ? dotsPerMm(printDpi) : null;
  const widthMm =
    useDotBars && dpm != null
      ? widthDots! / dpm
      : element.width > 0
        ? element.width
        : widthPx / (scale || 1);

  // Quantize barcode modules to integer hardware dots without internal quiet zone padding,
  // matching WePrint's tight fit where the selection box hugs the outermost bars and text exactly.
  const snapDpi = forPrint && printDpi != null ? printDpi : 203;
  const snapped = useMemo(() => {
    if (!rawModules) return null;
    return snap1DBarcodeModules(rawModules, widthMm, snapDpi, false);
  }, [rawModules, widthMm, snapDpi]);

  const fontHDots = useDotBars
    ? Math.max(8, Math.round(ptToMm(element.fontSize) * dpm!))
    : 0;
  const labelHDots =
    useDotBars && showLabel ? Math.max(8, Math.round(fontHDots * 1.2)) : 0;
  const barsHDots = useDotBars ? Math.max(2, heightDots - labelHDots) : 0;
  const dotsToDip = useDotBars && widthDots > 0 ? widthPx / widthDots : 1;
  const printBarsHPx = useDotBars ? barsHDots * dotsToDip : 0;
  const barsPath = useMemo(() => {
    if (!snapped) return "";
    return snapped.bars
      .map((bar) => {
        const barX = bar.x * widthPx;
        const barW = Math.max(bar.width * widthPx, 0.55);
        return `M${barX},0h${barW}v100h-${barW}Z`;
      })
      .join(" ");
  }, [snapped, widthPx]);

  const label = showLabel ? (
    <View
      style={{
        width: "100%",
        height: labelHeight,
        flexShrink: 0,
        alignItems:
          align === "center"
            ? "center"
            : align === "right"
              ? "flex-end"
              : "stretch",
        justifyContent: "center",
      }}
    >
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        style={{
          width: "100%",
          color: labelStyle.color,
          fontFamily: labelStyle.fontFamily,
          fontWeight: labelStyle.fontWeight,
          fontStyle: labelStyle.fontStyle,
          fontSize: labelSize,
          lineHeight: labelHeight,
          includeFontPadding: false,
          paddingVertical: 0,
          paddingHorizontal: 0,
          textAlign: align,
        }}
      >
        {hri}
      </Text>
    </View>
  ) : null;

  return (
    <View
      style={[
        styles.fill,
        {
          backgroundColor: bgColor,
          justifyContent: "flex-start",
          alignItems: "stretch",
        },
      ]}
    >
      {element.textFlag === "Top" ? label : null}
      {rawModules && snapped ? (
        useDotBars ? (
          <BarcodePrintBars
            bars={snapped.bars}
            boxWDots={widthDots}
            widthPx={widthPx}
            barsHPx={printBarsHPx}
            color={color}
          />
        ) : (
          <View style={{ flex: 1, width: "100%" }}>
            <Svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${widthPx} 100`}
              preserveAspectRatio="none"
            >
              <Path d={barsPath} fill={color} />
            </Svg>
          </View>
        )
      ) : (
        <View style={styles.invalidBox}>
          <Text style={styles.invalidText}>Invalid barcode content</Text>
        </View>
      )}
      {element.textFlag === "Bottom" ? label : null}
    </View>
  );
}

function QrcodeContent({
  element,
  widthPx,
  heightPx,
}: {
  element: QrcodeElementState;
  widthPx: number;
  heightPx: number;
}) {
  const showColumnName = useSettingsStore((s) => s.editor.showColumnName);
  const content =
    element.contentType === "Data Source" && element.columnNameContent
      ? formatDataSourceColumn(element.columnNameContent, showColumnName)
      : element.contentType === "Degrees"
        ? applySerialOffset(
            element.content || "https://seznik.in",
            element.degreesOffset,
            1,
          )
        : element.content || "https://seznik.in";
  const color = element.antiColor
    ? "#FFFFFF"
    : inkColor(element.drawingColorIndex);
  const bgColor = element.antiColor
    ? inkColor(element.drawingColorIndex)
    : "#FFFFFF00";

  // 1. QR Code
  const qrMatrix = useMemo(() => {
    if (element.encodeMode === "QRCode") {
      return generateQrMatrix(
        content,
        (element.errorLevel as "L" | "M" | "Q" | "H") || "M",
      );
    }
    return null;
  }, [element.encodeMode, content, element.errorLevel]);

  const qrPath = useMemo(() => {
    if (element.encodeMode !== "QRCode" || !qrMatrix) return "";
    const qz = Math.max(0, parseInt(element.zoneSize, 10));
    let d = "";
    for (let r = 0; r < qrMatrix.size; r++) {
      for (let c = 0; c < qrMatrix.size; c++) {
        if (qrMatrix.data[r * qrMatrix.size + c]) {
          const x = c + qz;
          const y = r + qz;
          d += `M${x},${y}h1v1h-1Z `;
        }
      }
    }
    return d;
  }, [element.encodeMode, qrMatrix, element.zoneSize]);

  // 2. DataMatrix (ISO/IEC 16022 authentic ECC 200)
  const isRectangular = widthPx > heightPx * 1.5;
  const dmMatrix = useMemo(() => {
    if (element.encodeMode === "DataMatrix") {
      return encodeDataMatrix(content, isRectangular);
    }
    return null;
  }, [element.encodeMode, content, isRectangular]);

  const dmPath = useMemo(() => {
    if (element.encodeMode !== "DataMatrix" || !dmMatrix) return "";
    const qz = Math.max(1, parseInt(element.zoneSize, 10) || 1);
    let d = "";
    for (let r = 0; r < dmMatrix.rows; r++) {
      for (let c = 0; c < dmMatrix.cols; c++) {
        if (dmMatrix.matrix[r][c]) {
          d += `M${c + qz},${r + qz}h1v1h-1Z `;
        }
      }
    }
    return d;
  }, [element.encodeMode, dmMatrix, element.zoneSize]);

  // 3. PDF417 (ISO/IEC 15438 authentic multi-row)
  const pdfMatrix = useMemo(() => {
    if (element.encodeMode === "PDF417") {
      return encodePdf417(content, 2);
    }
    return null;
  }, [element.encodeMode, content]);

  const pdfPath = useMemo(() => {
    if (element.encodeMode !== "PDF417" || !pdfMatrix) return "";
    const qzX = Math.max(2, parseInt(element.zoneSize, 10) || 2);
    const qzY = Math.max(2, parseInt(element.zoneSize, 10) || 2);
    let d = "";
    for (let r = 0; r < pdfMatrix.rows; r++) {
      for (let c = 0; c < pdfMatrix.cols; c++) {
        if (pdfMatrix.matrix[r][c]) {
          d += `M${c + qzX},${(r + qzY) * 3}h1v3h-1Z `;
        }
      }
    }
    return d;
  }, [element.encodeMode, pdfMatrix, element.zoneSize]);

  if (element.encodeMode === "QRCode" && qrMatrix) {
    const qz = Math.max(0, parseInt(element.zoneSize, 10));
    const totalSize = qrMatrix.size + qz * 2;

    return (
      <View style={[styles.fill, styles.center, { backgroundColor: bgColor }]}>
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${totalSize} ${totalSize}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <Path d={qrPath} fill={color} />
        </Svg>
      </View>
    );
  }

  if (element.encodeMode === "DataMatrix" && dmMatrix) {
    const qz = Math.max(1, parseInt(element.zoneSize, 10) || 1);
    const totalW = dmMatrix.cols + qz * 2;
    const totalH = dmMatrix.rows + qz * 2;

    return (
      <View style={[styles.fill, styles.center, { backgroundColor: bgColor }]}>
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${totalW} ${totalH}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <Path d={dmPath} fill={color} />
        </Svg>
      </View>
    );
  }

  if (element.encodeMode === "PDF417" && pdfMatrix) {
    const qzX = Math.max(2, parseInt(element.zoneSize, 10) || 2);
    const qzY = Math.max(2, parseInt(element.zoneSize, 10) || 2);
    const totalW = pdfMatrix.cols + qzX * 2;
    const totalH = (pdfMatrix.rows + qzY * 2) * 3;

    return (
      <View style={[styles.fill, styles.center, { backgroundColor: bgColor }]}>
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${totalW} ${totalH}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <Path d={pdfPath} fill={color} />
        </Svg>
      </View>
    );
  }

  return (
    <View style={styles.invalidBox}>
      <Text style={styles.invalidText}>Invalid 2D barcode content</Text>
    </View>
  );
}

function LineContent({
  element,
  widthPx,
  heightPx,
  scale,
}: {
  element: LineElementState;
  widthPx: number;
  heightPx: number;
  scale: number;
}) {
  const color = inkColor(element.drawingColorIndex);
  const vertical = heightPx >= widthPx * 2;
  const strokeWidth = Math.max(
    1,
    (vertical ? element.width : element.height) * scale,
  );
  const midY = heightPx / 2;
  const dash =
    element.lineStyle === "dashed"
      ? [
          Math.max(3, element.virtualInterval * scale),
          Math.max(3, element.virtualInterval * scale),
        ]
      : undefined;

  if (element.lineStyle === "slash" || element.lineStyle === "backslash") {
    const gap = Math.max(4, element.virtualInterval * scale * 2);
    const count = Math.ceil(widthPx / gap) + 2;
    const slashHeight = Math.min(heightPx, Math.max(6, strokeWidth * 4));
    return (
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${widthPx} ${heightPx}`}
        preserveAspectRatio="none"
      >
        {Array.from({ length: count }).map((_, i) => {
          const x = i * gap;
          const up = element.lineStyle === "slash";
          return (
            <Line
              key={i}
              x1={x}
              y1={up ? midY + slashHeight / 2 : midY - slashHeight / 2}
              x2={x + gap * 0.6}
              y2={up ? midY - slashHeight / 2 : midY + slashHeight / 2}
              stroke={color}
              strokeWidth={Math.max(1, strokeWidth / 2)}
            />
          );
        })}
      </Svg>
    );
  }

  if (vertical) {
    const midX = widthPx / 2;
    return (
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${widthPx} ${heightPx}`}
        preserveAspectRatio="none"
      >
        <Line
          x1={midX}
          y1={0}
          x2={midX}
          y2={heightPx}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
        />
      </Svg>
    );
  }

  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${widthPx} ${heightPx}`}
      preserveAspectRatio="none"
    >
      <Line
        x1={0}
        y1={midY}
        x2={widthPx}
        y2={midY}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
      />
    </Svg>
  );
}

function ShapeContent({
  element,
  widthPx,
  heightPx,
  scale,
  forPrint = false,
}: {
  element: ShapeElementState;
  widthPx: number;
  heightPx: number;
  scale: number;
  forPrint?: boolean;
}) {
  const color = inkColor(element.drawingColorIndex);
  const strokeWidth = Math.max(1, element.lineWidth * scale);
  // Preview: tiny pad vs AA clip. Print: half-stroke only so rings match millimetres.
  const safePad = forPrint ? 0 : Math.max(0, Math.round(scale * 0.2));
  const inset = strokeWidth / 2 + safePad;
  const fill = shapeFillColor(element);
  const innerW = Math.max(1, widthPx - strokeWidth - safePad * 2);
  const innerH = Math.max(1, heightPx - strokeWidth - safePad * 2);

  if (element.figureShape === "oval" || element.figureShape === "circle") {
    const rx =
      element.figureShape === "circle"
        ? Math.min(widthPx, heightPx) / 2 - inset
        : widthPx / 2 - inset;
    const ry =
      element.figureShape === "circle"
        ? Math.min(widthPx, heightPx) / 2 - inset
        : heightPx / 2 - inset;
    return (
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${widthPx} ${heightPx}`}
        preserveAspectRatio="none"
      >
        <Ellipse
          cx={widthPx / 2}
          cy={heightPx / 2}
          rx={Math.max(1, rx)}
          ry={Math.max(1, ry)}
          stroke={color}
          strokeWidth={strokeWidth}
          fill={fill}
        />
      </Svg>
    );
  }

  const radius =
    element.figureShape === "roundedRectangle"
      ? element.roundRadius * scale
      : 0;
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${widthPx} ${heightPx}`}
      preserveAspectRatio="none"
    >
      <Rect
        x={inset}
        y={inset}
        width={innerW}
        height={innerH}
        rx={radius}
        ry={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill={fill}
      />
    </Svg>
  );
}

/** Traces what the highlight renderer actually reads, only when the value changes. */
let lastHighlightRead = "\u0000";
function logHighlightRead(
  cell: { row: number; col: number } | null | undefined,
) {
  const key = cell ? `${cell.row},${cell.col}` : "none";
  if (key === lastHighlightRead) return;
  lastHighlightRead = key;
  console.log(`[table-cell] highlight-render reads=${key}`);
}

function TableContent({
  element,
  widthPx,
  heightPx,
  scale,
  selectedTableCell,
  tableSelectionColor = "#48C3C7",
}: {
  element: TableElementState;
  widthPx: number;
  heightPx: number;
  scale: number;
  selectedTableCell?: { row: number; col: number } | null;
  tableSelectionColor?: string;
}) {
  const showColumnName = useSettingsStore((s) => s.editor.showColumnName);
  const highlightColumnName = useSettingsStore(
    (s) => s.editor.highlightColumnName,
  );
  const table = ensureTableCells(element);
  logHighlightRead(selectedTableCell);
  const color = inkColor(
    element.drawingColorIndex > 0 ? element.drawingColorIndex : 1,
  );
  const strokeWidth = Math.max(1, element.lineWidth * scale);
  const totalRowMm = element.rowHeights.reduce((sum, h) => sum + h, 0) || 1;
  const totalColMm = element.columnWidths.reduce((sum, w) => sum + w, 0) || 1;

  const rowLines: number[] = [0];
  let acc = 0;
  for (const h of element.rowHeights) {
    acc += h;
    rowLines.push((acc / totalRowMm) * heightPx);
  }
  const colLines: number[] = [0];
  acc = 0;
  for (const w of element.columnWidths) {
    acc += w;
    colLines.push((acc / totalColMm) * widthPx);
  }

  const cellLayouts: {
    row: number;
    col: number;
    left: number;
    top: number;
    width: number;
    height: number;
  }[] = [];
  for (let r = 0; r < element.rowCount; r++) {
    for (let c = 0; c < element.columnCount; c++) {
      cellLayouts.push({
        row: r,
        col: c,
        left: colLines[c] ?? 0,
        top: rowLines[r] ?? 0,
        width: Math.max(1, (colLines[c + 1] ?? widthPx) - (colLines[c] ?? 0)),
        height: Math.max(1, (rowLines[r + 1] ?? heightPx) - (rowLines[r] ?? 0)),
      });
    }
  }

  return (
    <View style={styles.fill}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${widthPx} ${heightPx}`}
        preserveAspectRatio="none"
      >
        {rowLines.map((y, i) => (
          <Line
            key={`r${i}`}
            x1={0}
            y1={Math.min(
              heightPx - strokeWidth / 2,
              Math.max(strokeWidth / 2, y),
            )}
            x2={widthPx}
            y2={Math.min(
              heightPx - strokeWidth / 2,
              Math.max(strokeWidth / 2, y),
            )}
            stroke={color}
            strokeWidth={strokeWidth}
          />
        ))}
        {colLines.map((x, i) => (
          <Line
            key={`c${i}`}
            x1={Math.min(
              widthPx - strokeWidth / 2,
              Math.max(strokeWidth / 2, x),
            )}
            y1={0}
            x2={Math.min(
              widthPx - strokeWidth / 2,
              Math.max(strokeWidth / 2, x),
            )}
            y2={heightPx}
            stroke={color}
            strokeWidth={strokeWidth}
          />
        ))}
      </Svg>
      {cellLayouts.map(({ row, col, left, top, width, height }) => {
        const cell = table.cells?.[row]?.[col];
        const selected =
          selectedTableCell?.row === row && selectedTableCell?.col === col;
        const raw = cell ? resolveTextRaw(cell, cell.text, showColumnName) : "";
        const flat = raw.replace(/\r?\n/g, " ");
        const padX = Math.max(1, scale * 0.4);
        const innerW = Math.max(1, width - padX * 2);
        const measuredPx = cell
          ? measureTextWidthMm(flat, cell.fontSize, 0, cell.bold) * scale * 1.12
          : 0;
        const scaleX = measuredPx > innerW ? innerW / measuredPx : 1;
        const style = cell
          ? textStyleFor(
              cell,
              scale,
              resolveEditorFontFamily(flat, cell.fontFamily),
              flat,
            )
          : undefined;
        const align =
          cell?.align === "spacing" ? "justify" : (cell?.align ?? "left");
        return (
          <View
            key={`cell-${row}-${col}`}
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                left,
                top,
                width,
                height,
                overflow: "hidden",
                justifyContent: "center",
                alignItems:
                  align === "center"
                    ? "center"
                    : align === "right"
                      ? "flex-end"
                      : "stretch",
                paddingHorizontal: Math.max(1, scale * 0.4),
                paddingVertical: Math.max(0, scale * 0.2),
              },
              selected && {
                backgroundColor: `${tableSelectionColor}99`,
                borderWidth: Math.max(1, scale * 0.15),
                borderColor: tableSelectionColor,
              },
              cell && dataColumnHighlightStyle(cell, highlightColumnName),
            ]}
          >
            {cell && flat ? (
              <Text
                numberOfLines={1}
                ellipsizeMode="clip"
                style={[
                  style,
                  letterSpacingStyle(cell, flat, scale),
                  {
                    textAlign: align,
                    width: scaleX < 1 ? measuredPx : "100%",
                    ...(scaleX < 1
                      ? {
                          transform: [{ scaleX }],
                          transformOrigin: "left center" as const,
                        }
                      : null),
                  },
                ]}
              >
                {flat}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function ArcTextContent({
  element,
  widthPx,
  heightPx,
  scale,
}: {
  element: ArcTextElementState;
  widthPx: number;
  heightPx: number;
  scale: number;
}) {
  const showColumnName = useSettingsStore((s) => s.editor.showColumnName);
  const highlightColumnName = useSettingsStore(
    (s) => s.editor.highlightColumnName,
  );
  const color = element.antiColor
    ? "#FFFFFF"
    : inkColor(element.drawingColorIndex);
  const isPlaceholder = !element.text || element.text.trim().length === 0;
  const displayText =
    element.contentType === "Data Source" && element.columnNameContent
      ? formatDataSourceColumn(element.columnNameContent, showColumnName)
      : isPlaceholder
        ? "Double-tap to enter text"
        : element.text;

  const nominalFontSize = fontSizePx(element.fontSize, scale);
  const layout = useMemo(
    () =>
      computeArcTextLayout({
        text: displayText,
        widthPx,
        heightPx,
        nominalFontSizePx: nominalFontSize,
        lineWidthMm: element.lineWidth,
        scale,
        bold: element.bold,
      }),
    [
      displayText,
      widthPx,
      heightPx,
      nominalFontSize,
      element.lineWidth,
      scale,
      element.bold,
    ],
  );

  const fontFamily = resolveEditorFontFamily(displayText, element.fontFamily);
  const textColor = isPlaceholder
    ? element.antiColor
      ? "rgba(255, 255, 255, 0.65)"
      : "#334155"
    : color;

  return (
    <View
      style={[
        styles.fill,
        element.antiColor && styles.antiBg,
        dataColumnHighlightStyle(element, highlightColumnName),
      ]}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${widthPx} ${heightPx}`}>
        {/* Circular guide line matching reference specification */}
        <Circle
          cx={layout.cx}
          cy={layout.cy}
          r={layout.radius}
          stroke={color}
          strokeWidth={layout.strokeWidth}
          fill="none"
        />

        {/* Letters curved along the circular arc */}
        {layout.characters.map((item, idx) => (
          <SvgText
            key={`${idx}-${item.char}`}
            x={item.x}
            y={item.y}
            fill={textColor}
            fontSize={layout.effectiveFontSizePx}
            fontFamily={fontFamily}
            fontWeight={element.bold ? "700" : "400"}
            fontStyle={element.italic ? "italic" : "normal"}
            textDecoration={
              element.underline
                ? "underline"
                : element.strikethrough
                  ? "line-through"
                  : "none"
            }
            textAnchor="middle"
            alignmentBaseline="middle"
            dominantBaseline="middle"
            transform={`rotate(${item.rotationDeg}, ${item.x}, ${item.y})`}
          >
            {item.char}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

function ImageContent({
  element,
  widthPx,
  heightPx,
  forPrint,
}: {
  element: Extract<LabelElement, { type: "image" }>;
  widthPx: number;
  heightPx: number;
  forPrint?: boolean;
}) {
  const excelFiles = useDataStore((s) => s.excelFiles);
  const activeRow = useDataStore((s) => s.activeRowIndex);
  let displayUri = forPrint ? element.printUri || element.uri : element.uri;
  if (
    !forPrint &&
    element.contentType === "Data Source" &&
    element.columnNameContent
  ) {
    for (const file of excelFiles) {
      const sheet = file.sheets[file.activeSheetIndex] ?? file.sheets[0];
      if (!sheet) continue;
      const idx = sheet.columns.indexOf(element.columnNameContent);
      if (idx < 0) continue;
      const value = String(sheet.rows[activeRow]?.[idx] ?? "");
      if (looksLikeImageUri(value)) {
        displayUri = value;
        break;
      }
    }
  }
  return (
    <MonoImagePreview
      uri={displayUri}
      widthPx={widthPx}
      heightPx={heightPx}
      colorMode={element.colorMode}
      grayThreshold={element.grayThreshold ?? 128}
      tile={Boolean(element.tile)}
      contentFit={element.contentFit ?? "contain"}
      flipH={element.flipH}
      flipV={element.flipV}
      antiColor={element.antiColor}
    />
  );
}

export function ElementContentView({
  element,
  widthPx,
  heightPx,
  widthDots,
  heightDots,
  scale,
  forPrint,
  printDpi,
  mediaShape,
  strokeFromOuterEdge,
  selectedTableCell,
  tableSelectionColor,
  layoutWidthMm,
  layoutHeightMm,
  frameWidth,
  frameHeight,
  liveReflowSv,
}: ContentProps) {
  useInstalledFontStore((state) => state.revision);
  useUserClipartStore((state) => state.revision);
  switch (element.type) {
    case "text":
      return (
        <TextContent
          element={element}
          scale={scale}
          widthPx={widthPx}
          heightPx={heightPx}
          liveReflowSv={liveReflowSv}
          layoutWidthMm={layoutWidthMm}
          layoutHeightMm={layoutHeightMm}
        />
      );
    case "degrees":
      return (
        <DegreesContent
          element={element}
          scale={scale}
          widthPx={widthPx}
          heightPx={heightPx}
          liveReflowSv={liveReflowSv}
          layoutWidthMm={layoutWidthMm}
          layoutHeightMm={layoutHeightMm}
        />
      );
    case "time":
      return <TimeContent element={element} scale={scale} widthPx={widthPx} />;
    case "barcode":
      return (
        <BarcodeContent
          element={element}
          widthPx={widthPx}
          heightPx={heightPx}
          widthDots={widthDots}
          heightDots={heightDots}
          scale={scale}
          forPrint={forPrint}
          printDpi={printDpi}
        />
      );
    case "qrcode":
      return (
        <QrcodeContent
          element={element}
          widthPx={widthPx}
          heightPx={heightPx}
        />
      );
    case "line":
      return (
        <LineContent
          element={element}
          widthPx={widthPx}
          heightPx={heightPx}
          scale={scale}
        />
      );
    case "shape":
      return (
        <ShapeContent
          element={element}
          widthPx={widthPx}
          heightPx={heightPx}
          scale={scale}
          forPrint={forPrint}
        />
      );
    case "table":
      return (
        <TableContent
          element={element}
          widthPx={widthPx}
          heightPx={heightPx}
          scale={scale}
          selectedTableCell={selectedTableCell}
          tableSelectionColor={tableSelectionColor}
        />
      );
    case "arctext":
      return (
        <ArcTextContent
          element={element}
          widthPx={widthPx}
          heightPx={heightPx}
          scale={scale}
        />
      );
    case "image":
      return (
        <ImageContent
          element={element}
          widthPx={widthPx}
          heightPx={heightPx}
          forPrint={forPrint}
        />
      );
    case "clipart": {
      const sticker = getClipartById(element.clipartId);
      const previewColor =
        element.colorMode === "B & W" || element.colorMode === "Halftone"
          ? "#111827"
          : inkColor(element.drawingColorIndex);
      const unit = Math.min(widthPx, heightPx);
      const iconSize = element.tile ? Math.max(8, Math.round(unit / 5)) : unit;

      const svg = clipartSvgSource(sticker);
      const imageUri = clipartImageUri(sticker);
      const lineEmoji = element.clipartId.startsWith("le-");
      const renderGlyph = (size: number | "100%") =>
        imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={size === "100%" ? styles.fill : { width: size, height: size }}
            resizeMode="contain"
          />
        ) : svg ? (
          <ClipartIcon
            svg={svg}
            size={size}
            color={previewColor}
            strokeScale={element.strokeScale}
            fitInk={lineEmoji}
            frameWidth={lineEmoji && !element.tile && size === "100%" ? frameWidth : undefined}
            frameHeight={lineEmoji && !element.tile && size === "100%" ? frameHeight : undefined}
          />
        ) : (
          <Text style={{ fontSize: (size === "100%" ? unit : size) * 0.7, color: previewColor }}>
            {element.glyph ?? "★"}
          </Text>
        );

      if (element.tile) {
        const cols = Math.max(1, Math.ceil(widthPx / iconSize));
        const rows = Math.max(1, Math.ceil(heightPx / iconSize));
        const count = cols * rows;
        return (
          <View style={[styles.fill, styles.tileWrap]}>
            {Array.from({ length: count }, (_, index) => (
              <View
                key={index}
                style={{
                  width: widthPx / cols,
                  height: heightPx / rows,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {renderGlyph(Math.min(widthPx / cols, heightPx / rows))}
              </View>
            ))}
          </View>
        );
      }

      // Line emoji is the frame: 100% of the live box, viewBox cropped to the ink.
      // A fixed pixel glyph scaled by a parent transform leaves the stroke behind,
      // so the empty margin grows as the frame grows.
      if (lineEmoji && !element.tile) {
        return <View style={styles.fill}>{renderGlyph("100%")}</View>;
      }

      return (
        <View style={[styles.fill, styles.center]}>
          {renderGlyph(iconSize)}
        </View>
      );
    }
    case "border": {
      const shape = borderShapeForMedia(mediaShape);
      const tagged =
        strokeFromOuterEdge === true || element.geometryVersion === 1;
      if (forPrint && printDpi != null) {
        return (
          <View style={[styles.fill, { overflow: "hidden" }]}>
            <BorderPreview
              styleId={element.borderStyle}
              scale={scale}
              lineWidthMm={element.lineWidth || undefined}
              shape={shape}
              widthPx={widthPx}
              heightPx={heightPx}
              widthDots={widthDots}
              heightDots={heightDots}
              forPrint
              printDpi={printDpi}
              strokeFromOuterEdge={tagged}
            />
          </View>
        );
      }
      if (tagged) {
        return (
          <View style={styles.fillVisible}>
            <BorderPreview
              styleId={element.borderStyle}
              scale={scale}
              lineWidthMm={element.lineWidth || undefined}
              shape={shape}
              widthPx={widthPx}
              heightPx={heightPx}
              strokeFromOuterEdge
            />
          </View>
        );
      }
      const insetPx = Math.max(2, Math.round(scale * 2));
      const innerW = Math.max(1, widthPx - insetPx * 2);
      const innerH = Math.max(1, heightPx - insetPx * 2);
      return (
        <View style={[styles.fillVisible, { padding: insetPx }]}>
          <BorderPreview
            styleId={element.borderStyle}
            scale={scale}
            lineWidthMm={element.lineWidth || undefined}
            shape={shape}
            widthPx={innerW}
            heightPx={innerH}
          />
        </View>
      );
    }
    case "signature": {
      const mode = resolveEditorColorMode(element.colorMode);
      const color =
        forPrint || mode !== "Original"
          ? DESIGN_INK
          : inkColor(element.drawingColorIndex);
      return (
        <View style={styles.fill}>
          <SignaturePreview
            strokes={element.strokes}
            width={widthPx}
            height={heightPx}
            color={color}
          />
        </View>
      );
    }
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  fill: {
    width: "100%",
    height: "100%",
    flexShrink: 0,
    overflow: "visible",
  },
  fillVisible: {
    width: "100%",
    height: "100%",
    overflow: "visible",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  tileWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignContent: "flex-start",
  },
  antiBg: {
    backgroundColor: "#111827",
  },
  textFill: {
    width: "100%",
    flexShrink: 0,
  },
  liveReflowText: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  invalidBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5484D",
  },
  invalidText: {
    fontSize: 10,
    color: "#E5484D",
  },
});
