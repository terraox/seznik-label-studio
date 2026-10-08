import type { LabelDocument } from '@/lib/label-document';

export type PrintHistoryEntry = {
  id: string;
  labelName: string;
  copies: number;
  printedAt: number;
  documentId?: string;
  source: 'label' | 'photo' | 'pdf' | 'scan' | 'excel' | 'img-to-label';
  /** Frozen label layout at print time (for preview when the live label is gone). */
  documentSnapshot?: LabelDocument;
  /** Raster jobs (photo, image-to-label, etc.). */
  previewImageUri?: string;
};
