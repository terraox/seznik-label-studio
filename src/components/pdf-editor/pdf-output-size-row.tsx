import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { LabelSizeSetupSection, type LabelSizePreset } from '@/components/label-size-setup-section';
import { type LabelUnit } from '@/lib/label-geometry';
import { OUTPUT_SIZE_PRESETS, type OutputSize } from '@/lib/pdf-editor/session';

function sizeFromMm(widthMm: number, heightMm: number): OutputSize {
  const preset = OUTPUT_SIZE_PRESETS.find(
    (p) => Math.abs(p.widthMm - widthMm) < 0.15 && Math.abs(p.heightMm - heightMm) < 0.15,
  );
  if (preset) {
    return { kind: preset.kind, widthMm: preset.widthMm, heightMm: preset.heightMm };
  }
  return { kind: 'custom', widthMm, heightMm };
}

export function PdfOutputSizeRow({
  value,
  onChange,
  preview,
  presets,
  unitSwitch,
}: {
  value: OutputSize;
  onChange: (next: OutputSize) => void;
  preview?: ReactNode;
  /** Replaces the default small-label presets. */
  presets?: LabelSizePreset[];
  /** Shows a mm / cm / in switch on the presets. */
  unitSwitch?: boolean;
}) {
  const [unit, setUnit] = useState<LabelUnit>('mm');

  return (
    <View style={styles.wrap}>
      <LabelSizeSetupSection
        widthMm={value.widthMm}
        heightMm={value.heightMm}
        unit={unit}
        onSizeChange={(widthMm, heightMm) => onChange(sizeFromMm(widthMm, heightMm))}
        onWidthChange={(widthMm) => onChange(sizeFromMm(widthMm, value.heightMm))}
        onHeightChange={(heightMm) => onChange(sizeFromMm(value.widthMm, heightMm))}
        onUnitChange={setUnit}
        presets={presets}
        unitSwitch={unitSwitch}
        preview={preview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
});
