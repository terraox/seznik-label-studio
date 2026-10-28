/**
 * Dither test sheet: one 50x30 label per image mode. Each has a photo, a gradient, a logo, text and
 * a QR code. The picture-like parts use the mode; text and the QR code are never dithered, so they
 * show what "crisp" looks like next to the dots.
 */
import { DEFAULT_ELEMENT_STATE, DEFAULT_QRCODE_STATE } from '@/components/editor/types';
import {
  createLabelDocument,
  generateId,
  type LabelDocument,
  type LabelElement,
} from '@/lib/label-document';
import { modedJobDpi } from '@/lib/printer/image-mode-print';
import { printLabelDocumentMainPipeline } from '@/lib/printer/main-pipeline-print';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { modedImageSettings } from '@/printing/raster/image-element-settings';
import { IMAGE_MODES, IMAGE_MODE_LABEL, type ImageMode } from '@/printing/raster/image-modes';
import { buildImageTile, imageTileSignature, registerImageTile } from '@/printing/raster/image-tiles';

export const DITHER_TEST_WIDTH_MM = 50;
export const DITHER_TEST_HEIGHT_MM = 30;
export const DITHER_TEST_GAP_MM = 3;

type Src = { gray: Uint8Array; width: number; height: number };

/** A smooth "photo": soft light from the upper left, a round highlight, some gentle texture. */
export function syntheticPhoto(w = 240, h = 210): Src {
  const gray = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / (w - 1);
      const ny = y / (h - 1);
      const base = 40 + 170 * (1 - Math.hypot(nx - 0.3, ny - 0.3) / 1.1);
      const dx = nx - 0.62;
      const dy = ny - 0.6;
      const ball = Math.max(0, 1 - Math.hypot(dx, dy) / 0.28) * 70;
      const grain = ((Math.sin(x * 0.9) + Math.sin(y * 1.3)) * 6) | 0;
      gray[y * w + x] = Math.max(0, Math.min(255, Math.round(base + ball + grain)));
    }
  }
  return { gray, width: w, height: h };
}

export function syntheticGradient(w = 270, h = 90): Src {
  const gray = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) gray[y * w + x] = Math.round((x / (w - 1)) * 255);
  return { gray, width: w, height: h };
}

/** A hard black-and-white mark: a ring, a bar and a block. Solid and dither should match it. */
export function syntheticLogo(s = 180): Src {
  const gray = new Uint8Array(s * s).fill(255);
  const c = s / 2;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const r = Math.hypot(x - c, y - c);
      const ring = r < s * 0.46 && r > s * 0.34;
      const bar = Math.abs(y - c) < s * 0.06 && x > s * 0.2 && x < s * 0.8;
      const block = x > s * 0.42 && x < s * 0.58 && y > s * 0.2 && y < s * 0.8;
      if (ring || bar || block) gray[y * s + x] = 0;
    }
  }
  return { gray, width: s, height: s };
}

function pictureElement(
  name: string,
  mode: ImageMode,
  left: number,
  top: number,
  width: number,
  height: number,
): Extract<LabelElement, { type: 'image' }> {
  return {
    id: generateId(name),
    type: 'image',
    uri: `dither-test:${name}`,
    rotation: 0,
    left,
    top,
    width,
    height,
    lockMovement: true,
    needPrinting: true,
    antiColor: false,
    contentFit: 'fill',
    imageMode: mode,
    threshold: 128,
    brightness: 0,
    contrast: 0,
    invert: false,
  } as unknown as Extract<LabelElement, { type: 'image' }>;
}

export function buildDitherTestDocument(mode: ImageMode, dpi: number): LabelDocument {
  const photo = pictureElement('photo', mode, 1, 1, 16, 14);
  const gradient = pictureElement('gradient', mode, 18, 1, 18, 6);
  const logo = pictureElement('logo', mode, 37, 1, 12, 12);
  const sources: [typeof photo, Src][] = [
    [photo, syntheticPhoto()],
    [gradient, syntheticGradient()],
    [logo, syntheticLogo()],
  ];
  for (const [el, src] of sources) {
    const settings = modedImageSettings(el)!;
    registerImageTile(el.id, imageTileSignature(el, settings, dpi), dpi, buildImageTile(el, src, dpi));
  }
  const text: LabelElement = {
    id: generateId('text'),
    type: 'text',
    ...DEFAULT_ELEMENT_STATE,
    text: IMAGE_MODE_LABEL[mode],
    left: 1,
    top: 17,
    width: 31,
    height: 5,
    fontSize: 9,
    autoWrapping: 'Close',
    autoTextHeight: false,
    fontFamily: 'Default',
    needPrinting: true,
  } as LabelElement;
  const text2: LabelElement = {
    ...text,
    id: generateId('text'),
    text: 'Text stays crisp',
    top: 23,
    height: 5,
    fontSize: 8,
  } as LabelElement;
  const qr: LabelElement = {
    id: generateId('qr'),
    type: 'qrcode',
    ...DEFAULT_QRCODE_STATE,
    content: 'SEZ-DITHER-TEST',
    encodeMode: 'QRCode',
    errorLevel: 'M',
    zoneSize: '1' as typeof DEFAULT_QRCODE_STATE.zoneSize,
    left: 34,
    top: 15,
    width: 14,
    height: 14,
    needPrinting: true,
  } as LabelElement;
  return createLabelDocument({
    name: `Dither test ${IMAGE_MODE_LABEL[mode]}`,
    widthMm: DITHER_TEST_WIDTH_MM,
    heightMm: DITHER_TEST_HEIGHT_MM,
    paperType: 'Label',
    elements: [photo, gradient, logo, text, text2, qr],
  });
}

export function ditherTestAvailable(): boolean {
  const m = getPrinterManager();
  return m.isConnected && (m.usesTd404CommandSet || m.isJosh);
}

/** Print one label per mode, in order, and return the modes sent. */
export async function printDitherTestSheet(modes: readonly ImageMode[] = IMAGE_MODES): Promise<ImageMode[]> {
  if (!ditherTestAvailable()) throw new Error('Connect a TD-404 or Josh printer.');
  const sent: ImageMode[] = [];
  for (const mode of modes) {
    const doc = buildDitherTestDocument(mode, modedJobDpi());
    await printLabelDocumentMainPipeline(doc, { gapMm: DITHER_TEST_GAP_MM });
    sent.push(mode);
  }
  return sent;
}
