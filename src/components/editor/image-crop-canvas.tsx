import { Image } from 'expo-image';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import {
  FULL_CROP,
  computeContainRect,
  hitTestCropDrag,
  layoutFromNorm,
  moveCrop,
  resizeCropCorner,
  type CropDragKind,
  type NormalizedCrop,
} from '@/lib/editor/image-crop-math';
import { C, themedStyles, useThemeRefresh } from '@/theme';

const HANDLE = 24;

function readCrop(
  cropX: SharedValue<number>,
  cropY: SharedValue<number>,
  cropW: SharedValue<number>,
  cropH: SharedValue<number>,
): NormalizedCrop {
  'worklet';
  return {
    x: cropX.value,
    y: cropY.value,
    w: cropW.value,
    h: cropH.value,
  };
}

function writeCrop(
  crop: NormalizedCrop,
  cropX: SharedValue<number>,
  cropY: SharedValue<number>,
  cropW: SharedValue<number>,
  cropH: SharedValue<number>,
) {
  'worklet';
  cropX.value = crop.x;
  cropY.value = crop.y;
  cropW.value = crop.w;
  cropH.value = crop.h;
}

export type ImageCropCanvasHandle = {
  getCrop: () => NormalizedCrop;
  setCrop: (crop: NormalizedCrop) => void;
  reset: () => void;
};

type Props = {
  sourceUri: string;
  sourceWidth: number;
  sourceHeight: number;
  initialCrop?: NormalizedCrop;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  onCropChange?: (crop: NormalizedCrop) => void;
};

