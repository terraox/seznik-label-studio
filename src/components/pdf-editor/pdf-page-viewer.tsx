import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image as RNImage, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Canvas, ColorMatrix, Group, Image as SkiaImage, RuntimeShader, Skia, useImage } from '@shopify/react-native-skia';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { Palette } from '@/constants/ui';
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

/** Crop box touch tuning, in screen px. */
const CROP_MIN = 40;
const CROP_GRAB = 30;
const CROP_SLOP = 18;

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
}) {
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

  const activeStageW = cropEnabled ? layout.dispW : labelFit.stageW;
  const activeStageH = cropEnabled ? layout.dispH : labelFit.stageH;
  const activeImgW = cropEnabled ? layout.dispW : labelFit.imgW;
  const activeImgH = cropEnabled ? layout.dispH : labelFit.imgH;
  const activeCenterX = cropEnabled ? layout.dispW / 2 : labelFit.centerX;
  const activeCenterY = cropEnabled ? layout.dispH / 2 : labelFit.centerY;
  const contentClip = cropEnabled
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
  const gestureActive = useSharedValue(false);
  const cropMode = useSharedValue(0);
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
        .minDistance(0)
        .onBegin((e) => {
          'worklet';
          const l = cropX.value;
          const t = cropY.value;
          const r = l + cropW.value;
          const b = t + cropH.value;
          const zx = Math.min(CROP_GRAB, cropW.value / 3);
          const zy = Math.min(CROP_GRAB, cropH.value / 3);
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
        .onUpdate((e) => {
          'worklet';
          const m = cropMode.value;
          if (m === 0) return;
          const s0 = startCrop.value;
          const dw = dispW.value;
          const dh = dispH.value;
          if (m === 16) {
            cropX.value = Math.min(dw - s0.w, Math.max(0, s0.left + e.translationX));
            cropY.value = Math.min(dh - s0.h, Math.max(0, s0.top + e.translationY));
            return;
          }
          let l = s0.left;
          let r = s0.left + s0.w;
          let t = s0.top;
          let b = s0.top + s0.h;
          if (m & 1) l = Math.min(r - CROP_MIN, Math.max(0, s0.left + e.translationX));
          if (m & 2) r = Math.min(dw, Math.max(l + CROP_MIN, s0.left + s0.w + e.translationX));
          if (m & 4) t = Math.min(b - CROP_MIN, Math.max(0, s0.top + e.translationY));
          if (m & 8) b = Math.min(dh, Math.max(t + CROP_MIN, s0.top + s0.h + e.translationY));
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
          if (cropMode.value !== 0) commitCrop();
          cropMode.value = 0;
          gestureActive.value = false;
        }),
    [commitCrop, cropH, cropMode, cropW, cropX, cropY, dispH, dispW, gestureActive, lockAspect, startCrop],
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

  return (
    <View
      style={expand ? styles.fillStage : styles.stage}
      onLayout={
        expand
          ? (e) => {
              const w = Math.max(120, Math.floor(e.nativeEvent.layout.width - 8));
              const h = Math.max(160, Math.floor(e.nativeEvent.layout.height - 28));
              setMeasured((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
            }
          : undefined
      }>
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
            backgroundColor: '#fff',
            overflow: 'hidden',
            borderRadius: 4,
            elevation: 2,
            shadowColor: '#000',
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
              <ActivityIndicator color={Palette.accent} size="small" />
            </View>
          ) : (
            <View style={[styles.placeholder, { width: activeStageW, height: activeStageH }]}>
              <Text style={styles.placeholderText}>No page</Text>
            </View>
          )}
          </View>

          {cropEnabled ? (
            <>
              <Animated.View pointerEvents="none" style={[styles.mask, topMaskStyle]} />
              <Animated.View pointerEvents="none" style={[styles.mask, bottomMaskStyle]} />
              <Animated.View pointerEvents="none" style={[styles.mask, leftMaskStyle]} />
              <Animated.View pointerEvents="none" style={[styles.mask, rightMaskStyle]} />
              <Animated.View pointerEvents="none" style={[styles.cropFrame, cropBoxStyle]}>
                <View style={[styles.gridV, { left: '33.333%' }]} />
                <View style={[styles.gridV, { left: '66.666%' }]} />
                <View style={[styles.gridH, { top: '33.333%' }]} />
                <View style={[styles.gridH, { top: '66.666%' }]} />
              </Animated.View>
              <GestureDetector gesture={cropGesture}>
                <View style={StyleSheet.absoluteFill} />
              </GestureDetector>
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
                const wmColor = watermark.text?.color || '#DC2626';
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
                      borderColor: watermark.text?.color || '#DC2626',
                      backgroundColor: 'rgba(255, 255, 255, 0.88)',
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
                          color: watermark.text?.color || '#DC2626',
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
                    <Text style={[styles.stampText, { color: watermark.text?.color || '#DC2626' }]}>
                      [IMAGE]
                    </Text>
                  )}
                </View>
              </GestureDetector>
            </Animated.View>
          ) : null}
        </View>
      </View>
      {hideHint ? null : (
      <Text style={styles.hint}>
        {cropEnabled
          ? 'Drag a corner or edge to resize. Drag inside to move.'
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

const styles = StyleSheet.create({
  stage: { alignItems: 'center', paddingVertical: 8 },
  fillStage: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  placeholder: { backgroundColor: Palette.cardTop, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: Palette.muted },
  mask: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  cropFrame: {
    position: 'absolute',
    // No frame: the dimmed area outside is what marks the selection.
  },
  gridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  gridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.35)',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  dragBadge: {
    position: 'absolute',
    top: -9,
    right: 8,
    backgroundColor: Palette.accent,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  dragBadgeText: {
    color: '#FFFFFF',
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
  hint: { marginTop: 6, fontSize: 11, color: Palette.muted },
});
