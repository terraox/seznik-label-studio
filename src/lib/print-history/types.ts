import type { LabelDocument } from '@/lib/label-document';

export type PrintHistoryEntry = {
  id: string;
  labelName: string;
  copies: number;
  printedAt: number;
  documentId?: string;
  source: 'label' | 'photo' | 'pdf' | 'scan' | 'excel' | 'img-to-label';
  /** On-disk snapshot under sezprint/print-history (survives label library deletes). */
  snapshotFileId?: string;
  /** @deprecated Migrated to snapshotFileId on disk — not persisted in AsyncStorage. */
  documentSnapshot?: LabelDocument;
  /** Raster jobs (photo, image-to-label, etc.). */
  previewImageUri?: string;
};
