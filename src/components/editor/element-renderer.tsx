import { ModedTileImage } from "@/components/editor/moded-tile-image";
import { useModedTile } from "@/components/editor/use-moded-tile";
import { usesModedPrint } from "@/printing/raster/image-element-settings";
import { computeArcTextLayout } from "@/lib/editor/arctext-layout";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from "react-native-reanimated";
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
import { SignaturePreview } from "@/components/editor/signature-preview";
import {
  DEFAULT_ELEMENT_STATE,
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
  needsComplexTextShaping,
  resolveEditorFontFamily,
  textContainsEmoji,
} from "@/lib/fonts/text-font-family";
import {
  PREVIEW_ITALIC_SKEW_DEG,
  previewItalicWrapStyle,
  previewFontStyle,
  previewSyntheticBoldStyle,
  resolvePreviewFontStyle,
} from "@/lib/fonts/preview-text-style";
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
import { applySerialOffset, logLegacySerial } from "@/lib/serial-content";
import {
  measureTextWidthMm,
  resolveDrawFontSizePt,
  textHorizontalPaddingMm,
  textLineBoxHeightMm,
  textVerticalPaddingMm,
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

function shapeFillColor(element: ShapeElementState) {
  if (!element.fill) return "transparent";
  if (element.fillColor) return element.fillColor;
  // Palette slot 0 is white (paper), which made the fill invisible; print fills with ink.
  return inkColor(element.drawingColorIndex);
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
  /** Live box width in px. The reflow Text sizes from this on the UI thread. */
  liveWidthSv?: SharedValue<number>;
  /** Written with the native live-text laid-out height in px while reflowing. */
  liveHeightSv?: SharedValue<number>;
  /**
   * Wrapped lines for every reachable width (smallest width each layout starts at, mm). While a
   * width drag is live the matching layout is shown on the UI thread: the same lines the resting
   * text and print use, so nothing re-wraps on release. Without it the native live text is used.
   */
  liveBank?: LiveTextBank;
};

export type LiveTextBank = { starts: number[]; lines: string[][]; maxWidthMm: number };

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
  // Emoji uses the system emoji face; Indic/custom cuts are single-weight TTFs.
  const requestedFamily =
    sampleText && textContainsEmoji(sampleText) ? undefined : resolvedFamily;
  const preview = resolvePreviewFontStyle(requestedFamily, !!state.bold);
  const color = state.antiColor ? "#FFFFFF" : inkColor(state.drawingColorIndex);
  const faceKey = resolvedFamily ?? state.fontFamily;
  return {
    fontSize: size,
    lineHeight: textLineBoxHeightMm(state.fontSize, state.lineSpacing, faceKey, sampleText) * scale,
    paddingVertical: textVerticalPaddingMm(state.fontSize) * scale,
    paddingHorizontal: textHorizontalPaddingMm(state.fontSize) * scale,
    includeFontPadding: false,
    fontFamily: preview.fontFamily,
    // Named expo faces ignore fontWeight; system default still uses it.
    // iOS: italic is a wrapper skew (print ITALIC_SKEW). Android drops View skew, so it uses fontStyle.
    fontWeight: preview.fontWeight,
    fontStyle: previewFontStyle(state.italic),
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
    color,
    ...(preview.syntheticBold ? previewSyntheticBoldStyle(color, size) ?? {} : {}),
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
    const shown = applySerialOffset(textValue, element.degreesOffset ?? 1, 1);
    logLegacySerial("renderer displays", textValue, element.degreesOffset ?? 1, 1, shown);
    return shown;
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
      ellipsizeMode: "clip" as const,
      layoutKey: "",
    };
  }
  const layout = visibleLayout(element, raw, layoutWidthMm, resolvedFamily);
  // Resting and live resize wrap with the one measurer (same face as print) that also sizes
  // the frame, so lines, box height and drawn glyphs agree at every width.
  const lines = visibleWrappedLines(layout);
  return {
    text: lines.join("\n"),
    numberOfLines: undefined as number | undefined,
    layoutKey: visibleTextKey(layout),
  };
}

