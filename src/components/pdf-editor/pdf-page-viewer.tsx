import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image as RNImage, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Canvas, ColorMatrix, Group, Image as SkiaImage, RuntimeShader, Skia, useImage } from '@shopify/react-native-skia';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { PdfSectionOverlays, PdfTapBusy } from '@/components/pdf-editor/pdf-section-overlays';
import type { PdfCropOverlay } from '@/components/pdf-editor/use-smart-crop';
import { MONO_IMAGE_SKSL } from '@/lib/editor/image-mono';
import { colorContrastPreviewMatrix, monoPreviewMatrix } from '@/lib/pdf-editor/sharpen';
import {
  clampCropNorm,
  ptToMm,
  tiledRepeatCount,
  type OutputSize,
  type PdfColorMode,
  type PdfWatermark,
} from '@/lib/pdf-editor/session';
import { C, themedStyles, useThemeRefresh } from '@/theme';

/** Crop box touch tuning, in screen px. */
const CROP_MIN = 40;
const CROP_GRAB = 30;
const CROP_SLOP = 18;
/**
 * Movement that turns a touch into a drag of the crop window. Anything less is
 * a tap and selects the section under it — including inside the window
 * (SMART_CROP_PLAN.md R2.5). To be confirmed on a device.
 */
const CROP_DRAG_MIN = 9;

function cropZoom(fitW: number, fitH: number, cropW: number, cropH: number) {
  'worklet';
  return Math.min(fitW / Math.max(cropW, 1), fitH / Math.max(cropH, 1));
}

const monoPreviewEffect = (() => {
  try {
    return Skia.RuntimeEffect.Make(MONO_IMAGE_SKSL);
  } catch {
    return null;
  }
})();

