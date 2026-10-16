import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrintDirectlyIcon, UseFrameIcon } from '@/components/home-icons';
import { Type } from '@/constants/ui';
import { useImageSourcePicker } from '@/lib/file-import/pick-image';
import { C, themedStyles, useThemeRefresh } from '@/theme';

export default function PrintPhotoModal() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const { pickImageAsset, imageSourceSheet } = useImageSourcePicker();

  const handleUseFrame = () => {
    router.replace('/photo-frames');
  };

  const handlePrintDirectly = async () => {
    try {
      const asset = await pickImageAsset();
      if (!asset) return;
      router.replace({
        pathname: '/print-photo',
        params: {
          mode: 'direct',
          imageUri: asset.uri,
          imageWidth: String(asset.width),
          imageHeight: String(asset.height),
        },
      });
    } catch {
      Alert.alert('Notice', 'Unable to open photo library.');
    }
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} />

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Please select print mode</Text>
          <View style={styles.divider} />

          <View style={styles.options}>
            <Pressable
              onPress={handleUseFrame}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
              <View style={styles.iconContainer}>
                <UseFrameIcon color={C.brandInk} size={38} />
              </View>
              <Text style={styles.optionLabel}>Use frame</Text>
            </Pressable>

            <Pressable
              onPress={() => void handlePrintDirectly()}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
              <View style={styles.iconContainer}>
                <PrintDirectlyIcon color={C.accent} size={38} />
              </View>
              <Text style={styles.optionLabel}>Print directly</Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
      {imageSourceSheet}
    </View>
  );
}

const styles = themedStyles((c) => ({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: c.scrim,
  },
  bottom: {
    paddingHorizontal: 10,
    gap: 8,
  },
  sheet: {
    backgroundColor: c.surface,
    borderRadius: 14,
    overflow: 'hidden',
  },
  title: {
    textAlign: 'center',
    color: c.textMuted,
    ...Type.modalTitle,
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.hairline,
    marginHorizontal: 16,
  },
  options: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingTop: 24,
    paddingBottom: 28,
    paddingHorizontal: 16,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
    paddingHorizontal: 4,
  },
  iconContainer: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    ...Type.caption,
    fontSize: 14,
    fontWeight: '500',
    color: c.textSecondary,
    textAlign: 'center',
  },
  cancelBtn: {
    backgroundColor: c.surface,
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    ...Type.modalAction,
    color: c.link,
  },
  pressed: {
    opacity: 0.65,
  },
}));
