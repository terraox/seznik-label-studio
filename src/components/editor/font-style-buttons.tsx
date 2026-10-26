import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { PRESS_HIT_SLOP } from '@/constants/ui';
import { C, themedStyles, useThemeRefresh } from '@/theme';

type StyleFields = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
};

type FontStyleButtonsProps = {
  state: StyleFields;
  onChange: (updates: Partial<StyleFields>) => void;
  /** Underline and strikethrough toggles; off for elements that only take bold and italic. */
  decorations?: boolean;
  /** Match host panel pressable styling when provided. */
  pressableStyle?: (active: boolean, pressed: boolean) => StyleProp<ViewStyle>;
};

/**
 * B / I / U / S toggles for property panels.
 *
 * Italic + decorations use View transforms/bars (not Text styles): Android often
 * drops Text-level transform and textDecorationLine, and themedStyles StyleSheet
 * caches can leave new keys undefined after a soft Fast Refresh.
 */
export function FontStyleButtons({ state, onChange, decorations = true, pressableStyle }: FontStyleButtonsProps) {
  useThemeRefresh();
  const items = [
    { key: 'bold' as const, label: 'B', active: state.bold, field: 'bold' as const },
    { key: 'italic' as const, label: '𝐼', active: state.italic, field: 'italic' as const },
    { key: 'underline' as const, label: 'U', active: state.underline, field: 'underline' as const },
    { key: 'strike' as const, label: 'S', active: state.strikethrough, field: 'strikethrough' as const },
  ].filter((item) => decorations || (item.key !== 'underline' && item.key !== 'strike'));

  return (
    <View style={styles.styleRow}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => onChange({ [item.field]: !item.active })}
          hitSlop={PRESS_HIT_SLOP}
          style={({ pressed }) =>
            pressableStyle
              ? pressableStyle(item.active, pressed)
              : [styles.styleBtn, item.active && styles.styleBtnActive, pressed && styles.pressed]
          }>
          <View
            style={[
              styles.glyphWrap,
              // Inline transform so a stale themedStyles cache cannot drop italic.
              item.key === 'italic' ? { transform: [{ skewX: '-28deg' }] } : null,
            ]}>
            <Text
              style={[
                styles.styleBtnText,
                item.key === 'bold' && styles.boldGlyph,
                item.key === 'italic' && styles.italicGlyphText,
                item.active && styles.styleBtnTextActive,
              ]}>
              {item.label}
            </Text>
            {item.key === 'underline' ? (
              <View
                style={[
                  styles.underlineBar,
                  { backgroundColor: item.active ? C.onAccent : C.textSecondary },
                ]}
              />
            ) : null}
            {item.key === 'strike' ? (
              <View
                style={[
                  styles.strikeBar,
                  { backgroundColor: item.active ? C.onAccent : C.textSecondary },
                ]}
              />
            ) : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = themedStyles((c) => ({
  styleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  styleBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: c.fillStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  styleBtnActive: {
    backgroundColor: c.accent,
  },
  pressed: {
    opacity: 0.7,
  },
  glyphWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 18,
    minHeight: 22,
  },
  styleBtnText: {
    fontSize: 16,
    color: c.textSecondary,
    fontWeight: '600',
  },
  styleBtnTextActive: {
    color: c.onAccent,
  },
  boldGlyph: {
    fontWeight: '800',
  },
  italicGlyphText: {
    fontWeight: '700',
  },
  underlineBar: {
    marginTop: 2,
    width: 14,
    height: 2,
    borderRadius: 1,
  },
  strikeBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
  },
}));
