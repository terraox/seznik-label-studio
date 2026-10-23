import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ToolArt, hasToolArt } from '@/components/home/tool-art';
import { ToolIcon } from '@/components/home/tool-icon';
import { HOME_TOOLS, type HomeTool, type HomeToolId } from '@/components/home/home-tools';
import { androidRipple, HomeLayout } from '@/constants/ui';
import { useOpenLabelFile } from '@/lib/label-share/use-open-label-file';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

export function ToolTile({ id, minHeight = HomeLayout.tileHeight }: { id: HomeToolId; minHeight?: number }) {
  const tool: HomeTool = HOME_TOOLS[id];
  return tool.action === 'openLabelFile' ? (
    <OpenLabelFileTile id={id} minHeight={minHeight} />
  ) : (
    <LinkTile id={id} minHeight={minHeight} />
  );
}

function LinkTile({ id, minHeight }: { id: HomeToolId; minHeight: number }) {
  const router = useRouter();
  const tool: HomeTool = HOME_TOOLS[id];
  return <TileBody id={id} minHeight={minHeight} onPress={() => router.push(tool.href as any)} />;
}

/** Import: picks a .seznik file and opens it on the canvas, like Import label in the New label sheet. */
function OpenLabelFileTile({ id, minHeight }: { id: HomeToolId; minHeight: number }) {
  const { openLabelFile, documentSourceSheet } = useOpenLabelFile();
  return <TileBody id={id} minHeight={minHeight} onPress={() => void openLabelFile()} extra={documentSourceSheet} />;
}

function TileBody({
  id,
  minHeight,
  onPress,
  extra,
}: {
  id: HomeToolId;
  minHeight: number;
  onPress: () => void;
  extra?: ReactNode;
}) {
  useThemeRefresh();
  const tool: HomeTool = HOME_TOOLS[id];

  return (
    <View style={styles.outer}>
      <Pressable
        onPress={onPress}
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
      {extra}
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
