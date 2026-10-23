import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { ToolArt, hasToolArt } from '@/components/home/tool-art';
import { ToolIcon } from '@/components/home/tool-icon';
import { HOME_TOOLS, type HomeTool, type HomeToolId } from '@/components/home/home-tools';
import { androidRipple, HomeLayout } from '@/constants/ui';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

export function ToolTile({
  id,
  minHeight = HomeLayout.tileHeight,
}: {
  id: HomeToolId;
  minHeight?: number;
}) {
  useThemeRefresh();
  const router = useRouter();
  const tool: HomeTool = HOME_TOOLS[id];

  return (
    <View style={styles.outer}>
      <Pressable
        onPress={() => router.push(tool.href as any)}
        android_ripple={androidRipple}
        accessibilityRole="button"
        accessibilityLabel={tool.hint ? `${tool.label}, ${tool.hint}` : tool.label}
        style={({ pressed }) => [styles.inner, { minHeight }, pressed && styles.pressed]}>
        {hasToolArt(id) ? (
          <ToolArt id={id} size={HomeLayout.tileArtSize} />
        ) : (
          <View style={styles.iconWrap}>
            <ToolIcon id={id} color={C.accent} />
          </View>
        )}
        <View style={styles.text}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            maxFontSizeMultiplier={HomeLayout.labelMaxFontScale}
            style={styles.label}>
            {tool.label}
          </Text>
          {tool.hint ? (
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={HomeLayout.labelMaxFontScale}
              style={styles.hint}>
              {tool.hint}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

const styles = themedStyles((c, scheme) => ({
  outer: {
    flex: 1,
    minWidth: 0,
  },
  inner: {
    backgroundColor: c.surface,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingTop: 12,
    paddingBottom: 10,
    ...cardElevation(c, scheme),
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: c.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: c.text,
    textAlign: 'center',
  },
  hint: {
    fontSize: 10.5,
    color: c.textMuted,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
}));
