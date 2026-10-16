import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LabelDimensionModal } from '@/components/label-dimension-modal';
import {
  SettingsCard,
  SettingsSectionLabel,
  SettingsSegmentRow,
  SettingsStepperRow,
  SettingsToggleRow,
  SettingsValueRow,
} from '@/components/settings-ui';
import { formatLiveDate, formatLiveTime } from '@/components/editor/types';
import { BARCODE_MODES } from '@/lib/barcode-code128';
import type { LabelUnit } from '@/lib/label-geometry';
import { parseOrientation, type LabelOrientation, type PaperType } from '@/lib/label-document';
import { useSettingsStore } from '@/stores/settings-store';
import { androidRipple } from '@/constants/ui';
import { themedStyles, useThemeRefresh } from '@/theme';

const ORIENTATIONS = ['0°', '90°', '180°', '270°'] as const;
const PAPER_TYPES = ['Receipt', 'Label', 'Cardstock', 'Transparent'] as const;
const WRAP_MODES = ['Close', 'Char', 'Word'] as const;
const QR_LEVELS = ['L', 'M', 'Q', 'H'] as const;
const QR_ZONES = ['0', '2', '4'] as const;
const COLOR_MODES = ['Original', 'B & W', 'Halftone'] as const;

type DimensionField = 'width' | 'height' | null;

