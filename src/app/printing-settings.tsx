import { router } from 'expo-router';
import { useState } from 'react';

import {
  SettingsCard,
  SettingsDivider,
  SettingsNavRow,
  SettingsScreenShell,
  SettingsSectionLabel,
  SettingsSegmentRow,
  SettingsToggleGroup,
  SettingsToggleRow,
} from '@/components/settings-ui';
import { useSettingsStore } from '@/stores/settings-store';

export default function PrintingSettingsScreen() {
  const { recordHistory, autoPages, returnPrevious, printerDpi, printerAlignment, printheadWidthMm } =
    useSettingsStore((s) => s.printing);
  const patchPrinting = useSettingsStore((s) => s.patchPrinting);
  const [showHardware, setShowHardware] = useState(false);

  const dpiLabel =
    printerDpi === 203 ? '203 DPI' : printerDpi === 300 ? '300 DPI' : printerDpi === 304 ? '304 DPI' : 'Auto';
  const alignmentLabel = printerAlignment === 'left' ? 'Left' : 'Center';
  const widthLabel = `${printheadWidthMm} mm`;

  return (
    <SettingsScreenShell title="Printing Settings">
      <SettingsToggleGroup
        label="Recording Printing Histories"
        value={recordHistory}
        onValueChange={(value) => patchPrinting({ recordHistory: value })}
        description="The record of the print history is generated locally after each print. Print history can be printed again, but not edited."
      />

      <SettingsToggleGroup
        label="Automatically Calculates Pages"
        value={autoPages}
        onValueChange={(value) => patchPrinting({ autoPages: value })}
        description="When you print Excel or a data source, you can calculate the number of remaining pages based on the current page number and the total number of pages. If turned off, only one page is printed at a time by default."
      />

      <SettingsCard>
        <SettingsToggleRow
          label="Return to The Previous Interface"
          value={returnPrevious}
          onValueChange={(value) => patchPrinting({ returnPrevious: value })}
        />
      </SettingsCard>

      <SettingsSectionLabel>ADVANCED</SettingsSectionLabel>
      <SettingsCard>
        <SettingsNavRow
          label={showHardware ? 'Hide printer hardware' : 'Printer resolution & alignment'}
          onPress={() => setShowHardware((v) => !v)}
        />
        {showHardware ? (
          <>
            <SettingsDivider />
            <SettingsSegmentRow
              label="Printer Resolution (DPI)"
              options={['Auto', '304 DPI', '300 DPI', '203 DPI'] as const}
              selected={dpiLabel}
              onSelect={(val) => {
                const dpi =
                  val === 'Auto' ? null : val === '203 DPI' ? 203 : val === '300 DPI' ? 300 : 304;
                patchPrinting({ printerDpi: dpi });
              }}
              showDivider
            />
            <SettingsSegmentRow
              label="Printhead Media Alignment"
              options={['Center', 'Left'] as const}
              selected={alignmentLabel}
              onSelect={(val) => {
                patchPrinting({ printerAlignment: val.toLowerCase() as 'center' | 'left' });
              }}
              showDivider
            />
            <SettingsSegmentRow
              label="Printhead Max Width"
              options={['108 mm', '104 mm', '80 mm'] as const}
              selected={widthLabel as '108 mm' | '104 mm' | '80 mm'}
              onSelect={(val) => {
                const w = parseInt(val, 10) || 108;
                patchPrinting({ printheadWidthMm: w });
              }}
            />
            <SettingsDivider />
            <SettingsNavRow
              label="Print Calibration Grid"
              onPress={() => router.push('/calibration-print')}
            />
            <SettingsDivider />
            <SettingsNavRow
              label="Printer Diagnostics & Latency Log"
              onPress={() => router.push('/printer-diagnostics')}
            />
          </>
        ) : null}
      </SettingsCard>
    </SettingsScreenShell>
  );
}