export const ImageCropCanvas = forwardRef<ImageCropCanvasHandle, Props>(function ImageCropCanvas(
  { sourceUri, sourceWidth, sourceHeight, initialCrop, loading, style, onCropChange },
  ref,
) {
  useThemeRefresh();
  const start = initialCrop ?? FULL_CROP;
  const [stageSize, setStageSize] = useState({ width: 1, height: 1 });
  const [imageRect, setImageRect] = useState({ x: 0, y: 0, width: 1, height: 1 });

  const cropX = useSharedValue(start.x);
  const cropY = useSharedValue(start.y);
  const cropW = useSharedValue(start.w);
  const cropH = useSharedValue(start.h);
  const imgX = useSharedValue(0);
  const imgY = useSharedValue(0);
  const imgW = useSharedValue(1);
  const imgH = useSharedValue(1);
  const dragKind = useSharedValue<CropDragKind>('none');
  const startCrop = useSharedValue<NormalizedCrop>(start);
  const onCropChangeRef = useRef(onCropChange);
  onCropChangeRef.current = onCropChange;

  useImperativeHandle(ref, () => ({
    getCrop: () => ({ x: cropX.value, y: cropY.value, w: cropW.value, h: cropH.value }),
    setCrop: (crop) => {
      cropX.value = crop.x;
      cropY.value = crop.y;
      cropW.value = crop.w;
      cropH.value = crop.h;
    },
    reset: () => {
      cropX.value = FULL_CROP.x;
      cropY.value = FULL_CROP.y;
      cropW.value = FULL_CROP.w;
      cropH.value = FULL_CROP.h;
    },
  }));

  useEffect(() => {
    const rect = computeContainRect(
      stageSize.width,
      stageSize.height,
      Math.max(1, sourceWidth),
      Math.max(1, sourceHeight),
    );
    imgX.value = rect.x;
    imgY.value = rect.y;
    imgW.value = rect.width;
    imgH.value = rect.height;
    setImageRect(rect);
  }, [stageSize, sourceWidth, sourceHeight, imgX, imgY, imgW, imgH]);

  const commitCrop = useCallback((crop: NormalizedCrop) => {
    onCropChangeRef.current?.(crop);
  }, []);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .maxPointers(1)
        .onBegin((event) => {
          'worklet';
          const layout = layoutFromNorm(
            readCrop(cropX, cropY, cropW, cropH),
            imgX.value,
            imgY.value,
            imgW.value,
            imgH.value,
          );
          dragKind.value = hitTestCropDrag(event.x, event.y, layout);
          startCrop.value = readCrop(cropX, cropY, cropW, cropH);
        })
        .onUpdate((event) => {
          'worklet';
          if (dragKind.value === 'none' || imgW.value <= 0 || imgH.value <= 0) return;
          const dx = event.translationX / imgW.value;
          const dy = event.translationY / imgH.value;
          const origin = startCrop.value;
          if (dragKind.value === 'move') {
            writeCrop(moveCrop(origin, dx, dy), cropX, cropY, cropW, cropH);
            return;
          }
          const corner = dragKind.value;
          if (corner === 'tl' || corner === 'tr' || corner === 'bl' || corner === 'br') {
            writeCrop(resizeCropCorner(origin, corner, dx, dy), cropX, cropY, cropW, cropH);
          }
        })
        .onFinalize(() => {
          'worklet';
          dragKind.value = 'none';
          runOnJS(commitCrop)(readCrop(cropX, cropY, cropW, cropH));
        }),
    [commitCrop, cropH, cropW, cropX, cropY, dragKind, imgH, imgW, imgX, imgY, startCrop],
  );

  const cropBoxStyle = useAnimatedStyle(() => ({
    left: imgX.value + cropX.value * imgW.value,
    top: imgY.value + cropY.value * imgH.value,
    width: cropW.value * imgW.value,
    height: cropH.value * imgH.value,
  }));
  const dimTopStyle = useAnimatedStyle(() => ({
    top: 0,
    height: Math.max(0, imgY.value + cropY.value * imgH.value),
  }));
  const dimBottomStyle = useAnimatedStyle(() => ({
    top: imgY.value + cropY.value * imgH.value + cropH.value * imgH.value,
    bottom: 0,
  }));
  const dimLeftStyle = useAnimatedStyle(() => ({
    top: imgY.value + cropY.value * imgH.value,
    width: Math.max(0, imgX.value + cropX.value * imgW.value),
    height: cropH.value * imgH.value,
  }));
  const dimRightStyle = useAnimatedStyle(() => ({
    top: imgY.value + cropY.value * imgH.value,
    left: imgX.value + cropX.value * imgW.value + cropW.value * imgW.value,
    right: 0,
    height: cropH.value * imgH.value,
  }));

  return (
    <View
      style={[styles.stage, style]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width <= 0 || height <= 0) return;
        setStageSize((prev) =>
          Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
            ? prev
            : { width, height },
        );
      }}>
      {loading ? (
        <ActivityIndicator color={C.accent} size="large" />
      ) : (
        <>
          <Image
            source={{ uri: sourceUri }}
            style={{
              position: 'absolute',
              left: imageRect.x,
              top: imageRect.y,
              width: imageRect.width,
              height: imageRect.height,
            }}
            contentFit="fill"
          />
          <Animated.View pointerEvents="none" style={[styles.dim, dimTopStyle]} />
          <Animated.View pointerEvents="none" style={[styles.dim, dimBottomStyle]} />
          <Animated.View pointerEvents="none" style={[styles.dim, dimLeftStyle]} />
          <Animated.View pointerEvents="none" style={[styles.dim, dimRightStyle]} />
          <GestureDetector gesture={panGesture}>
            <View style={styles.gestureLayer}>
              <Animated.View pointerEvents="none" style={[styles.cropFrame, cropBoxStyle]}>
                <View style={styles.cropBorder}>
                  <View style={[styles.gridLine, styles.gridVertical, { left: '33.33%' }]} />
                  <View style={[styles.gridLine, styles.gridVertical, { left: '66.66%' }]} />
                  <View style={[styles.gridLine, styles.gridHorizontal, { top: '33.33%' }]} />
                  <View style={[styles.gridLine, styles.gridHorizontal, { top: '66.66%' }]} />
                </View>
                <View style={[styles.handle, styles.handleTL]} />
                <View style={[styles.handle, styles.handleTR]} />
                <View style={[styles.handle, styles.handleBL]} />
                <View style={[styles.handle, styles.handleBR]} />
              </Animated.View>
            </View>
          </GestureDetector>
        </>
      )}
    </View>
  );
});

const styles = themedStyles((c) => ({
  stage: {
    overflow: 'hidden',
    backgroundColor: '#111827', // theme-fixed: crop overlay, same in both themes (stage)
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { position: 'absolute', left: 0, right: 0, backgroundColor: 'rgba(15, 23, 42, 0.68)' }, // theme-fixed: crop overlay, same in both themes (dim)
  gestureLayer: { ...StyleSheet.absoluteFillObject },
  cropFrame: { position: 'absolute' },
  cropBorder: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#FFFFFF', // theme-fixed: crop overlay, same in both themes (cropBorder)
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.35)', // theme-fixed: crop overlay, same in both themes (gridLine)
  },
  gridVertical: { top: 0, bottom: 0, width: StyleSheet.hairlineWidth },
  gridHorizontal: { left: 0, right: 0, height: StyleSheet.hairlineWidth },
  handle: {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#2DAFE5', // theme-fixed: crop overlay, same in both themes (handle)
    backgroundColor: '#FFFFFF', // theme-fixed: crop overlay, same in both themes (handle)
  },
  handleTL: { left: -HANDLE / 2, top: -HANDLE / 2 },
  handleTR: { right: -HANDLE / 2, top: -HANDLE / 2 },
  handleBL: { left: -HANDLE / 2, bottom: -HANDLE / 2 },
  handleBR: { right: -HANDLE / 2, bottom: -HANDLE / 2 },
}));
