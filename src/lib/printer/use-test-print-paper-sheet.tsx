import { useCallback, useState, type ReactNode } from 'react';

import { ActionSheet } from '@/components/ui/action-sheet';
import type { PaperType } from '@/lib/label-document';
import { paperTypeLabel, paperTypesFor } from '@/lib/printer/paper-type';
import { usePrinterStore } from '@/stores/printer-store';

/**
 * "Print test label" asks for the paper first. Josh offers all four sensor modes;
 * Tejas / Rudra offer Label and Receipt.
 */
export function useTestPrintPaperSheet(onPick: (paperType: PaperType) => void): {
  askPaperType: () => void;
  paperSheet: ReactNode;
} {
  const [visible, setVisible] = useState(false);
  const sdkId = usePrinterStore((s) => s.sdkId);
  const askPaperType = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);

  const paperSheet = (
    <ActionSheet
      visible={visible}
      onClose={close}
      items={paperTypesFor(sdkId).map((type) => ({
        label: paperTypeLabel(type),
        onPress: () => onPick(type),
      }))}
    />
  );
  return { askPaperType, paperSheet };
}
