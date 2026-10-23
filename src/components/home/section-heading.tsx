import { Text, View } from 'react-native';

import { HomeLayout } from '@/constants/ui';
import { themedStyles, useThemeRefresh } from '@/theme';

export function SectionHeading({ children }: { children: string }) {
  useThemeRefresh();
  return (
    <View style={styles.wrap}>
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
    minHeight: HomeLayout.sectionHeadingBlock - HomeLayout.sectionHeadingGap,
    marginBottom: HomeLayout.sectionHeadingGap,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  text: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: c.text,
    flexShrink: 1,
  },
}));
