import { Pressable, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { C, themedStyles, useThemeRefresh } from '@/theme';

export function PdfPageNav({
  index,
  total,
  onPrev,
  onNext,
}: {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  useThemeRefresh();
  const n = total < 1 ? 0 : index + 1;
  return (
    <View style={styles.row}>
      <Pressable onPress={onPrev} disabled={index <= 0} hitSlop={10} style={styles.arrow}>
        <AppIcon name="chevron.left" size={22} tintColor={index <= 0 ? C.textDisabled : C.text} />
      </Pressable>
      <Text style={styles.counter}>
        {n} / {total}
      </Text>
      <Pressable onPress={onNext} disabled={index >= total - 1} hitSlop={10} style={styles.arrow}>
        <AppIcon
          name="chevron.right"
          size={22}
          tintColor={index >= total - 1 ? C.textDisabled : C.text}
        />
      </Pressable>
    </View>
  );
}

const styles = themedStyles((c) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 8,
  },
  arrow: { padding: 8 },
  counter: { fontSize: 15, fontWeight: '600', color: c.text, minWidth: 72, textAlign: 'center' },
}));
