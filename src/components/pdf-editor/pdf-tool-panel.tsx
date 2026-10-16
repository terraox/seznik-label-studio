import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { C, themedStyles, useThemeRefresh } from '@/theme';

export type PdfToolId = 'crop' | 'rotate' | 'sharpness' | 'watermark' | 'color';

const TOOLS: { id: PdfToolId; label: string; icon: string }[] = [
  { id: 'crop', label: 'Crop', icon: 'rectangle.dashed' },
  { id: 'rotate', label: 'Rotate', icon: 'arrow.clockwise' },
  { id: 'sharpness', label: 'Sharpness', icon: 'slider.horizontal.3' },
  { id: 'watermark', label: 'Watermark', icon: 'character' },
  { id: 'color', label: 'Color', icon: 'circle.lefthalf.filled' },
];

export function PdfToolPanel({
  active,
  onChange,
  children,
  disabled,
}: {
  active: PdfToolId | null;
  onChange: (id: PdfToolId) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  useThemeRefresh();
  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        {TOOLS.map((t) => {
          const isActive = active === t.id;
          return (
            <Pressable
              key={t.id}
              disabled={disabled}
              onPress={() => onChange(t.id)}
              style={[styles.tool, isActive && styles.toolOn, disabled && styles.toolOff]}>
              <AppIcon name={t.icon} size={20} tintColor={isActive ? C.accent : C.textSecondary} />
              <Text style={[styles.toolText, isActive && styles.toolTextOn]} numberOfLines={1}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {active !== null ? (
        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {children}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = themedStyles((c) => ({
  wrap: {
    flexShrink: 0,
    backgroundColor: c.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
  },
  tool: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.hairline,
    backgroundColor: c.fill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 2,
    paddingVertical: 8,
  },
  toolOn: {
    borderColor: c.accent,
    backgroundColor: c.accentSoft,
  },
  toolOff: { opacity: 0.4 },
  toolText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  toolTextOn: { color: c.accent },
  body: {
    maxHeight: 240,
    paddingHorizontal: 12,
  },
}));
