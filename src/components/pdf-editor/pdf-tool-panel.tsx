import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { Palette } from '@/constants/ui';

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
              <AppIcon name={t.icon} size={20} tintColor={isActive ? Palette.accent : '#475569'} />
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

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
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
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 2,
    paddingVertical: 8,
  },
  toolOn: {
    borderColor: Palette.accent,
    backgroundColor: '#EEF2FF',
  },
  toolOff: { opacity: 0.4 },
  toolText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  toolTextOn: { color: Palette.accent },
  body: {
    maxHeight: 240,
    paddingHorizontal: 12,
  },
});
