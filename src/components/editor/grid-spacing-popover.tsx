import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { FormScrollView } from '@/components/ui/form-scroll-view';
import { TextInput } from '@/components/ui/text-input';

import { clampGridSpacingMm, GRID_SPACING_MAX_MM, GRID_SPACING_MIN_MM } from '@/lib/editor/canvas-grid';
import {
  GRID_CUSTOM_LABEL,
  GRID_OVERLAY_HELP,
  GRID_PRINT_DISCLAIMER,
  GRID_SPACING_OPTIONS,
  isPresetGridSpacing,
  spacingOptionForMm,
} from '@/lib/editor/grid-settings-ui';
import { Spacing } from '@/constants/theme';
import { Type, androidRipple } from '@/constants/ui';
import { themedStyles, useThemeRefresh } from '@/theme';
import { ALL_ORIENTATIONS } from '@/lib/layout/screen-sizes';

type GridSpacingPopoverProps = {
  visible: boolean;
  spacingMm: number;
  overlay: boolean;
  onClose: () => void;
  onSpacingChange: (spacingMm: number) => void;
  onOverlayChange: (overlay: boolean) => void;
};

function parseSpacingDraft(draft: string): number | null {
  const mm = Number.parseFloat(draft.replace(',', '.'));
  return Number.isFinite(mm) ? clampGridSpacingMm(mm) : null;
}

export function GridSpacingPopover({
  visible,
  spacingMm,
  overlay,
  onClose,
  onSpacingChange,
  onOverlayChange,
}: GridSpacingPopoverProps) {
  useThemeRefresh();
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!visible) return;
    setCustomOpen(!isPresetGridSpacing(spacingMm));
    setDraft(String(clampGridSpacingMm(spacingMm)));
  }, [visible, spacingMm]);

  const selected = customOpen ? GRID_CUSTOM_LABEL : spacingOptionForMm(spacingMm);

  const commitDraft = () => {
    const mm = parseSpacingDraft(draft);
    if (mm == null) return;
    onSpacingChange(mm);
    setDraft(String(mm));
  };

  return (
    <Modal
      supportedOrientations={ALL_ORIENTATIONS}
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <FormScrollView
        style={styles.scroll}
        contentContainerStyle={styles.backdrop}
        keyboardShouldPersistTaps="handled">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" />
        <Pressable style={styles.panel} onPress={() => undefined}>
          <Text style={styles.title}>Grid settings</Text>
          <Text style={styles.disclaimer}>{GRID_PRINT_DISCLAIMER}</Text>

          <View style={styles.chipRow}>
            {GRID_SPACING_OPTIONS.map((label) => {
              const active = label === selected;
              return (
                <Pressable
                  key={label}
                  onPress={() => {
                    if (label === GRID_CUSTOM_LABEL) {
                      setCustomOpen(true);
                      setDraft(String(clampGridSpacingMm(spacingMm)));
                      return;
                    }
                    const mm = Number.parseFloat(label);
                    if (!Number.isFinite(mm)) return;
                    setCustomOpen(false);
                    onSpacingChange(clampGridSpacingMm(mm));
                  }}
                  android_ripple={androidRipple}
                  style={({ pressed }) => [
                    styles.chip,
                    active && styles.chipActive,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          {customOpen ? (
            <View style={styles.customBlock}>
              <Text style={styles.customLabel}>Custom size (mm)</Text>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onEndEditing={commitDraft}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={commitDraft}
                selectTextOnFocus
                style={styles.customInput}
                accessibilityLabel="Custom grid spacing in millimetres"
              />
              <Text style={styles.customHint}>
                {GRID_SPACING_MIN_MM}–{GRID_SPACING_MAX_MM} mm
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => onOverlayChange(!overlay)}
            android_ripple={androidRipple}
            accessibilityRole="switch"
            accessibilityState={{ checked: overlay }}
            accessibilityLabel="Overlay grid on elements"
            style={({ pressed }) => [
              styles.overlayRow,
              overlay && styles.overlayRowActive,
              pressed && styles.pressed,
            ]}>
            <View style={styles.overlayTextCol}>
              <Text style={[styles.overlayTitle, overlay && styles.overlayTitleActive]}>Overlay</Text>
              <Text style={styles.overlayHelp}>{GRID_OVERLAY_HELP}</Text>
            </View>
            <View style={[styles.overlaySwitch, overlay && styles.overlaySwitchOn]}>
              <View style={[styles.overlayKnob, overlay && styles.overlayKnobOn]} />
            </View>
          </Pressable>

          <Pressable
            onPress={() => {
              if (customOpen) commitDraft();
              onClose();
            }}
            android_ripple={androidRipple}
            style={({ pressed }) => [styles.doneBtn, pressed && styles.pressed]}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </Pressable>
      </FormScrollView>
    </Modal>
  );
}

const styles = themedStyles((c) => ({
  scroll: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: c.scrim,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 96,
    paddingRight: Spacing.two,
    paddingLeft: Spacing.three,
  },
  panel: {
    width: 260,
    backgroundColor: c.surface,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  title: {
    ...Type.bodyMedium,
    color: c.text,
    fontWeight: '600',
  },
  disclaimer: {
    ...Type.caption,
    color: c.textMuted,
    lineHeight: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: c.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  chipActive: {
    backgroundColor: c.accentSoft,
    borderColor: c.accent,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: c.textMuted,
  },
  chipTextActive: {
    color: c.accent,
  },
  customBlock: {
    gap: 4,
  },
  customLabel: {
    ...Type.caption,
    color: c.text,
    fontWeight: '600',
  },
  customInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    color: c.text,
    backgroundColor: c.fill,
  },
  customHint: {
    ...Type.caption,
    color: c.textMuted,
  },
  overlayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: c.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  overlayRowActive: {
    backgroundColor: c.accentSoft,
    borderColor: c.accent,
  },
  overlayTextCol: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  overlayTitle: {
    ...Type.caption,
    fontWeight: '700',
    color: c.text,
  },
  overlayTitleActive: {
    color: c.accent,
  },
  overlayHelp: {
    ...Type.caption,
    color: c.textMuted,
    lineHeight: 15,
  },
  overlaySwitch: {
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: c.border,
    padding: 2,
    justifyContent: 'center',
  },
  overlaySwitchOn: {
    backgroundColor: c.accent,
  },
  overlayKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: c.surface,
  },
  overlayKnobOn: {
    alignSelf: 'flex-end',
  },
  doneBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  doneText: {
    ...Type.bodyMedium,
    color: c.accent,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.85,
  },
}));