export function PdfPageViewer({
  uri,
  pageWpt,
  pageHpt,
  rotation,
  outputSize,
  originNorm,
  sizeNorm,
  onCropRect,
  cropEnabled,
  isCropped,
  watermark,
  watermarkEnabled,
  onStampOffset,
  sharpness,
  colorMode,
  grayThreshold,
  expand,
  hideHint,
  aspectLock = 0,
  overlays,
  onTapPage,
  busyAt,
  revealOutside,
  onOverlayActivate,
}: {
  uri: string | null;
  pageWpt: number;
  pageHpt: number;
  rotation: number;
  outputSize: OutputSize;
  originNorm: { x: number; y: number };
  sizeNorm?: { w: number; h: number };
  onCropRect: (origin: { x: number; y: number }, size: { w: number; h: number }) => void;
  cropEnabled: boolean;
  isCropped?: boolean;
  watermark: PdfWatermark | null;
  watermarkEnabled: boolean;
  onStampOffset: (o: { x: number; y: number }) => void;
  sharpness: number;
  colorMode?: PdfColorMode;
  grayThreshold?: number;
  /** Use the full space above the tools so a page can be cropped at screen size. */
  expand?: boolean;
  hideHint?: boolean;
  /** Crop box width / height to hold while resizing. 0 = free. */
  aspectLock?: number;
  /** Smart Crop outlines, page fractions. Visual only; they never take touches. */
  overlays?: PdfCropOverlay[];
  /**
   * A short stationary tap in crop mode, in screen px within the stage, with the
   * stage size. When set, a tap selects and only a drag moves the window.
   */
  onTapPage?: (pt: { x: number; y: number }, stage: { w: number; h: number }) => void;
  /** Page fractions of a tap waiting for the page to be read. */
  busyAt?: { x: number; y: number } | null;
  /** Dim the page outside the window instead of hiding it, so sections there can be seen and tapped. */
  revealOutside?: boolean;
  onOverlayActivate?: (id: string) => void;
}) {
  useThemeRefresh();
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const image = useImage(uri ?? undefined);
  const mode: PdfColorMode = colorMode ?? 'Original';
  const threshold = Number.isFinite(grayThreshold) ? (grayThreshold as number) : 160;
  const pageMmW = ptToMm(pageWpt);
  const pageMmH = ptToMm(pageHpt);

  const layout = useMemo(() => {
    const maxW = expand && measured ? measured.w : 320;
    const maxH = expand && measured ? measured.h : 340;
    const scale = Math.min(maxW / Math.max(pageMmW, 1), maxH / Math.max(pageMmH, 1));
    const dispW = pageMmW * scale;
    const dispH = pageMmH * scale;

    let winW: number;
    let winH: number;
    if (sizeNorm && sizeNorm.w > 0 && sizeNorm.h > 0) {
      winW = Math.min(dispW, Math.max(30, sizeNorm.w * dispW));
      winH = Math.min(dispH, Math.max(30, sizeNorm.h * dispH));
    } else {
      const naturalW = (outputSize.widthMm / Math.max(pageMmW, 1)) * dispW;
      const naturalH = (outputSize.heightMm / Math.max(pageMmH, 1)) * dispH;
      if (naturalW > dispW || naturalH > dispH) {
        const s = Math.min(dispW / naturalW, dispH / naturalH);
        winW = naturalW * s;
        winH = naturalH * s;
      } else {
        winW = naturalW;
        winH = naturalH;
      }
    }

    const maxOx = Math.max(0, 1 - winW / dispW);
    const maxOy = Math.max(0, 1 - winH / dispH);
    const ox = Math.min(maxOx, Math.max(0, originNorm.x));
    const oy = Math.min(maxOy, Math.max(0, originNorm.y));
    const cropLeft = ox * dispW;
    const cropTop = oy * dispH;

    return { dispW, dispH, winW, winH, ox, oy, maxOx, maxOy, cropLeft, cropTop, scale };
  }, [expand, measured, originNorm.x, originNorm.y, outputSize.heightMm, outputSize.widthMm, pageMmH, pageMmW, sizeNorm]);

  /**
   * Label frame. The saved crop (or the whole page) is rotated, then scaled to fit
   * inside the frame. Same maths as print (`planLabelRender`), so preview matches paper.
   */
  const labelFit = useMemo(() => {
    const maxW = 340;
    const maxH = 380;
    const frameScale = Math.min(
      maxW / Math.max(outputSize.widthMm, 1),
      maxH / Math.max(outputSize.heightMm, 1),
    );
    const stageW = Math.max(96, outputSize.widthMm * frameScale);
    const stageH = Math.max(64, outputSize.heightMm * frameScale);
    const clamped = isCropped ? clampCropNorm(originNorm, sizeNorm) : null;
    const cropNormW = clamped ? clamped.sizeNorm.w : 1;
    const cropNormH = clamped ? clamped.sizeNorm.h : 1;
    const cropNormX = clamped ? clamped.originNorm.x : 0;
    const cropNormY = clamped ? clamped.originNorm.y : 0;
    const srcW = Math.max(1, cropNormW * pageMmW);
    const srcH = Math.max(1, cropNormH * pageMmH);
    const turned = rotation === 90 || rotation === 270;
    const fitW = turned ? srcH : srcW;
    const fitH = turned ? srcW : srcH;
    const contain = Math.min(stageW / fitW, stageH / fitH);
    return {
      stageW,
      stageH,
      imgW: pageMmW * contain,
      imgH: pageMmH * contain,
      // Centre of the visible region, in image pixels.
      centerX: (cropNormX + cropNormW / 2) * pageMmW * contain,
      centerY: (cropNormY + cropNormH / 2) * pageMmH * contain,
      clip: {
        x: cropNormX * pageMmW * contain,
        y: cropNormY * pageMmH * contain,
        w: cropNormW * pageMmW * contain,
        h: cropNormH * pageMmH * contain,
      },
    };
  }, [
    isCropped,
    originNorm.x,
    originNorm.y,
    outputSize.heightMm,
    outputSize.widthMm,
    pageMmH,
    pageMmW,
    rotation,
    sizeNorm,
  ]);

  // Edit step passes expand so the source page fills the stage. Print keeps the label frame.
  // Smart Crop's "show the rest" mode keeps the whole page; otherwise the crop window is zoomed to fill.
  const fillPage = Boolean(expand) && !cropEnabled;
  const zoomCrop = cropEnabled && !revealOutside;
  const pageFit = useMemo(() => {
    const maxW = measured?.w ?? 320;
    const maxH = measured?.h ?? 340;
    const turned = rotation === 90 || rotation === 270;
    const visW = turned ? pageMmH : pageMmW;
    const visH = turned ? pageMmW : pageMmH;
    const scale = Math.min(maxW / Math.max(visW, 1), maxH / Math.max(visH, 1));
    const imgW = pageMmW * scale;
    const imgH = pageMmH * scale;
    return {
      stageW: visW * scale,
      stageH: visH * scale,
      imgW,
      imgH,
      centerX: imgW / 2,
      centerY: imgH / 2,
    };
  }, [measured, pageMmH, pageMmW, rotation]);

  const activeStageW = cropEnabled ? layout.dispW : fillPage ? pageFit.stageW : labelFit.stageW;
  const activeStageH = cropEnabled ? layout.dispH : fillPage ? pageFit.stageH : labelFit.stageH;
  const activeImgW = cropEnabled ? layout.dispW : fillPage ? pageFit.imgW : labelFit.imgW;
  const activeImgH = cropEnabled ? layout.dispH : fillPage ? pageFit.imgH : labelFit.imgH;
  const activeCenterX = cropEnabled ? layout.dispW / 2 : fillPage ? pageFit.centerX : labelFit.centerX;
  const activeCenterY = cropEnabled ? layout.dispH / 2 : fillPage ? pageFit.centerY : labelFit.centerY;
  const contentClip =
    cropEnabled || fillPage
      ? undefined
      : Skia.XYWHRect(labelFit.clip.x, labelFit.clip.y, labelFit.clip.w, labelFit.clip.h);
  const contentTurn = cropEnabled ? 0 : (rotation * Math.PI) / 180;

  // Reanimated UI-thread shared values for zero-latency dragging
  const cropX = useSharedValue(layout.cropLeft);
  const cropY = useSharedValue(layout.cropTop);
  const cropW = useSharedValue(layout.winW);
  const cropH = useSharedValue(layout.winH);
  const dispW = useSharedValue(layout.dispW);
  const dispH = useSharedValue(layout.dispH);
  const fitW = useSharedValue(measured?.w ?? layout.dispW);
  const fitH = useSharedValue(measured?.h ?? layout.dispH);
  const zoomMode = useSharedValue(zoomCrop);
  const gestureActive = useSharedValue(false);
  const cropMode = useSharedValue(0);
  // Whether this touch actually became a drag. A tap that wins must not commit.
  const panStarted = useSharedValue(false);
  const lockAspect = useSharedValue(aspectLock);

  const startCrop = useSharedValue({
    left: layout.cropLeft,
    top: layout.cropTop,
    w: layout.winW,
    h: layout.winH,
  });

  const stampNormX = useSharedValue(watermark?.stamp?.offsetNorm.x ?? 0.5);
  const stampNormY = useSharedValue(watermark?.stamp?.offsetNorm.y ?? 0.5);
  const startStamp = useSharedValue({
    x: watermark?.stamp?.offsetNorm.x ?? 0.5,
    y: watermark?.stamp?.offsetNorm.y ?? 0.5,
  });

  useEffect(() => {
    lockAspect.value = aspectLock;
  }, [aspectLock, lockAspect]);

  useEffect(() => {
    dispW.value = layout.dispW;
    dispH.value = layout.dispH;
    fitW.value = measured?.w ?? layout.dispW;
    fitH.value = measured?.h ?? layout.dispH;
    zoomMode.value = zoomCrop;
    if (gestureActive.value) return;
    cropX.value = layout.cropLeft;
    cropY.value = layout.cropTop;
    cropW.value = layout.winW;
    cropH.value = layout.winH;
  }, [
    layout.cropLeft,
    layout.cropTop,
    layout.winW,
    layout.winH,
    layout.dispW,
    layout.dispH,
    measured,
    zoomCrop,
    fitW,
    fitH,
    zoomMode,
    cropX,
    cropY,
    cropW,
    cropH,
    dispW,
    dispH,
    gestureActive,
  ]);

  useEffect(() => {
    stampNormX.value = watermark?.stamp?.offsetNorm.x ?? 0.5;
    stampNormY.value = watermark?.stamp?.offsetNorm.y ?? 0.5;
  }, [watermark?.stamp?.offsetNorm.x, watermark?.stamp?.offsetNorm.y, stampNormX, stampNormY]);

  // Animated styles
  const cropBoxStyle = useAnimatedStyle(() => ({
    left: cropX.value,
    top: cropY.value,
    width: cropW.value,
    height: cropH.value,
  }));

  const topMaskStyle = useAnimatedStyle(() => ({
    top: 0,
    left: 0,
    right: 0,
    height: Math.max(0, cropY.value),
  }));

  const bottomMaskStyle = useAnimatedStyle(() => ({
    top: cropY.value + cropH.value,
    left: 0,
    right: 0,
    bottom: 0,
  }));

  const leftMaskStyle = useAnimatedStyle(() => ({
    top: cropY.value,
    left: 0,
    width: Math.max(0, cropX.value),
    height: cropH.value,
  }));

  const rightMaskStyle = useAnimatedStyle(() => ({
    top: cropY.value,
    left: cropX.value + cropW.value,
    right: 0,
    height: cropH.value,
  }));

  const cropViewportStyle = useAnimatedStyle(() => {
    const zoom = cropZoom(fitW.value, fitH.value, cropW.value, cropH.value);
    const viewW = cropW.value * zoom;
    const viewH = cropH.value * zoom;
    return {
      position: 'absolute',
      left: (fitW.value - viewW) / 2,
      top: (fitH.value - viewH) / 2,
      width: viewW,
      height: viewH,
    };
  });

  const cropImageStyle = useAnimatedStyle(() => {
    const zoom = cropZoom(fitW.value, fitH.value, cropW.value, cropH.value);
    const dw = dispW.value;
    const dh = dispH.value;
    return {
      width: dw,
      height: dh,
      transform: [
        { translateX: -cropX.value * zoom + (dw / 2) * (zoom - 1) },
        { translateY: -cropY.value * zoom + (dh / 2) * (zoom - 1) },
        { scale: zoom },
      ],
    };
  });

  const stampW = Math.max(110, Math.min(activeStageW * 0.9, activeStageW * (watermark?.stamp?.sizeNorm ?? 0.42)));
  const stampH = Math.max(42, Math.round(stampW * 0.35));

  const stampWrapperStyle = useAnimatedStyle(() => {
    const stageWidth = cropEnabled ? cropW.value : activeStageW;
    const stageHeight = cropEnabled ? cropH.value : activeStageH;
    const maxX = Math.max(0, stageWidth - stampW);
    const maxY = Math.max(0, stageHeight - stampH);
    const baseLeft = cropEnabled ? cropX.value : 0;
    const baseTop = cropEnabled ? cropY.value : 0;
    const tx = baseLeft + stampNormX.value * maxX;
    const ty = baseTop + stampNormY.value * maxY;
    return {
      transform: [
        { translateX: tx },
        { translateY: ty },
      ],
    };
  });

  const commitCrop = useCallback(() => {
    'worklet';
    gestureActive.value = false;
    const dw = Math.max(1, dispW.value);
    const dh = Math.max(1, dispH.value);
    runOnJS(onCropRect)(
      { x: cropX.value / dw, y: cropY.value / dh },
      { w: cropW.value / dw, h: cropH.value / dh },
    );
  }, [cropH, cropW, cropX, cropY, dispH, dispW, gestureActive, onCropRect]);

  // One pan gesture for the whole crop box. The grab point decides what moves:
  // a corner, one edge, or (inside) the whole box. No stacked handles to steal touches.
  const cropGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(CROP_DRAG_MIN)
        .maxPointers(1)
        .onBegin((e) => {
          'worklet';
          panStarted.value = false;
          let l = cropX.value;
          let t = cropY.value;
          let r = l + cropW.value;
          let b = t + cropH.value;
          if (zoomMode.value) {
            const zoom = cropZoom(fitW.value, fitH.value, cropW.value, cropH.value);
            const viewW = cropW.value * zoom;
            const viewH = cropH.value * zoom;
            l = (fitW.value - viewW) / 2;
            t = (fitH.value - viewH) / 2;
            r = l + viewW;
            b = t + viewH;
          }
          const zx = Math.min(CROP_GRAB, (r - l) / 3);
          const zy = Math.min(CROP_GRAB, (b - t) / 3);
          let m = 0;
          if (
            e.x >= l - CROP_SLOP &&
            e.x <= r + CROP_SLOP &&
            e.y >= t - CROP_SLOP &&
            e.y <= b + CROP_SLOP
          ) {
            if (e.x <= l + zx) m |= 1;
            else if (e.x >= r - zx) m |= 2;
            if (e.y <= t + zy) m |= 4;
            else if (e.y >= b - zy) m |= 8;
            if (m === 0) m = 16;
          }
          cropMode.value = m;
          if (m !== 0) {
            gestureActive.value = true;
            startCrop.value = { left: l, top: t, w: cropW.value, h: cropH.value };
          }
        })
        .onStart(() => {
          'worklet';
          panStarted.value = true;
        })
        .onUpdate((e) => {
          'worklet';
          const m = cropMode.value;
          if (m === 0) return;
          const s0 = startCrop.value;
          const dw = dispW.value;
          const dh = dispH.value;
          const zoom = zoomMode.value ? cropZoom(fitW.value, fitH.value, s0.w, s0.h) : 1;
          const dx = e.translationX / zoom;
          const dy = e.translationY / zoom;
          if (m === 16) {
            cropX.value = Math.min(dw - s0.w, Math.max(0, s0.left + dx));
            cropY.value = Math.min(dh - s0.h, Math.max(0, s0.top + dy));
            return;
          }
          let l = s0.left;
          let r = s0.left + s0.w;
          let t = s0.top;
          let b = s0.top + s0.h;
          if (m & 1) l = Math.min(r - CROP_MIN, Math.max(0, s0.left + dx));
          if (m & 2) r = Math.min(dw, Math.max(l + CROP_MIN, s0.left + s0.w + dx));
          if (m & 4) t = Math.min(b - CROP_MIN, Math.max(0, s0.top + dy));
          if (m & 8) b = Math.min(dh, Math.max(t + CROP_MIN, s0.top + s0.h + dy));
          const ratio = lockAspect.value;
          if (ratio > 0) {
            const horizontal = (m & 3) !== 0;
            const vertical = (m & 12) !== 0;
            const cx = s0.left + s0.w / 2;
            const cy = s0.top + s0.h / 2;
            // Widest/tallest the box may get with its opposite side (or centre) held still.
            const roomW = horizontal ? ((m & 1) !== 0 ? s0.left + s0.w : dw - s0.left) : 2 * Math.min(cx, dw - cx);
            const roomH = vertical ? ((m & 4) !== 0 ? s0.top + s0.h : dh - s0.top) : 2 * Math.min(cy, dh - cy);
            let w = r - l;
            let h = b - t;
            if (horizontal && vertical) w = Math.max(w, h * ratio);
            else if (vertical) w = h * ratio;
            h = w / ratio;
            if (horizontal && !vertical) h = w / ratio;
            if (vertical && !horizontal) w = h * ratio;
            w = Math.min(w, roomW, roomH * ratio);
            w = Math.max(w, Math.min(CROP_MIN * Math.max(1, ratio), roomW, roomH * ratio));
            h = w / ratio;
            if ((m & 1) !== 0) l = s0.left + s0.w - w;
            else if ((m & 2) !== 0) l = s0.left;
            else l = cx - w / 2;
            if ((m & 4) !== 0) t = s0.top + s0.h - h;
            else if ((m & 8) !== 0) t = s0.top;
            else t = cy - h / 2;
            r = l + w;
            b = t + h;
          }
          cropX.value = l;
          cropY.value = t;
          cropW.value = r - l;
          cropH.value = b - t;
        })
        .onFinalize(() => {
          'worklet';
          if (cropMode.value !== 0 && panStarted.value) commitCrop();
          cropMode.value = 0;
          gestureActive.value = false;
          panStarted.value = false;
        }),
    [commitCrop, cropH, cropMode, cropW, cropX, cropY, dispH, dispW, fitH, fitW, gestureActive, lockAspect, panStarted, startCrop, zoomMode],
  );

  const cropPinch = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          'worklet';
          if (!zoomMode.value) return;
          gestureActive.value = true;
          startCrop.value = { left: cropX.value, top: cropY.value, w: cropW.value, h: cropH.value };
        })
        .onUpdate((e) => {
          'worklet';
          if (!zoomMode.value) return;
          const s0 = startCrop.value;
          const dw = dispW.value;
          const dh = dispH.value;
          const scale = Math.max(0.25, e.scale);
          let w = Math.min(dw, Math.max(CROP_MIN, s0.w / scale));
          let h = Math.min(dh, Math.max(CROP_MIN, s0.h / scale));
          const ratio = lockAspect.value;
          if (ratio > 0) {
            h = w / ratio;
            if (h > dh) {
              h = dh;
              w = Math.min(dw, h * ratio);
              h = w / ratio;
            }
          }
          const cx = s0.left + s0.w / 2;
          const cy = s0.top + s0.h / 2;
          cropW.value = w;
          cropH.value = h;
          cropX.value = Math.min(Math.max(0, dw - w), Math.max(0, cx - w / 2));
          cropY.value = Math.min(Math.max(0, dh - h), Math.max(0, cy - h / 2));
        })
        .onFinalize(() => {
          'worklet';
          if (zoomMode.value) commitCrop();
        }),
    [commitCrop, cropH, cropW, cropX, cropY, dispH, dispW, gestureActive, lockAspect, startCrop, zoomMode],
  );

  // A short press that barely moves selects; anything more is a drag. The tap is
  // first in Exclusive, so it wins the ambiguous case; the window still moves on
  // any real drag (same Race/Exclusive pattern as editor/skia-canvas.tsx).
  const stageGesture = useMemo(() => {
    if (!onTapPage) return cropGesture;
    const tap = Gesture.Tap()
      .maxDuration(300)
      .maxDistance(CROP_DRAG_MIN)
      .onEnd((e, success) => {
        'worklet';
        if (!success) return;
        // The pan began on the same touch; release it before the window snaps,
        // or the layout sync would skip the update while it still looks active.
        cropMode.value = 0;
        gestureActive.value = false;
        let x = e.x;
        let y = e.y;
        if (zoomMode.value) {
          const zoom = cropZoom(fitW.value, fitH.value, cropW.value, cropH.value);
          const viewW = cropW.value * zoom;
          const viewH = cropH.value * zoom;
          const vl = (fitW.value - viewW) / 2;
          const vt = (fitH.value - viewH) / 2;
          x = cropX.value + (e.x - vl) / zoom;
          y = cropY.value + (e.y - vt) / zoom;
        }
        runOnJS(onTapPage)({ x, y }, { w: dispW.value, h: dispH.value });
      });
    return Gesture.Exclusive(tap, cropGesture);
  }, [cropGesture, cropMode, cropH, cropW, cropX, cropY, dispH, dispW, fitH, fitW, gestureActive, onTapPage, zoomMode]);

  const zoomGestures = useMemo(
    () => Gesture.Simultaneous(stageGesture, cropPinch),
    [cropPinch, stageGesture],
  );

  const stampPan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          'worklet';
          startStamp.value = {
            x: stampNormX.value,
            y: stampNormY.value,
          };
        })
        .onUpdate((e) => {
          'worklet';
          const stageWidth = cropEnabled ? cropW.value : activeStageW;
          const stageHeight = cropEnabled ? cropH.value : activeStageH;
          const maxX = Math.max(1, stageWidth - stampW);
          const maxY = Math.max(1, stageHeight - stampH);
          stampNormX.value = Math.min(1, Math.max(0, startStamp.value.x + e.translationX / maxX));
          stampNormY.value = Math.min(1, Math.max(0, startStamp.value.y + e.translationY / maxY));
        })
        .onEnd(() => {
          'worklet';
          runOnJS(onStampOffset)({ x: stampNormX.value, y: stampNormY.value });
        }),
    [activeStageH, activeStageW, cropEnabled, cropH, cropW, onStampOffset, stampH, stampNormX, stampNormY, stampW, startStamp],
  );

  const tiles = watermark?.layout === 'tiled' ? tiledRepeatCount(watermark.tiled?.spacingNorm ?? { x: 0.22, y: 0.22 }) : null;
  const stageBoxW = measured?.w ?? layout.dispW;
  const stageBoxH = measured?.h ?? layout.dispH;

  return (
    <View
      style={expand ? styles.fillStage : styles.stage}
      onLayout={
        expand
          ? (e) => {
              const inset = hideHint ? 4 : 8;
              const w = Math.max(120, Math.floor(e.nativeEvent.layout.width - inset));
              const h = Math.max(160, Math.floor(e.nativeEvent.layout.height - (hideHint ? 4 : 28)));
              setMeasured((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
            }
          : undefined
      }>
      {zoomCrop ? (
        <View style={{ width: stageBoxW, height: stageBoxH }}>
          <Animated.View style={[cropViewportStyle, styles.cropClip]} collapsable={false}>
            <Animated.View style={cropImageStyle}>
              {image ? (
                <Canvas style={{ width: layout.dispW, height: layout.dispH }}>
                  <SkiaImage
                    image={image}
                    x={0}
                    y={0}
                    width={layout.dispW}
                    height={layout.dispH}
                    fit="fill">
                    {mode === 'Original' ? (
                      sharpness > 0 ? (
                        <ColorMatrix matrix={colorContrastPreviewMatrix(sharpness)} />
                      ) : null
                    ) : monoPreviewEffect ? (
                      <RuntimeShader
                        source={monoPreviewEffect}
                        uniforms={{ threshold, mode: mode === 'Halftone' ? 2 : 1 }}>
                        {sharpness > 0 ? (
                          <ColorMatrix matrix={colorContrastPreviewMatrix(sharpness)} />
                        ) : null}
                      </RuntimeShader>
                    ) : (
                      <ColorMatrix matrix={monoPreviewMatrix(mode === 'Halftone')} />
                    )}
                  </SkiaImage>
                </Canvas>
              ) : uri ? (
                <View style={[styles.placeholder, { width: layout.dispW, height: layout.dispH }]}>
                  <ActivityIndicator color={C.accent} size="small" />
                </View>
              ) : (
                <View style={[styles.placeholder, { width: layout.dispW, height: layout.dispH }]}>
                  <Text style={styles.placeholderText}>No page</Text>
                </View>
              )}
            </Animated.View>
          </Animated.View>
          <Animated.View pointerEvents="none" style={cropViewportStyle}>
            <View style={[styles.gridV, { left: '33.333%' }]} />
            <View style={[styles.gridV, { left: '66.666%' }]} />
            <View style={[styles.gridH, { top: '33.333%' }]} />
            <View style={[styles.gridH, { top: '66.666%' }]} />
            <View style={styles.cropBorder} />
            <View style={[styles.corner, { top: -3, left: -3, borderTopWidth: 4, borderLeftWidth: 4 }]} />
            <View style={[styles.corner, { top: -3, right: -3, borderTopWidth: 4, borderRightWidth: 4 }]} />
            <View style={[styles.corner, { bottom: -3, left: -3, borderBottomWidth: 4, borderLeftWidth: 4 }]} />
            <View style={[styles.corner, { bottom: -3, right: -3, borderBottomWidth: 4, borderRightWidth: 4 }]} />
            <View style={[styles.edgeH, { top: -3 }]} />
            <View style={[styles.edgeH, { bottom: -3 }]} />
            <View style={[styles.edgeV, { left: -3 }]} />
            <View style={[styles.edgeV, { right: -3 }]} />
          </Animated.View>
          <GestureDetector gesture={zoomGestures}>
            <View style={StyleSheet.absoluteFill} />
          </GestureDetector>
        </View>
      ) : (
      <View
        style={{
          width: activeStageW,
          height: activeStageH,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View
          collapsable={false}
          style={{
            width: activeStageW,
            height: activeStageH,
            backgroundColor: '#fff', // theme-fixed: PDF page (printed)
            overflow: 'hidden',
            borderRadius: 4,
            elevation: 2,
            shadowColor: '#000', // theme-fixed: page shadow
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.1,
            shadowRadius: 3,
          }}>
          <View
            style={{
              width: activeStageW,
              height: activeStageH,
              overflow: 'hidden',
              borderRadius: 4,
            }}>
          {image ? (
            <Canvas style={{ width: activeStageW, height: activeStageH }}>
              <Group
                clip={contentClip}
                transform={[
                  { translateX: activeStageW / 2 },
                  { translateY: activeStageH / 2 },
                  { rotate: contentTurn },
                  { translateX: -activeCenterX },
                  { translateY: -activeCenterY },
                ]}>
              <SkiaImage
                image={image}
                x={0}
                y={0}
                width={activeImgW}
                height={activeImgH}
                fit="fill">
                {mode === 'Original' ? (
                  sharpness > 0 ? (
                    <ColorMatrix matrix={colorContrastPreviewMatrix(sharpness)} />
                  ) : null
                ) : monoPreviewEffect ? (
                  <RuntimeShader
                    source={monoPreviewEffect}
                    uniforms={{ threshold, mode: mode === 'Halftone' ? 2 : 1 }}>
                    {sharpness > 0 ? (
                      <ColorMatrix matrix={colorContrastPreviewMatrix(sharpness)} />
                    ) : null}
                  </RuntimeShader>
                ) : (
                  <ColorMatrix matrix={monoPreviewMatrix(mode === 'Halftone')} />
                )}
              </SkiaImage>
              </Group>
            </Canvas>
          ) : uri ? (
            <View style={[styles.placeholder, { width: activeStageW, height: activeStageH }]}>
              <ActivityIndicator color={C.accent} size="small" />
            </View>
          ) : (
            <View style={[styles.placeholder, { width: activeStageW, height: activeStageH }]}>
              <Text style={styles.placeholderText}>No page</Text>
            </View>
          )}
          </View>

          {cropEnabled ? (
            <>
              <Animated.View pointerEvents="none" style={[revealOutside ? styles.maskReveal : styles.mask, topMaskStyle]} />
              <Animated.View pointerEvents="none" style={[revealOutside ? styles.maskReveal : styles.mask, bottomMaskStyle]} />
              <Animated.View pointerEvents="none" style={[revealOutside ? styles.maskReveal : styles.mask, leftMaskStyle]} />
              <Animated.View pointerEvents="none" style={[revealOutside ? styles.maskReveal : styles.mask, rightMaskStyle]} />
              {overlays && overlays.length > 0 ? (
                <PdfSectionOverlays
                  overlays={overlays}
                  stageW={layout.dispW}
                  stageH={layout.dispH}
                  onActivate={onOverlayActivate}
                />
              ) : null}
              <Animated.View pointerEvents="none" style={[styles.cropFrame, cropBoxStyle]}>
                <View style={[styles.gridV, { left: '33.333%' }]} />
                <View style={[styles.gridV, { left: '66.666%' }]} />
                <View style={[styles.gridH, { top: '33.333%' }]} />
                <View style={[styles.gridH, { top: '66.666%' }]} />
                <View style={styles.cropBorder} />
                <View style={[styles.corner, { top: -3, left: -3, borderTopWidth: 4, borderLeftWidth: 4 }]} />
                <View style={[styles.corner, { top: -3, right: -3, borderTopWidth: 4, borderRightWidth: 4 }]} />
                <View style={[styles.corner, { bottom: -3, left: -3, borderBottomWidth: 4, borderLeftWidth: 4 }]} />
                <View style={[styles.corner, { bottom: -3, right: -3, borderBottomWidth: 4, borderRightWidth: 4 }]} />
                <View style={[styles.edgeH, { top: -3 }]} />
                <View style={[styles.edgeH, { bottom: -3 }]} />
                <View style={[styles.edgeV, { left: -3 }]} />
                <View style={[styles.edgeV, { right: -3 }]} />
              </Animated.View>
              <GestureDetector gesture={stageGesture}>
                <View style={StyleSheet.absoluteFill} />
              </GestureDetector>
              {busyAt ? <PdfTapBusy at={busyAt} stageW={layout.dispW} stageH={layout.dispH} /> : null}
            </>
          ) : null}

          {/* Tiled Watermark Pattern */}
          {watermark?.layout === 'tiled' && tiles
            ? Array.from({ length: tiles.rows * (tiles.cols + 2) }).map((_, i) => {
                const totalCols = tiles.cols + 2;
                const c = (i % totalCols) - 1;
                const r = Math.floor(i / totalCols);
                const cellW = activeStageW / tiles.cols;
                const cellH = activeStageH / tiles.rows;
                const wmColor = watermark.text?.color || '#DC2626'; // theme-fixed: watermark ink (printed)
                const staggered = watermark.tiled?.staggered ?? true;
                const staggerX = staggered && r % 2 === 1 ? cellW * 0.5 : 0;
                const userPt = watermark.text?.fontSizePt ?? 22;
                const fontSize = Math.max(8, (userPt / 22) * Math.min(cellW, cellH) * 0.22);
                return (
                  <View
                    key={i}
                    pointerEvents="none"
                    style={[
                      styles.tileCell,
                      {
                        left: c * cellW + staggerX,
                        top: r * cellH,
                        width: cellW,
                        height: cellH,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.tileText,
                        {
                          color: wmColor,
                          opacity: watermark.opacity,
                          fontSize,
                          transform: [{ rotate: `${watermark.rotationDeg}deg` }],
                        },
                      ]}
                      numberOfLines={1}>
                      {watermark.type === 'text' ? watermark.text?.content || 'WATERMARK' : '•'}
                    </Text>
                  </View>
                );
              })
            : null}

          {/* Draggable Watermark Single Stamp (Prominent, cleanly visible) */}
          {watermark?.layout === 'stamp' ? (
            <Animated.View
              pointerEvents={watermarkEnabled ? 'auto' : 'none'}
              style={[
                styles.stampWrapper,
                {
                  width: stampW,
                  height: stampH,
                },
                stampWrapperStyle,
              ]}>
              <GestureDetector gesture={stampPan}>
                <View
                  style={[
                    styles.stampBox,
                    {
                      width: stampW,
                      height: stampH,
                      borderColor: watermark.text?.color || '#DC2626', // theme-fixed: watermark ink (printed)
                      backgroundColor: 'rgba(255, 255, 255, 0.88)', // theme-fixed: watermark stamp (printed)
                      opacity: Math.max(0.35, watermark.opacity),
                      transform: [{ rotate: `${watermark.rotationDeg}deg` }],
                    },
                  ]}>
                  {watermarkEnabled ? (
                    <View style={styles.dragBadge}>
                      <Text style={styles.dragBadgeText}>DRAG</Text>
                    </View>
                  ) : null}
                  {watermark.type === 'text' ? (
                    <Text
                      style={[
                        styles.stampText,
                        {
                          color: watermark.text?.color || '#DC2626', // theme-fixed: watermark ink (printed)
                          fontSize: Math.max(14, Math.round(stampH * 0.42)),
                        },
                      ]}
                      numberOfLines={1}>
                      {watermark.text?.content || 'WATERMARK'}
                    </Text>
                  ) : watermark.image?.sourceUri ? (
                    <RNImage
                      source={{ uri: watermark.image.sourceUri }}
                      style={{
                        width: stampW - 16,
                        height: stampH - 12,
                      }}
                      resizeMode="contain"
                    />
                  ) : (
                    <Text style={[styles.stampText, { color: watermark.text?.color || '#DC2626' }]} /* theme-fixed: watermark ink (printed) */ >
                      [IMAGE]
                    </Text>
                  )}
                </View>
              </GestureDetector>
            </Animated.View>
          ) : null}
        </View>
      </View>
      )}
      {hideHint ? null : (
      <Text style={styles.hint}>
        {cropEnabled
          ? zoomCrop
            ? 'Drag inside to move the window. Only the selected area stays on screen.'
            : onTapPage
              ? 'Tap a block to select it. Drag a corner or edge to resize, or inside to move.'
              : 'Drag a corner or edge to resize. Drag inside to move.'
          : isCropped
            ? `Cropped area fitted to ${outputSize.widthMm} × ${outputSize.heightMm} mm.`
            : mode === 'Halftone'
              ? 'Halftone preview. Export and print use this mode.'
              : mode === 'B & W'
                ? 'Black and white preview. Export and print use this mode.'
                : `Full page fitted to ${outputSize.widthMm} × ${outputSize.heightMm} mm.`}
      </Text>
      )}
    </View>
  );
}

const styles = themedStyles((c) => ({
  stage: { alignItems: 'center', paddingVertical: 8 },
  fillStage: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  placeholder: { backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: c.textMuted },
  cropClip: {
    overflow: 'hidden',
    backgroundColor: '#fff', // theme-fixed: PDF page (printed)
    borderRadius: 4,
  },
  mask: {
    position: 'absolute',
    backgroundColor: '#0A0A0A', // theme-fixed: crop overlay, same in both themes (mask)
  },
  maskReveal: {
    position: 'absolute',
    backgroundColor: 'rgba(10,10,10,0.62)', // theme-fixed: crop overlay while Smart Crop is selecting, so sections outside the window stay visible
  },
  cropFrame: {
    position: 'absolute',
  },
  cropBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: '#FFFFFF', // theme-fixed: crop overlay, same in both themes (cropBorder)
  },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: '#FFFFFF' }, // theme-fixed: crop overlay, same in both themes (corner)
  edgeH: {
    position: 'absolute',
    alignSelf: 'center',
    left: '50%',
    marginLeft: -16,
    width: 32,
    height: 4,
    backgroundColor: '#FFFFFF', // theme-fixed: crop overlay, same in both themes (edgeH)
  },
  edgeV: {
    position: 'absolute',
    top: '50%',
    marginTop: -16,
    width: 4,
    height: 32,
    backgroundColor: '#FFFFFF', // theme-fixed: crop overlay, same in both themes (edgeV)
  },
  gridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.6)', // theme-fixed: crop overlay, same in both themes (gridV)
  },
  gridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.6)', // theme-fixed: crop overlay, same in both themes (gridH)
  },
  stampWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 25,
  },
  stampBox: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    shadowColor: '#000', // theme-fixed: crop overlay, same in both themes (stampBox)
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  dragBadge: {
    position: 'absolute',
    top: -9,
    right: 8,
    backgroundColor: c.accentFill,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  dragBadgeText: {
    color: c.onAccent,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  stampText: {
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  tileCell: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: {
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
  },
  hint: { marginTop: 6, fontSize: 11, color: c.textMuted },
}));
