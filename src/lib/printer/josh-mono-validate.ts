import { joshEffectiveDpi } from '@/lib/printer/josh-print';
import { packedPageDots } from '@/printing/raster/skia-rasterizer';

/**
 * JOSH mono page grid. Width is padded up to a multiple of 8 so a partial last
 * byte is kept (white on the right). `drawDotsW` is the column count drawn
 * across `widthMm`; the pad is cropped before LPAPI drawBitmap so the page is
 * not stretched.
 */
export function joshPackedPageDots(widthMm: number, heightMm: number, dpi = joshEffectiveDpi()) {
  const page = packedPageDots(widthMm, heightMm, dpi, 'ceil');
  return { ...page, drawDotsW: page.sizeDotsW };
}

export type JoshMonoBufferCheck = {
  monoBytes: Uint8Array;
  widthDots: number;
  heightDots: number;
  bytesPerRow: number;
  widthMm: number;
  heightMm: number;
  dpi?: number;
};

/** Reject mismatched buffers; never pad or truncate. */
export function assertJoshMonoBuffer(args: JoshMonoBufferCheck): void {
  const dpi = joshEffectiveDpi(args.dpi);
  const { packedW, packedH } = joshPackedPageDots(args.widthMm, args.heightMm, dpi);
  const bytesPerRow = Math.ceil(packedW / 8);
  if (args.bytesPerRow * 8 !== packedW) {
    throw new Error(
      `JOSH mono bytesPerRow*8 (${args.bytesPerRow * 8}) != packedW (${packedW}) for ${args.widthMm}x${args.heightMm}mm @ ${dpi} dpi`,
    );
  }
  if (args.widthDots !== packedW) {
    throw new Error(`JOSH mono widthDots (${args.widthDots}) != packedW (${packedW})`);
  }
  if (args.heightDots !== packedH) {
    throw new Error(`JOSH mono heightDots (${args.heightDots}) != packedH (${packedH})`);
  }
  const expectedLen = bytesPerRow * packedH;
  if (args.monoBytes.length !== expectedLen) {
    throw new Error(
      `JOSH mono buffer length ${args.monoBytes.length} != bytesPerRow*heightDots (${expectedLen})`,
    );
  }
}
