import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { ImageCropCanvas, type ImageCropCanvasHandle } from '@/components/editor/image-crop-canvas';
import { applyImageCrop, inspectImagePixelSize } from '@/lib/editor/apply-image-crop';
import {
  cropFormatFromUri,
  FULL_CROP,
  type NormalizedCrop,
} from '@/lib/editor/image-crop-math';
import { C, themedStyles, useThemeRefresh } from '@/theme';

type ImageCropScreenProps = {
  sourceUri: string;
  sourceWidth?: number;
  sourceHeight?: number;
  initialCrop?: NormalizedCrop;
  /** `window` returns the crop box only; Fit Label then extracts from the original file. */
  commitMode?: 'file' | 'window';
  onCancel: () => void;
  onDone: (result: {
    uri: string;
    width: number;
    height: number;
    crop: NormalizedCrop;
  }) => void;
};

export function ImageCropScreen({
  sourceUri,
  sourceWidth,
  sourceHeight,
  initialCrop,
  commitMode = 'file',
  onCancel,
  onDone,
}: ImageCropScreenProps) {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const canvasRef = useRef<ImageCropCanvasHandle>(null);
  const [loadingDims, setLoadingDims] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dims, setDims] = useState({
    width: sourceWidth && sourceWidth > 0 ? sourceWidth : 1,
    height: sourceHeight && sourceHeight > 0 ? sourceHeight : 1,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resolved = await inspectImagePixelSize(sourceUri);
        if (!cancelled) setDims(resolved);
      } catch {
        if (
          !cancelled &&
          sourceWidth &&
          sourceHeight &&
          sourceWidth > 0 &&
          sourceHeight > 0
        ) {
          setDims({ width: sourceWidth, height: sourceHeight });
        }
      } finally {
        if (!cancelled) setLoadingDims(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceUri, sourceWidth, sourceHeight]);

  const handleReset = () => {
    canvasRef.current?.reset();
  };

  const handleConfirm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const crop = canvasRef.current?.getCrop() ?? FULL_CROP;
      if (commitMode === 'window') {
        onDone({ uri: sourceUri, width: dims.width, height: dims.height, crop });
        return;
      }
      const cropped = await applyImageCrop(sourceUri, dims.width, dims.height, crop, {
        format: cropFormatFromUri(sourceUri),
      });
      onDone({ ...cropped, crop });
    } catch (error) {
      Alert.alert(
        'Crop failed',
        error instanceof Error ? error.message : 'Could not crop this photo.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onCancel} hitSlop={12} style={styles.headerSide}>
          <AppIcon name="chevron.left" tintColor={C.onAccent} size={24} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          Crop photo
        </Text>
        <View style={styles.headerSide} />
      </View>

      <View style={styles.hintRow}>
        <AppIcon name="rectangle.dashed" tintColor={C.accent} size={16} />
        <Text style={styles.hint} numberOfLines={2}>
          Drag the frame to move it, or drag a corner to resize
        </Text>
      </View>

      <ImageCropCanvas
        ref={canvasRef}
        sourceUri={sourceUri}
        sourceWidth={dims.width}
        sourceHeight={dims.height}
        initialCrop={initialCrop}
        loading={loadingDims}
        style={styles.stage}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <Pressable onPress={handleReset} style={({ pressed }) => [styles.resetBtn, pressed && styles.pressed]}>
          <Text style={styles.resetText}>Reset</Text>
        </Pressable>
        <Pressable
          disabled={saving || loadingDims}
          onPress={handleConfirm}
          style={({ pressed }) => [styles.doneBtn, (pressed || saving || loadingDims) && styles.pressed]}>
          {saving ? (
            <ActivityIndicator color={C.onAccent} size="small" />
          ) : (
            <Text style={styles.doneText}>Done</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = themedStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: c.header,
  },
  headerSide: { width: 72, height: 40, justifyContent: 'center' },
  title: { flexShrink: 1, color: c.onAccent, fontSize: 18, fontWeight: '600', textAlign: 'center' },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  hint: { flex: 1, flexShrink: 1, color: c.textSecondary, fontSize: 13 },
  stage: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  resetBtn: {
    height: 48,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: { flexShrink: 1, color: c.text, fontSize: 16, fontWeight: '600' },
  doneBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: c.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { flexShrink: 1, color: c.onAccent, fontSize: 17, fontWeight: '700' },
  pressed: { opacity: 0.72 },
}));
