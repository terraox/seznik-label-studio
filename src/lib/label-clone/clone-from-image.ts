import type { LabelDocument, PaperType } from '@/lib/label-document';

import { buildClonedLabel } from './build-cloned-label';
import { scanCloneImage } from './scan-image';

export type CloneLabelFromImageParams = {
  uri: string;
  width?: number;
  height?: number;
  widthMm: number;
  heightMm: number;
  paperType?: PaperType;
  name?: string;
};

/**
 * Scan a photographed label and open it as native canvas elements.
 * Returns null when OCR/codes are too thin to rebuild.
 */
export async function cloneLabelFromImage(
  params: CloneLabelFromImageParams,
): Promise<LabelDocument | null> {
  const detection = await scanCloneImage(params.uri, params.width, params.height);
  return buildClonedLabel(detection, {
    widthMm: params.widthMm,
    heightMm: params.heightMm,
    paperType: params.paperType,
    name: params.name,
  });
}