/**
 * Opacity swap between the resting text (explicit, print-accurate lines) and the live text
 * (native wrap) during a width drag. Both stay mounted so the swap is a UI-thread flip.
 * Live width is applied on the UI thread so words reflow in the same frame as the handle.
 */
function useReflowSwapStyles(
  liveReflowSv?: SharedValue<boolean>,
  liveWidthSv?: SharedValue<number>,
) {
  const resting = useAnimatedStyle(() => ({ opacity: liveReflowSv?.value ? 0 : 1 }));
  const live = useAnimatedStyle(() => {
    const width = liveWidthSv && liveWidthSv.value > 0 ? liveWidthSv.value : undefined;
    return {
      opacity: liveReflowSv?.value ? 1 : 0,
      ...(width != null ? { width } : null),
    };
  });
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
function useSettledLineMemory(scale: number, liveReflowSv?: SharedValue<boolean>) {
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
      // A drag that started after this was scheduled would re-render the frame mid-drag.
      if (liveReflowSv?.value) return;
      if (pending) rememberVisibleLines(pending.key, pending.lines);
    }, 250);
  };
}

/**
 * Every wrapped layout of a text, stacked; only the one whose width range holds the live width
 * is visible. The layers have a fixed width, so a width drag never makes native re-measure any
 * of them (that was the cost): the frame's width only moves one transform for centre/right
 * alignment, one derived index picks the layer, and each layer flips an opacity on the UI thread.
 */