/** Default label element properties (WePrint “Default Property Settings” sections). */
export function DefaultPropertySettingsFields() {
  useThemeRefresh();
  const defaults = useSettingsStore((s) => s.defaults);
  const patchDefaults = useSettingsStore((s) => s.patchDefaults);

  const [dimensionField, setDimensionField] = useState<DimensionField>(null);
  const [unit, setUnit] = useState<LabelUnit>('mm');
  const [barcodePickerOpen, setBarcodePickerOpen] = useState(false);
  const [liveNow, setLiveNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setLiveNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const orientation = `${defaults.orientation}°` as (typeof ORIENTATIONS)[number];
  const paperType = PAPER_TYPES.includes(defaults.paperType as (typeof PAPER_TYPES)[number])
    ? (defaults.paperType as (typeof PAPER_TYPES)[number])
    : 'Label';

  return (
    <>
      <SettingsSectionLabel>Label</SettingsSectionLabel>
      <SettingsCard>
        <SettingsValueRow
          label="Label Width"
          value={`${defaults.labelWidth.toFixed(2)} mm`}
          onPress={() => setDimensionField('width')}
          showDivider
        />
        <SettingsValueRow
          label="Label Height"
          value={`${defaults.labelHeight.toFixed(2)} mm`}
          onPress={() => setDimensionField('height')}
          showDivider
        />
        <SettingsSegmentRow
          label="Orientation"
          options={ORIENTATIONS}
          selected={orientation}
          onSelect={(value) =>
            patchDefaults({ orientation: parseOrientation(value) as LabelOrientation })
          }
          showDivider
        />
        <SettingsSegmentRow
          label="Paper Type"
          options={PAPER_TYPES}
          selected={paperType}
          onSelect={(value) => patchDefaults({ paperType: value as PaperType })}
        />
      </SettingsCard>

      <SettingsSectionLabel>Font</SettingsSectionLabel>
      <SettingsCard>
        <SettingsToggleRow
          label="Auto Fit Font"
          value={defaults.autoFitFont}
          onValueChange={(v) => patchDefaults({ autoFitFont: v })}
          showDivider
        />
        <SettingsToggleRow
          label="Auto Fit Size"
          value={defaults.autoFitSize}
          onValueChange={(v) => patchDefaults({ autoFitSize: v })}
        />
      </SettingsCard>

      <SettingsSectionLabel>Text</SettingsSectionLabel>
      <SettingsCard>
        <SettingsSegmentRow
          label="Auto Wrapping"
          options={WRAP_MODES}
          selected={defaults.autoWrap as (typeof WRAP_MODES)[number]}
          onSelect={(v) => patchDefaults({ autoWrap: v })}
          showDivider
        />
        <SettingsToggleRow
          label="Auto Text Height"
          value={defaults.autoTextHeight}
          onValueChange={(v) => patchDefaults({ autoTextHeight: v })}
        />
      </SettingsCard>

      <SettingsSectionLabel>Time</SettingsSectionLabel>
      <SettingsCard>
        <SettingsValueRow
          label="Date Display"
          value={formatLiveDate(liveNow)}
          onPress={() =>
            Alert.alert(
              'Date Display',
              'New time elements use the live date in YYYY-MM-DD format. Change the format in the time element’s Format tab after placing it on the label.',
            )
          }
          showDivider
        />
        <SettingsValueRow
          label="Time Display"
          value={formatLiveTime(liveNow)}
          onPress={() =>
            Alert.alert(
              'Time Display',
              'New time elements use the live clock in 24-hour HH:MM:SS format. Change the format in the time element’s Format tab after placing it on the label.',
            )
          }
        />
      </SettingsCard>

      <SettingsSectionLabel>Barcode</SettingsSectionLabel>
      <SettingsCard>
        <SettingsValueRow
          label="Encode Mode"
          value={defaults.barcodeEncodeMode}
          onPress={() => setBarcodePickerOpen(true)}
        />
      </SettingsCard>

      <SettingsSectionLabel>QRCode</SettingsSectionLabel>
      <SettingsCard>
        <SettingsSegmentRow
          label="Error Level"
          options={QR_LEVELS}
          selected={defaults.qrErrorLevel as (typeof QR_LEVELS)[number]}
          onSelect={(v) => patchDefaults({ qrErrorLevel: v })}
          showDivider
        />
        <SettingsSegmentRow
          label="Zone Size"
          options={QR_ZONES}
          selected={defaults.qrZoneSize as (typeof QR_ZONES)[number]}
          onSelect={(v) => patchDefaults({ qrZoneSize: v })}
        />
      </SettingsCard>

      <SettingsSectionLabel>Image</SettingsSectionLabel>
      <SettingsCard>
        <SettingsToggleRow
          label="Tile"
          value={defaults.tileImage}
          onValueChange={(v) => patchDefaults({ tileImage: v })}
          showDivider
        />
        <SettingsSegmentRow
          label="Color Mode"
          options={COLOR_MODES}
          selected={defaults.colorMode}
          onSelect={(v) => patchDefaults({ colorMode: v })}
          showDivider
        />
        <SettingsStepperRow
          label="Gray Threshold"
          value={String(defaults.grayThreshold)}
          minusDisabled={defaults.grayThreshold <= 0}
          onMinus={() => patchDefaults({ grayThreshold: Math.max(0, defaults.grayThreshold - 1) })}
          onPlus={() => patchDefaults({ grayThreshold: Math.min(255, defaults.grayThreshold + 1) })}
        />
      </SettingsCard>

      <LabelDimensionModal
        visible={dimensionField === 'width'}
        title="Label Width"
        valueMm={defaults.labelWidth}
        otherMm={defaults.labelHeight}
        axis="width"
        unit={unit}
        onUnitChange={setUnit}
        onClose={() => setDimensionField(null)}
        onConfirm={(valueMm) => {
          patchDefaults({ labelWidth: valueMm });
          setDimensionField(null);
        }}
      />
      <LabelDimensionModal
        visible={dimensionField === 'height'}
        title="Label Height"
        valueMm={defaults.labelHeight}
        otherMm={defaults.labelWidth}
        axis="height"
        unit={unit}
        onUnitChange={setUnit}
        onClose={() => setDimensionField(null)}
        onConfirm={(valueMm) => {
          patchDefaults({ labelHeight: valueMm });
          setDimensionField(null);
        }}
      />

      <Modal
        visible={barcodePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setBarcodePickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setBarcodePickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={() => undefined}>
            <Text style={styles.modalTitle}>Encode Mode</Text>
            <ScrollView style={styles.modalList}>
              {BARCODE_MODES.map((mode) => {
                const active = mode === defaults.barcodeEncodeMode;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => {
                      patchDefaults({ barcodeEncodeMode: mode });
                      setBarcodePickerOpen(false);
                    }}
                    android_ripple={androidRipple}
                    style={({ pressed }) => [
                      styles.modalRow,
                      active && styles.modalRowActive,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.modalRowText, active && styles.modalRowTextActive]}>{mode}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = themedStyles((c) => ({
  modalBackdrop: {
    flex: 1,
    backgroundColor: c.scrim,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalSheet: {
    backgroundColor: c.surface,
    borderRadius: 14,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: c.text,
    textAlign: 'center',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.hairline,
  },
  modalList: {
    maxHeight: 320,
  },
  modalRow: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  modalRowActive: {
    backgroundColor: c.fill,
  },
  modalRowText: {
    fontSize: 16,
    color: c.textSecondary,
    textAlign: 'center',
  },
  modalRowTextActive: {
    color: c.accent,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
}));
