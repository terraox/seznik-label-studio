/**
 * The picture document for a finished image: one image element covering the label, with its dots
 * (already dithered at the label's dot size) parked for the headless raster. Pure: no printer.
 */
import { createLabelDocument, generateId, type LabelElement, type PaperType } from '@/lib/label-document';
import type { GrayRaster } from '@/lib/printer/escpos';
import { rectMmToDots } from '@/lib/printer/print-spec';
import { modedImageSettings } from '@/printing/raster/image-element-settings';
import {
  photoRegionMask,
  renderPageToMono,
  resampleGray,
  type ImageSettings,
} from '@/printing/raster/image-modes';
import { imageTileSignature, registerImageTile } from '@/printing/raster/image-tiles';

export type ModedGrayPrintInput = {
  gray: GrayRaster;
  widthMm: number;
  heightMm: number;
  settings: ImageSettings;
  /** PDF pages: dither only the photo regions, leave text and barcodes crisp. */
  photosOnly?: boolean;
  name?: string;
  paperType?: PaperType;
  copies?: number;
  gapMm?: number;
  darkness?: number | null;
  speed?: number | null;
  /** Extra offset on top of the saved printer calibration. */
  offsetMm?: { x?: number; y?: number };
};

export function buildModedPictureDocument(input: ModedGrayPrintInput, dpi: number) {
  const box = rectMmToDots(0, 0, input.widthMm, input.heightMm, dpi);
  const w = Math.max(1, box.widthDots);
  const h = Math.max(1, box.heightDots);
  const fitted = resampleGray(input.gray.gray, input.gray.width, input.gray.height, w, h);
  const mask = input.photosOnly ? photoRegionMask(fitted, w, h) : null;
  const mono = renderPageToMono(fitted, w, h, input.settings, mask);

  const el = {
    id: generateId('picture'),
    type: 'image',
    uri: `picture:${generateId('src')}`,
    rotation: 0,
    left: 0,
    top: 0,
    width: input.widthMm,
    height: input.heightMm,
    lockMovement: true,
    needPrinting: true,
    antiColor: false,
    contentFit: 'fill',
    imageMode: input.settings.mode,
    threshold: input.settings.threshold,
    brightness: input.settings.brightness,
    contrast: input.settings.contrast,
    invert: input.settings.invert,
  } as unknown as Extract<LabelElement, { type: 'image' }>;
  const doc = createLabelDocument({
    name: input.name ?? 'Picture',
    widthMm: input.widthMm,
    heightMm: input.heightMm,
    paperType: input.paperType ?? 'Label',
    elements: [el],
  });
  const settings = modedImageSettings(el)!;
  registerImageTile(el.id, imageTileSignature(el, settings, dpi), dpi, {
    width: w,
    height: h,
    gray: mono,
    mask: null,
    offsetX: 0,
    offsetY: 0,
  });
  return doc;
}