function LiveTextLayers({
  starts,
  lines,
  fixedWidthPx,
  align,
  scale,
  liveReflowSv,
  liveWidthSv,
  wrapStyle,
  textStyle,
}: {
  starts: number[];
  lines: string[][];
  fixedWidthPx: number;
  align: "left" | "center" | "right" | "justify";
  scale: number;
  liveReflowSv: SharedValue<boolean>;
  liveWidthSv: SharedValue<number>;
  wrapStyle: StyleProp<ViewStyle>;
  textStyle: StyleProp<TextStyle>;
}) {
  const active = useDerivedValue(() => {
    if (!liveReflowSv.value) return -1;
    const widthMm = liveWidthSv.value / Math.max(0.0001, scale);
    let index = 0;
    for (let i = 1; i < starts.length; i += 1) {
      if (starts[i] - 0.0001 <= widthMm) index = i;
      else break;
    }
    return index;
  });
  const shiftStyle = useAnimatedStyle(() => {
    const spare = liveWidthSv.value - fixedWidthPx;
    return {
      transform: [{ translateX: align === "center" ? spare / 2 : align === "right" ? spare : 0 }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.liveReflowText, shiftStyle]}>
      <View pointerEvents="none" style={[wrapStyle, { width: fixedWidthPx }]}>
        {lines.map((layout, index) => (
          <LiveTextLayer key={index} index={index} active={active} text={layout.join("\n")} style={textStyle} />
        ))}
      </View>
    </Animated.View>
  );
}

const LiveTextLayer = memo(function LiveTextLayer({
  index,
  active,
  text,
  style,
}: {
  index: number;
  active: SharedValue<number>;
  text: string;
  style: StyleProp<TextStyle>;
}) {
  const animated = useAnimatedStyle(() => ({ opacity: active.value === index ? 1 : 0 }));
  return (
    <Animated.Text
      pointerEvents="none"
      allowFontScaling={false}
      style={[style, { position: "absolute", left: 0, top: 0, width: "100%" }, animated]}
    >
      {text}
    </Animated.Text>
  );
});

function TextContent({
  element,
  scale,
  heightPx,
  layoutWidthMm,
  layoutHeightMm,
  liveReflowSv,
  liveWidthSv,
  liveHeightSv,
  liveBank,
}: {
  element: TextLayoutFields & { text: string };
  scale: number;
  widthPx: number;
  heightPx?: number;
  layoutWidthMm?: number;
  layoutHeightMm?: number;
  liveReflowSv?: SharedValue<boolean>;
  liveWidthSv?: SharedValue<number>;
  liveHeightSv?: SharedValue<number>;
  liveBank?: LiveTextBank;
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
  const swap = useReflowSwapStyles(liveReflowSv, liveWidthSv);
  const RestingText = liveReflowSv ? (Animated.Text as unknown as typeof Text) : Text;
  const rememberWhenSettled = useSettledLineMemory(scale, liveReflowSv);
  // Native underlines sit on the font descent and overlap between lines, so draw the bars at
  // the same offsets as print (em box centred in the line, bar just below the em).
  const hasDecoration = !!(element.underline || element.strikethrough);
  const [deco, setDeco] = useState<{
    sig: string;
    lines: { x: number; y: number; width: number; height: number; ascender: number; descender: number }[];
  }>({ sig: "", lines: [] });
  const [textOrigin, setTextOrigin] = useState({ x: 0, y: 0 });
  const emPx = Math.max(1, style.fontSize);
  const decoThick = Math.max(1, Math.round(emPx * (element.bold ? 0.09 : 0.065)));
  // Bars are only trusted for the exact text/size they were measured at; until then (a fresh
  // toggle, a resize) the native decoration shows so the line never lags or sits in a stale spot.
  const decoSig = `${element.underline ? 1 : 0}${element.strikethrough ? 1 : 0}|${style.fontSize}|${
    element.bold ? 1 : 0
  }|${element.align}|${layoutWidthMm ?? element.width}|${raw}`;
  const barsReady = hasDecoration && deco.sig === decoSig;
  const decoBars = barsReady
    ? deco.lines.flatMap((ln, idx) => {
        if (ln.width <= 0) return [];
        const top =
          textOrigin.y + style.paddingVertical + ln.y + (ln.height - emPx) / 2;
        const left = textOrigin.x + style.paddingHorizontal + ln.x;
        const bars: { key: string; left: number; top: number; width: number }[] = [];
        if (element.underline)
          bars.push({
            key: `u${idx}`,
            left,
            // Hang from this line's own baseline, below the deepest descender (p, g, j, y), so
            // the bar clears every glyph whatever the face, weight or italic.
            top:
              ln.ascender > 0
                ? textOrigin.y +
                  style.paddingVertical +
                  ln.y +
                  ln.ascender +
                  Math.max(ln.descender, emPx * 0.25) +
                  decoThick * 0.4
                : top + emPx * 1.02,
            width: ln.width,
          });
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
          // Text is never clipped (print does not clip): a frame a line short, or a Close line
          // wider than the box, shows all of it.
          overflow: "visible",
        },
        element.antiColor && styles.antiBg,
        dataColumnHighlightStyle(element, highlightColumnName),
      ]}
    >
      {/* Italic skew on a View — Text fontStyle is ignored for expo-font cuts (same as print). */}
      <View
        style={[styles.textFill, previewItalicWrapStyle(element.italic)]}
        collapsable={false}
        onLayout={(e) => {
          const { x, y } = e.nativeEvent.layout;
          setTextOrigin((prev) => (prev.x === x && prev.y === y ? prev : { x, y }));
        }}
      >
        <RestingText
          // Remount on a decoration toggle: native layout is unchanged, so onTextLayout
          // would never re-fire and the bars would not be measured.
          key={hasDecoration ? "deco" : "plain"}
          allowFontScaling={false}
          style={[
            style,
            barsReady ? { textDecorationLine: "none" as const } : null,
            { width: "100%" },
            { textAlign: align },
            letterSpacingStyle(drawElement, raw, scale),
            liveReflowSv ? swap.resting : null,
          ]}
          numberOfLines={formatted.numberOfLines}
          ellipsizeMode={
            "ellipsizeMode" in formatted ? formatted.ellipsizeMode : undefined
          }
          onTextLayout={
            layoutWidthMm != null && !hasDecoration
              ? undefined
              : (event) => {
                  if (hasDecoration) {
                    setDeco({
                      sig: decoSig,
                      lines: event.nativeEvent.lines.map((l) => ({
                        x: l.x,
                        y: l.y,
                        width: l.width,
                        height: l.height,
                        ascender: l.ascender,
                        descender: l.descender,
                      })),
                    });
                  }
                  // Live width drag reflows every frame; caching those lines would thrash the
                  // canvas and freeze a mid-drag wrap after release.
                  if (liveReflowSv?.value) return;
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
      </View>
      {decoBars.length > 0 ? (
        // Hidden while the width handle reflows: the live text carries its own native line.
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, liveReflowSv ? swap.resting : null]}
        >
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
        </Animated.View>
      ) : null}
      {liveReflowSv && liveWidthSv && liveBank && liveBank.starts.length > 0 ? (
        <LiveTextLayers
          starts={liveBank.starts}
          lines={liveBank.lines}
          fixedWidthPx={Math.max(1, liveBank.maxWidthMm * scale)}
          align={align}
          scale={scale}
          liveReflowSv={liveReflowSv}
          liveWidthSv={liveWidthSv}
          wrapStyle={previewItalicWrapStyle(element.italic)}
          textStyle={[style, { textAlign: align }, letterSpacingStyle(drawElement, raw, scale)]}
        />
      ) : liveReflowSv ? (
        <View
          pointerEvents="none"
          style={[styles.liveReflowText, previewItalicWrapStyle(element.italic)]}
        >
          <Animated.Text
            pointerEvents="none"
            allowFontScaling={false}
            style={[
              textStyleFor(element, scale, resolvedFamily, raw),
              { width: "100%" },
              { textAlign: align },
              letterSpacingStyle(element, raw, scale),
              swap.live,
            ]}
            numberOfLines={element.autoWrapping === "Close" ? 1 : undefined}
            ellipsizeMode={element.autoWrapping === "Close" ? "clip" : undefined}
            onLayout={(e) => {
              if (!liveHeightSv) return;
              const { width: w, height: h } = e.nativeEvent.layout;
              // Layouts arrive a frame or two late. One measured at an older width (taller when
              // the box is being widened) must not hold the frame up: fall back to the Skia bank.
              const liveW = liveWidthSv?.value ?? 0;
              if (liveW > 0 && Math.abs(w - liveW) > 1.5) {
                liveHeightSv.value = 0;
                return;
              }
              if (h > 0) liveHeightSv.value = h;
            }}
          >
            {element.autoWrapping === "Close" ? raw.replace(/\r?\n/g, " ") : raw}
          </Animated.Text>
        </View>
      ) : null}
    </View>
  );
}

