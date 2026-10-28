import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { C, themedStyles, useThemeRefresh } from '@/theme';

export const SERIAL_BAR_HEIGHT_PX = 52;

type SerialBarProps = {
  /** 0-based label being previewed. */
  index: number;
  /** Number of labels that can be stepped through. */
  total: number;
  /** What the previewed label shows, e.g. "001". The number of the label itself is never shown. */
  value: string;
  onGo: (index: number) => void;
};

/** Under the canvas: previous, the content of the label being looked at, next. */
export function SerialBar({ index, total, value, onGo }: SerialBarProps) {
  useThemeRefresh();
  const last = Math.max(0, total - 1);
  return (
    <View style={styles.strip}>
      <Pressable onPress={() => onGo(index - 1)} disabled={index <= 0} hitSlop={8} style={styles.arrow} accessibilityLabel="Previous label">
        <AppIcon name="chevron.left" size={22} tintColor={index <= 0 ? C.textDisabled : C.textSecondary} />
      </Pressable>
      <View style={styles.box}>
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Pressable onPress={() => onGo(index + 1)} disabled={index >= last} hitSlop={8} style={styles.arrow} accessibilityLabel="Next label">
        <AppIcon name="chevron.right" size={22} tintColor={index >= last ? C.textDisabled : C.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = themedStyles((c) => ({
  strip: {
    width: '100%',
    height: SERIAL_BAR_HEIGHT_PX,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  arrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  box: {
    flex: 1,
    height: 36,
    borderRadius: 4,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  value: { fontSize: 16, color: c.text },
}));
