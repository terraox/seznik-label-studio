import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Pressable onPress={onCancel} hitSlop={12} style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Crop Photo</Text>
          <Text style={styles.subtitle}>Drag corners or move the frame</Text>
        </View>
        <Pressable
          disabled={saving || loadingDims}
          onPress={handleConfirm}
          hitSlop={12}
          style={({ pressed }) => [styles.doneBtn, (pressed || saving) && styles.pressed]}>
          {saving ? (
            <ActivityIndicator color={C.onAccent} size="small" />
          ) : (
            <Text style={styles.doneText}>Done</Text>
          )}
        </Pressable>
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

      <View style={styles.footer}>
        <Pressable onPress={handleReset} style={({ pressed }) => [styles.resetBtn, pressed && styles.pressed]}>
          <Text style={styles.resetText}>Reset</Text>
        </Pressable>
        <Text style={styles.footerHint}>Drag inside to move · corners to resize</Text>
      </View>
    </View>
  );
}

const styles = themedStyles((c) => ({
  root: { flex: 1, backgroundColor: '#0F172A' }, // theme-fixed: dark crop screen in both themes
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  headerBtn: { minWidth: 64, paddingVertical: 8 },
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { color: c.onAccent, fontSize: 17, fontWeight: '700' },
  subtitle: { color: c.textMuted, fontSize: 12, marginTop: 2 },
  cancelText: { color: c.textDisabled, fontSize: 16, fontWeight: '500' },
  doneBtn: {
    minWidth: 72,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { color: c.onAccent, fontSize: 16, fontWeight: '700' },
  stage: {
    flex: 1,
    marginHorizontal: 12,
    borderRadius: 12,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    alignItems: 'center',
    gap: 8,
  },
  resetBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1E293B', // theme-fixed: dark crop screen in both themes
  },
  resetText: { color: c.textDisabled, fontSize: 15, fontWeight: '600' },
  footerHint: { color: c.textSecondary, fontSize: 12, textAlign: 'center' },
  pressed: { opacity: 0.72 },
}));
