import { nonSerialFixture, hashBytes } from './regression-fixture';
import { rasterizeDocumentToBitmapTimed } from '@/printing/raster/skia-rasterizer';
import type { LabelDocument } from '@/lib/label-document';

export function rasterHash(doc: LabelDocument = nonSerialFixture(), dpi = 203): string {
  const r = rasterizeDocumentToBitmapTimed(doc, dpi, { threshold: 160 }).result;
  return hashBytes(new Uint8Array(r.mono1bppBuffer));
}
if (require.main === module) console.log(rasterHash());
