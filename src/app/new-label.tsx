import { router } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { Type } from '@/constants/ui';
import { useImageSourcePicker } from '@/lib/file-import/pick-image';
import { themedStyles, useThemeRefresh } from '@/theme';

function CreationOption({
  label,
  color,
  children,
  onPress,
}: {
  label: string;
  color: string;
  children: ReactNode;
  onPress?: () => void;
}) {
  useThemeRefresh();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
      <View style={[styles.optionIcon, { backgroundColor: color }]}>{children}</View>
      <Text style={styles.optionLabel}>{label}</Text>
    </Pressable>
  );
}

export default function NewLabelModal() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const { pickImageAsset, imageSourceSheet } = useImageSourcePicker();

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} />

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Please select the creation method</Text>
          <View style={styles.divider} />

          <View style={styles.options}>
            <CreationOption
              label="Blank Label"
              color="#17A6B8" // theme-fixed: category tile colour, white icon
              onPress={() =>
                router.replace({ pathname: '/new-label-setup', params: { isSingleCanvas: 'true' } })
              }>
              <AppIcon name="plus.rectangle" tintColor="#FFFFFF" size={30} pointerEvents="none" /* theme-fixed: white icon on category tile */ />
            </CreationOption>

            <CreationOption
              label="Customize Size"
              color="#3B82F6" // theme-fixed: category tile colour, white icon
              onPress={() => router.replace('/customize-template')}>
              <AppIcon name="rectangle.dashed" tintColor="#FFFFFF" size={28} pointerEvents="none" /* theme-fixed: white icon on category tile */ />
            </CreationOption>

            <CreationOption
              label="Industry Template"
              color="#8BC34A" // theme-fixed: category tile colour, white icon
              onPress={() => router.replace('/(tabs)/template')}>
              <View style={styles.templateMark}>
                <View style={styles.templateBar} />
                <View style={[styles.templateBar, styles.templateBarMid]} />
                <View style={[styles.templateBar, styles.templateBarRight]} />
              </View>
            </CreationOption>

            <CreationOption
              label="Import Image"
              color="#8B5CF6" // theme-fixed: category tile colour, white icon
              onPress={async () => {
                const asset = await pickImageAsset();
                if (!asset) return;
                router.replace({
                  pathname: '/new-label-setup',
                  params: {
                    importImageUri: asset.uri,
                    importImageWidth: String(asset.width),
                    importImageHeight: String(asset.height),
                    isSingleCanvas: 'true',
                  },
                });
              }}>
              <AppIcon name="photo" tintColor="#FFFFFF" size={28} pointerEvents="none" /* theme-fixed: white icon on category tile */ />
            </CreationOption>
            <CreationOption
              label="Upload label"
              color="#F5A623" // theme-fixed: category tile colour, white icon
              onPress={() => router.replace('/image-to-label')}>
              <AppIcon name="photo.on.rectangle" tintColor="#FFFFFF" size={30} pointerEvents="none" /* theme-fixed: white icon on category tile */ />
            </CreationOption>
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
    flexWrap: 'wrap',
    justifyContent: 'space-evenly',
    paddingTop: 18,
    paddingBottom: 20,
    paddingHorizontal: 8,
    rowGap: 18,
  },
  option: {
    width: '46%',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    paddingHorizontal: 4,
  },
  optionIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateMark: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateBar: {
    position: 'absolute',
    width: 5,
    height: 22,
    borderRadius: 2,
    backgroundColor: c.surface,
    left: 4,
    top: 4,
    transform: [{ rotate: '-28deg' }],
  },
  templateBarMid: {
    left: 12,
    top: 4,
    transform: [{ rotate: '0deg' }],
  },
  templateBarRight: {
    left: 20,
    top: 4,
    transform: [{ rotate: '28deg' }],
  },
  optionLabel: {
    ...Type.caption,
    fontSize: 13,
    color: c.text,
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
