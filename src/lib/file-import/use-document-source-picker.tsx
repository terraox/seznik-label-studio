import { useCallback, type ReactNode } from 'react';

import {
  pickDocumentAsset,
  type PickedDocument,
} from '@/lib/file-import/pick-document';
import type { DocumentPreset } from '@/lib/file-import/mime-presets';
import { useFileSourceSheet } from '@/lib/file-import/use-file-source-sheet';

/**
 * Ask Local File vs Drive, then open the matching system picker.
 */
export function useDocumentSourcePicker(): {
  pickDocumentWithSource: (options: { preset: DocumentPreset }) => Promise<PickedDocument>;
  documentSourceSheet: ReactNode;
} {
  const { requestFileSource, fileSourceSheet } = useFileSourceSheet();

  const pickDocumentWithSource = useCallback(
    async (options: { preset: DocumentPreset }): Promise<PickedDocument> => {
      const source = await requestFileSource();
      if (!source) return { ok: false, reason: 'cancelled' };
      return pickDocumentAsset({ ...options, source });
    },
    [requestFileSource],
  );

  return { pickDocumentWithSource, documentSourceSheet: fileSourceSheet };
}
