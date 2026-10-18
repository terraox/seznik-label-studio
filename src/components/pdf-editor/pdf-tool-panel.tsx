import type { ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { FormScrollView } from '@/components/ui/form-scroll-view';
import { AppIcon } from '@/components/app-icon';
import { WalkthroughTarget } from '@/components/walkthrough/walkthrough-target';
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
  accessory,
  bottomInset = 0,
}: {
  active: PdfToolId | null;
  onChange: (id: PdfToolId) => void;
  children: ReactNode;
  disabled?: boolean;
  /** Sits between the tool options and the icon row. Used for page browsing. */
  accessory?: ReactNode;
  bottomInset?: number;
}) {
  useThemeRefresh();
  const { height } = useWindowDimensions();
  const optionsMax = Math.round(height * 0.33);

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(bottomInset, 6) }]}>
      {active !== null ? (
        <FormScrollView
          style={{ maxHeight: optionsMax }}
          contentContainerStyle={styles.options}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled>
          {children}
        </FormScrollView>
      ) : null}
      {accessory}
      <View style={styles.row}>
        {TOOLS.map((t) => {
          const isActive = active === t.id;
          return (
            <WalkthroughTarget key={t.id} id={`pdf.tool.${t.id}`} style={styles.toolSlot}>
            <Pressable
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: isActive }}
              onPress={() => onChange(t.id)}
              style={[styles.tool, isActive && styles.toolOn, disabled && styles.toolOff]}>
              <AppIcon name={t.icon} size={22} tintColor={isActive ? C.accent : C.textSecondary} />
            </Pressable>
            </WalkthroughTarget>
          );
        })}
      </View>
    </View>
  );
}

const styles = themedStyles((c) => ({
  wrap: {
    flexShrink: 0,
    backgroundColor: c.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
  },
  options: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  toolSlot: { flex: 1 },
  tool: {
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolOn: {
    backgroundColor: c.accentSoft,
  },
  toolOff: { opacity: 0.4 },
}));
