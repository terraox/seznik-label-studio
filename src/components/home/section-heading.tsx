import { StyleSheet, Text, View } from 'react-native';

import { HomeLayout, Palette } from '@/constants/ui';

export function SectionHeading({ children }: { children: string }) {
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

const styles = StyleSheet.create({
  wrap: {
    height: HomeLayout.sectionHeadingBlock - HomeLayout.sectionHeadingGap,
    marginBottom: HomeLayout.sectionHeadingGap,
    justifyContent: 'flex-end',
  },
  text: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: Palette.muted,
    letterSpacing: 0.2,
  },
});
