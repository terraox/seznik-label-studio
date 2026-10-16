import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { ToolIcon } from '@/components/home/tool-icon';
import { HOME_TOOLS, type HomeToolId } from '@/components/home/home-tools';
import { androidRipple, cardShadow, HomeLayout } from '@/constants/ui';
import { C, themedStyles, useThemeRefresh } from '@/theme';

export function ToolTile({
  id,
  minHeight = HomeLayout.tileHeight,
}: {
  id: HomeToolId;
  minHeight?: number;
}) {
  useThemeRefresh();
  const router = useRouter();
  const tool = HOME_TOOLS[id];

  return (
    <View style={styles.outer}>
      <Pressable
        onPress={() => router.push(tool.href as any)}
        android_ripple={androidRipple}
        accessibilityRole="button"
        accessibilityLabel={tool.label}
        style={({ pressed }) => [styles.inner, { minHeight }, pressed && styles.pressed]}>
        <ToolIcon id={id} color={C.accent} />
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={HomeLayout.labelMaxFontScale}
          style={styles.label}>
          {tool.label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = themedStyles((c) => ({
  outer: {
    flex: 1,
    minWidth: 0,
  },
  inner: {
    backgroundColor: c.surface,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 8,
    ...cardShadow,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: c.text,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
}));
