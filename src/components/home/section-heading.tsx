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
    height: HomeLayout.sectionHeadingBlock - HomeLayout.sectionHeadingGap,
    marginBottom: HomeLayout.sectionHeadingGap,
    justifyContent: 'flex-end',
  },
  text: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: c.text,
    letterSpacing: 0.2,
  },
}));
