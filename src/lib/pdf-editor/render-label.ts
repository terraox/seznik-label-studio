import * as FileSystem from 'expo-file-system/legacy';
import { renderPdfPage } from 'pdf-raster';
import { AlphaType, ColorType, FilterMode, MipmapMode, Skia } from '@shopify/react-native-skia';

import { planLabelRender } from '@/lib/pdf-editor/label-render-plan';
import {
  resolveScopeIndices,
  type PdfEditSession,
} from '@/lib/pdf-editor/session';
import { colorContrastPreviewMatrix, unsharpGray } from '@/lib/pdf-editor/sharpen';
import type { GrayRaster } from '@/lib/printer/escpos';

export type LabelPageRaster = {
  pageIndex: number;
  widthMm: number;
  heightMm: number;
  gray: GrayRaster;
};

/** Pages with a watermark still go through the PDF composer; everything else renders natively. */
export function pageNeedsComposer(session: PdfEditSession, pageIndex: number): boolean {
  if (!session.watermark) return false;
  return resolveScopeIndices(session.watermark.scope, session.pageCount, session.currentPageIndex).includes(
    pageIndex,
  );
}

function cropForPage(session: PdfEditSession, pageIndex: number) {
  const crop = session.crop;
  if (!crop?.sizeNorm) return null;
  const pages = resolveScopeIndices(crop.scope, session.pageCount, session.currentPageIndex);
  if (!pages.includes(pageIndex)) return null;
  return { originNorm: crop.originNorm, sizeNorm: crop.sizeNorm };
}

/**
 * Render one edited page straight to a printer-resolution luminance raster:
 * rasterise the source page once, then crop, rotate, fit into the label and
 * apply sharpness in a single native Skia pass. No PDF rebuild, no PNG round trip in JS.
 */
export async function renderLabelPageGray(
  session: PdfEditSession,
  pageIndex: number,
  dpi: number,
): Promise<LabelPageRaster> {
  const pageSize = session.pageSizesPt[pageIndex] ?? { w: 612, h: 792 };
  const sharpness = session.sharpnessByPage[pageIndex] ?? 0;
  const plan = planLabelRender({
    pageWpt: pageSize.w,
    pageHpt: pageSize.h,
    crop: cropForPage(session, pageIndex),
    rotationDeg: session.rotationByPage[pageIndex] ?? 0,
    widthMm: session.outputSize.widthMm,
    heightMm: session.outputSize.heightMm,
    dpi,
  });

  const rendered = await renderPdfPage(session.sourceUri, pageIndex, plan.rasterDpi);
  try {
    const data = await Skia.Data.fromURI(rendered.uri);
    const image = Skia.Image.MakeImageFromEncoded(data);
    if (!image) throw new Error('Could not decode the rendered PDF page.');
    const surface = Skia.Surface.MakeOffscreen(plan.dotsW, plan.dotsH);
    if (!surface) throw new Error('Could not create a print surface.');

    const canvas = surface.getCanvas();
    canvas.clear(Skia.Color('#FFFFFF'));
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    if (sharpness > 0) {
      paint.setColorFilter(Skia.ColorFilter.MakeMatrix(colorContrastPreviewMatrix(sharpness)));
    }

    const iw = image.width();
    const ih = image.height();
    const srcRect = Skia.XYWHRect(plan.src.x * iw, plan.src.y * ih, plan.src.w * iw, plan.src.h * ih);
    // Fit using the real bitmap shape, so the crop is never stretched even if the PDF's declared size differs.
    const cropPxW = plan.src.w * iw;
    const cropPxH = plan.src.h * ih;
    const turned = plan.rotation === 90 || plan.rotation === 270;
    const fit = Math.min(plan.dotsW / (turned ? cropPxH : cropPxW), plan.dotsH / (turned ? cropPxW : cropPxH));
    const drawW = cropPxW * fit;
    const drawH = cropPxH * fit;
    const dstRect = Skia.XYWHRect(-drawW / 2, -drawH / 2, drawW, drawH);

    canvas.save();
    canvas.translate(plan.dotsW / 2, plan.dotsH / 2);
    if (plan.rotation !== 0) canvas.rotate(plan.rotation, 0, 0);
    canvas.drawImageRectOptions(image, srcRect, dstRect, FilterMode.Linear, MipmapMode.Linear, paint);
    canvas.restore();
    surface.flush();

    const pixels = surface.makeImageSnapshot().readPixels(0, 0, {
      width: plan.dotsW,
      height: plan.dotsH,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    });
    if (!pixels) throw new Error('Could not read the rendered label.');
    const rgba = pixels as Uint8Array;
    const gray = new Uint8Array(plan.dotsW * plan.dotsH);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
      gray[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
    }
    const sharp = sharpness > 0 ? unsharpGray(gray, plan.dotsW, plan.dotsH, sharpness, 1) : gray;
    return {
      pageIndex,
      widthMm: session.outputSize.widthMm,
      heightMm: session.outputSize.heightMm,
      gray: { width: plan.dotsW, height: plan.dotsH, gray: sharp },
    };
  } finally {
    await FileSystem.deleteAsync(rendered.uri, { idempotent: true }).catch(() => {});
  }
}
