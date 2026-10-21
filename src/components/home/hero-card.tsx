import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';

import { HOME_TOOLS } from '@/components/home/home-tools';
import { androidRipple, HomeLayout } from '@/constants/ui';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

/**
 * WePrint-style New Label glyph: outline back sheet (navy) + filled front sheet
 * (white) with a plus. Sits directly on the white hero card — no colored tile.
 */
function NewLabelHeroArt({ size = 52 }: { size?: number }) {
  useThemeRefresh();
  const scale = size / 52;
  const sheet = 36 * scale;
  const radius = 6 * scale;
  const stroke = 2.5 * scale;
  const plus = 14 * scale;
  const plusStroke = 3 * scale;

  return (
    <View style={{ width: size, height: size }}>
      {/* Back sheet — navy outline, offset top-right */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: sheet,
          height: sheet,
          borderRadius: radius,
          borderWidth: stroke,
          borderColor: C.brandInk,
        }}
      />
      {/* Front sheet — teal fill, offset bottom-left */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: sheet,
          height: sheet,
          borderRadius: radius,
          backgroundColor: C.accentFill,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View style={{ width: plus, height: plus, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              position: 'absolute',
              width: plus,
              height: plusStroke,
              borderRadius: plusStroke / 2,
              backgroundColor: '#FFFFFF', // theme-fixed: white plus on the accent sheet
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: plusStroke,
              height: plus,
              borderRadius: plusStroke / 2,
              backgroundColor: '#FFFFFF', // theme-fixed: white plus on the accent sheet
            }}
          />
        </View>
      </View>
    </View>
  );
}

export function HeroCard({
  compact = false,
}: {
  /** Slightly shorter description when the user already has labels. */
  compact?: boolean;
}) {
  useThemeRefresh();
  const router = useRouter();
  const tool = HOME_TOOLS.newLabel;

  return (
    <Pressable
      onPress={() => router.push(tool.href as any)}
      android_ripple={androidRipple}
      accessibilityRole="button"
      accessibilityLabel={tool.label}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.art}>
        <NewLabelHeroArt size={52} />
      </View>
      <View style={styles.copy}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={HomeLayout.labelMaxFontScale}
          style={styles.title}>
          {tool.label}
        </Text>
        <Text
          numberOfLines={compact ? 1 : 2}
          maxFontSizeMultiplier={HomeLayout.labelMaxFontScale}
          style={styles.detail}>
          Create a new blank label, and freely create label styles and styles.
        </Text>
      </View>
      <View style={styles.go}>
        <Ionicons name="arrow-forward" size={18} color="#FFFFFF" /* theme-fixed: arrow on the filled hero */ />
      </View>
    </Pressable>
  );
}

const styles = themedStyles((c, scheme) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    minHeight: HomeLayout.heroHeight,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: scheme === 'dark' ? c.surface : '#E4F3FB', // theme-fixed: soft sky hero
    ...cardElevation(c, scheme),
    borderColor: scheme === 'dark' ? c.cardBorder : '#C5E4F4', // theme-fixed: soft sky hero
  },
  art: {
    width: 52,
    height: 52,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
    paddingRight: 4,
  },
  title: {
    color: c.text,
    fontSize: 18,
    fontWeight: '700',
  },
  detail: {
    color: c.textSecondary,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
  go: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
}));