/** A counter is text whose value is `content`: drawn by the Text renderer so wrapping, italic and the decoration bars are the same. */
function DegreesContent({
  element,
  ...rest
}: {
  element: DegreesElementState;
  scale: number;
  widthPx: number;
  heightPx?: number;
  layoutWidthMm?: number;
  layoutHeightMm?: number;
  liveReflowSv?: SharedValue<boolean>;
  liveWidthSv?: SharedValue<number>;
  liveHeightSv?: SharedValue<number>;
  liveBank?: LiveTextBank;
}) {
  return <TextContent element={{ ...element, text: element.content }} {...rest} />;
}

function TimeContent({
  element,
  scale,
  widthPx,
  heightPx,
}: {
  element: TimeElementState;
  scale: number;
  widthPx: number;
  heightPx?: number;
}) {
  const now = useClock(true);
  const liveText = formatLiveDateTime(applyTimeOffsets(now, element));
  // Drawn by the Text renderer (italic skew, decoration bars, same face and padding as print).
  // "Close" keeps it on one line: a narrow box shrinks the type instead of wrapping onto more lines.
  const asText = {
    ...DEFAULT_ELEMENT_STATE,
    text: liveText,
    fontSize: element.fontSize,
    fontFamily: element.fontFamily,
    bold: element.bold,
    italic: element.italic,
    underline: element.underline,
    strikethrough: element.strikethrough,
    align: element.align,
    width: element.width,
    height: element.height,
    antiColor: element.antiColor,
    drawingColorIndex: element.drawingColorIndex,
    autoWrapping: "Close" as const,
    autoTextHeight: false,
  };
  return (
    <TextContent
      element={asText}
      scale={scale}
      widthPx={widthPx}
      heightPx={heightPx}
    />
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
  // Barcodes have no Anti-Color: inverted bars are not scannable.
  const color = inkColor(element.drawingColorIndex);
  const bgColor = "transparent";
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
      style={[
        {
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
        },
        // Italic is a wrapper skew (fontStyle does nothing on these cuts); print uses the same shear.
        previewItalicWrapStyle(element.italic),
      ]}
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
          <Text allowFontScaling={false} style={styles.invalidText}>Invalid barcode content</Text>
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
      <Text allowFontScaling={false} style={styles.invalidText}>Invalid 2D barcode content</Text>
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
  // Android keeps the old fill when only the colour prop changes; a new key repaints the shape.
  const paintKey = `${element.figureShape}|${fill}|${color}|${strokeWidth}|${element.roundRadius}`;

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
        key={paintKey}
        width="100%"
        height="100%"
        viewBox={`0 0 ${widthPx} ${heightPx}`}
        preserveAspectRatio="none"
      >
        {fill !== "transparent" ? (
          <Ellipse
            cx={widthPx / 2}
            cy={heightPx / 2}
            rx={Math.max(1, rx)}
            ry={Math.max(1, ry)}
            fill={fill}
            fillOpacity={1}
            stroke="none"
          />
        ) : null}
        <Ellipse
          cx={widthPx / 2}
          cy={heightPx / 2}
          rx={Math.max(1, rx)}
          ry={Math.max(1, ry)}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
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
      key={paintKey}
      width="100%"
      height="100%"
      viewBox={`0 0 ${widthPx} ${heightPx}`}
      preserveAspectRatio="none"
    >
      {fill !== "transparent" ? (
        <Rect
          x={inset}
          y={inset}
          width={innerW}
          height={innerH}
          rx={radius}
          ry={radius}
          fill={fill}
          fillOpacity={1}
          stroke="none"
        />
      ) : null}
      <Rect
        x={inset}
        y={inset}
        width={innerW}
        height={innerH}
        rx={radius}
        ry={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
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
            {cell && flat && style ? (
              <View
                collapsable={false}
                // Italic is a shear on a wrapper (Text fontStyle does nothing on these cuts), as in Text.
                style={[{ width: "100%" }, previewItalicWrapStyle(cell.italic)]}
              >
                <Text
                  allowFontScaling={false}
                  numberOfLines={1}
                  ellipsizeMode="clip"
                  style={[
                    style,
                    // Bars below replace the native decoration, which Android often drops.
                    cell.underline || cell.strikethrough
                      ? { textDecorationLine: "none" as const }
                      : null,
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
                {(cell.underline || cell.strikethrough) &&
                  (() => {
                    const em = Math.max(1, style.fontSize);
                    const lineBox = Number(style.lineHeight) || em * 1.2;
                    const boxH = lineBox + (Number(style.paddingVertical) || 0) * 2;
                    const thick = Math.max(1, Math.round(em * (cell.bold ? 0.09 : 0.065)));
                    const barW = Math.max(1, Math.min(measuredPx || innerW, innerW));
                    const barLeft =
                      align === "center"
                        ? (innerW - barW) / 2
                        : align === "right"
                          ? innerW - barW
                          : 0;
                    const bars: { key: string; top: number }[] = [];
                    if (cell.underline)
                      bars.push({ key: "u", top: boxH / 2 + em * 0.5 + thick * 0.4 });
                    if (cell.strikethrough)
                      bars.push({ key: "s", top: boxH / 2 - thick / 2 });
                    return bars.map((bar) => (
                      <View
                        key={bar.key}
                        style={{
                          position: "absolute",
                          left: barLeft,
                          top: bar.top,
                          width: barW,
                          height: thick,
                          backgroundColor: style.color,
                        }}
                      />
                    ));
                  })()}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** Radii (px) of the underline / strikethrough arcs, measured from the glyph centres' circle. */
function arcDecorationRadii(
  element: Pick<ArcTextElementState, "underline" | "strikethrough" | "bold">,
  baselineRadius: number,
  fontSizePx: number,
) {
  const thickness = Math.max(1, fontSizePx * (element.bold ? 0.09 : 0.065));
  const bars: { key: string; radius: number; thickness: number }[] = [];
  // Glyph tops point outward, so "below the baseline" is nearer the centre.
  if (element.underline)
    bars.push({ key: "u", radius: Math.max(1, baselineRadius - fontSizePx * 0.5 - thickness), thickness });
  if (element.strikethrough) bars.push({ key: "s", radius: baselineRadius, thickness });
  return bars;
}

/** Clockwise SVG arc from `from` to `to` (radians) on a circle. */
function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const x0 = cx + r * Math.cos(from);
  const y0 = cy + r * Math.sin(from);
  const x1 = cx + r * Math.cos(to);
  const y1 = cy + r * Math.sin(to);
  const large = to - from > Math.PI ? 1 : 0;
  return `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1}`;
}

function ArcTextContent({
  element,
  widthPx,
  heightPx,
  scale,
  forPrint,
}: {
  element: ArcTextElementState;
  widthPx: number;
  heightPx: number;
  scale: number;
  forPrint?: boolean;
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
        // Anti-color inverts the circle only; filling the box would print the resize frame.
        !forPrint && dataColumnHighlightStyle(element, highlightColumnName),
      ]}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${widthPx} ${heightPx}`}>
        {element.antiColor && (
          <Circle
            cx={layout.cx}
            cy={layout.cy}
            r={layout.radius + layout.strokeWidth / 2}
            fill={forPrint ? "#000000" : "#111827"}
          />
        )}
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
            // The print threshold turns half-covered pixels black, so thin white letters on the
            // black circle vanish. A same-colour stroke keeps them as wide as black ones.
            stroke={forPrint && element.antiColor ? textColor : undefined}
            strokeWidth={
              forPrint && element.antiColor
                ? layout.effectiveFontSizePx * 0.12
                : undefined
            }
            fontSize={layout.effectiveFontSizePx}
            fontFamily={fontFamily}
            fontWeight={element.bold ? "700" : "400"}
            textAnchor="middle"
            alignmentBaseline="middle"
            dominantBaseline="middle"
            // Italic is a shear about the glyph (same angle as the Text preview and print):
            // fontStyle is ignored by single-cut fonts.
            transform={
              element.italic
                ? `rotate(${item.rotationDeg}, ${item.x}, ${item.y}) translate(${item.x}, ${item.y}) skewX(${PREVIEW_ITALIC_SKEW_DEG}) translate(${-item.x}, ${-item.y})`
                : `rotate(${item.rotationDeg}, ${item.x}, ${item.y})`
            }
          >
            {item.char}
          </SvgText>
        ))}

        {/* Underline and strikethrough follow the arc, so both can show at once */}
        {layout.characters.length > 0 &&
          arcDecorationRadii(element, layout.baselineRadius, layout.effectiveFontSizePx).map(
            ({ key, radius, thickness }) => (
              <Path
                key={key}
                d={arcPath(layout.cx, layout.cy, radius, layout.startAngle, layout.endAngle)}
                stroke={textColor}
                strokeWidth={thickness}
                fill="none"
              />
            ),
          )}
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
  const modedView = useModedTile(element, displayUri);
  if (usesModedPrint(element) && modedView) {
    return <ModedTileImage view={modedView} widthPx={widthPx} heightPx={heightPx} />;
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
  liveWidthSv,
  liveHeightSv,
  liveBank,
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
          liveWidthSv={liveWidthSv}
          liveHeightSv={liveHeightSv}
          liveBank={liveBank}
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
          liveWidthSv={liveWidthSv}
          liveHeightSv={liveHeightSv}
          liveBank={liveBank}
          layoutWidthMm={layoutWidthMm}
          layoutHeightMm={layoutHeightMm}
        />
      );
    case "time":
      return (
        <TimeContent
          element={element}
          scale={scale}
          widthPx={widthPx}
          heightPx={heightPx}
        />
      );
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
          forPrint={forPrint}
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
        ) : forPrint && !sticker ? null : (
          // Unknown clipart id: the editor shows a placeholder star, print draws nothing.
          <Text allowFontScaling={false} style={{ fontSize: (size === "100%" ? unit : size) * 0.7, color: previewColor }}>
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
    // Width comes from liveWidthSv on the UI thread so wrap tracks the handle.
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
