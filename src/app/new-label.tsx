import { goBack } from '@/lib/go-back';
import { router } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NewLabelArt, type NewLabelArtKind } from '@/components/home/tool-art';
import { androidRipple, HomeLayout } from '@/constants/ui';
import { useOpenLabelFile } from '@/lib/label-share/use-open-label-file';
import { C, themedStyles, useThemeRefresh } from '@/theme';

/** One way into a new label: drawn art, a name, one line on what it does. */
function StartOption({
  kind,
  title,
  hint,
  onPress,
}: {
  kind: NewLabelArtKind;
  title: string;
  hint: string;
  onPress: () => void;
}) {
  useThemeRefresh();
  return (
    <Pressable
      onPress={onPress}
      android_ripple={androidRipple}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${hint}`}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
      <View style={styles.art}>
        <NewLabelArt kind={kind} size={40} />
      </View>
      <View style={styles.optionText}>
        <Text numberOfLines={1} maxFontSizeMultiplier={HomeLayout.labelMaxFontScale} style={styles.optionTitle}>
          {title}
        </Text>
        <Text numberOfLines={2} maxFontSizeMultiplier={HomeLayout.labelMaxFontScale} style={styles.optionHint}>
          {hint}
        </Text>
      </View>
      <AppIcon name="chevron.right" tintColor={C.textMuted} size={16} pointerEvents="none" />
    </Pressable>
  );
}

export default function NewLabelModal() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const { openLabelFile, documentSourceSheet } = useOpenLabelFile('replace');

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => goBack()} accessibilityLabel="Close" />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text numberOfLines={1} maxFontSizeMultiplier={HomeLayout.labelMaxFontScale} style={styles.title}>
              New label
            </Text>
            <Text numberOfLines={2} maxFontSizeMultiplier={HomeLayout.labelMaxFontScale} style={styles.subtitle}>
              How would you like to start?
            </Text>
          </View>
          <Pressable
            onPress={() => goBack()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <AppIcon name="xmark" tintColor={C.textSecondary} size={18} pointerEvents="none" />
          </Pressable>
        </View>

        <View style={styles.options}>
          <StartOption
            kind="blank"
            title="Blank label"
            hint="Pick a size and design from scratch"
            onPress={() => router.replace({ pathname: '/new-label-setup', params: { isSingleCanvas: 'true' } })}
          />
          <StartOption
            kind="template"
            title="Industry templates"
            hint="Start from a ready-made design"
            onPress={() => router.replace('/(tabs)/template')}
          />
          <StartOption
            kind="upload"
            title="Upload label"
            hint="Turn a photo or soft copy into a label"
            onPress={() => router.replace('/image-to-label')}
          />
          <StartOption
            kind="import"
            title="Import label"
            hint="Open a .seznik file shared with you"
            onPress={() => void openLabelFile()}
          />
        </View>
      </View>
      {documentSourceSheet}
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
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: c.cardBorder,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.hairline,
    marginBottom: 14,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  headText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: c.text,
  },
  subtitle: {
    fontSize: 13,
    color: c.textMuted,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  options: {
    gap: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 72,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.hairline,
    backgroundColor: c.bg,
    overflow: 'hidden',
  },
  art: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: c.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: c.text,
  },
  optionHint: {
    fontSize: 12.5,
    lineHeight: 17,
    color: c.textMuted,
  },
  pressed: {
    opacity: 0.7,
  },
}));
