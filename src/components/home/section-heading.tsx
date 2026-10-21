import { Text, View } from 'react-native';

import { HomeLayout } from '@/constants/ui';
import { themedStyles, useThemeRefresh } from '@/theme';

export function SectionHeading({ children }: { children: string }) {
  useThemeRefresh();
  return (
    <View style={styles.wrap}>
      <View style={styles.bar} />
      <Text
        maxFontSizeMultiplier={HomeLayout.labelMaxFontScale}
        style={styles.text}>
        {children}
      </Text>
    </View>
  );
}

const styles = themedStyles((c) => ({
  wrap: {
    height: HomeLayout.sectionHeadingBlock - HomeLayout.sectionHeadingGap,
    marginBottom: HomeLayout.sectionHeadingGap,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  bar: { width: 3, height: 13, borderRadius: 2, backgroundColor: c.accent, marginBottom: 3 },
  text: {
    fontSize: 11.5,
    lineHeight: 18,
    fontWeight: '700',
    color: c.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
}));
