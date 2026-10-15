import {
  DEFAULT_BARCODE_STATE,
  DEFAULT_ELEMENT_STATE,
  DEFAULT_QRCODE_STATE,
  type QrEncodeMode,
} from '@/components/editor/types';
import { barcodeEncodeModeForScanType } from '@/constants/editor-bridge';
import { defaultBorderPlacement } from '@/lib/border-geometry';
import {
  createLabelDocument,
  generateId,
  type LabelDocument,
  type LabelElement,
  type PaperType,
} from '@/lib/label-document';
import { clampLabelMm } from '@/lib/label-geometry';
import { measureTextWidthMm } from '@/lib/text-metrics';

import {
  attachLineBoxToCode,
  cloneSourceRect,
  createCloneMapping,
  looksLikeWaybill,
  mapFrameToMm,
  mapNormBoxToMm,
  mapPxBoxToMm,
  mmToPt,
  resolveCloneStockSize,
  round2,
} from './geometry';
import type { CloneCodeHit, CloneDetection, CloneMapping, CloneMmBox, CloneOcrLine } from './types';

export { mapPxBoxToMm, resolveCloneStockSize, looksLikeWaybill } from './geometry';

function normalizePayload(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

export function boxOverlapRatio(a: CloneMmBox, b: CloneMmBox): number {
  const x0 = Math.max(a.left, b.left);
  const y0 = Math.max(a.top, b.top);
  const x1 = Math.min(a.left + a.width, b.left + b.width);
  const y1 = Math.min(a.top + a.height, b.top + b.height);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const area = Math.max(0.01, a.width * a.height);
  return inter / area;
}

export function clampMmBox(box: CloneMmBox, widthMm: number, heightMm: number, minMm = 1.2): CloneMmBox {
  const min = Math.max(0.7, minMm);
  let width = Math.max(min, box.width);
  let height = Math.max(min, box.height);
  let left = Number.isFinite(box.left) ? box.left : 0.4;
  let top = Number.isFinite(box.top) ? box.top : 0.4;
  const maxW = Math.max(min, widthMm - 0.4);
  const maxH = Math.max(min, heightMm - 0.4);
  if (width > maxW) width = maxW;
  if (height > maxH) height = maxH;
  if (left < 0.3) left = 0.3;
  if (top < 0.3) top = 0.3;
  if (left + width > widthMm - 0.3) left = Math.max(0.3, widthMm - 0.3 - width);
  if (top + height > heightMm - 0.3) top = Math.max(0.3, heightMm - 0.3 - height);
  return {
    left: round2(left),
    top: round2(top),
    width: round2(width),
    height: round2(height),
  };
}

export function isCodePayloadText(text: string, payloads: string[]): boolean {
  const n = normalizePayload(text);
  if (n.length < 4) return false;
  return payloads.some((payload) => {
    const q = normalizePayload(payload);
    if (q.length < 4) return n === q;
    return n === q;
  });
}

export function stripCodePayload(text: string, payloads: string[]): string {
  let next = text.replace(/\s+/g, ' ').trim();
  for (const payload of payloads) {
    const raw = payload.replace(/\s+/g, '').trim();
    if (raw.length < 6) continue;
    next = next.replace(new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
  }
  return next.replace(/\s+/g, ' ').trim();
}

export function looksLikeTrackingCode(text: string): boolean {
  const t = text.replace(/\s+/g, '');
  if (t.length < 10 || t.length > 28) return false;
  if (/https?:\/\//i.test(t)) return false;
  if (/gstin/i.test(text)) return false;
  if (/^\d{2}[A-Z]{5}\d{4}[A-Z]/i.test(t)) return false;
  if (/^\d{6}$/.test(t)) return false;
  if (/^(OD|FMPC|FMP|AWB|JT|SF|BD|EWB)\d/i.test(t)) return true;
  if (/^[A-Z]{2,6}\d{8,}$/i.test(t)) return true;
  if (/^\d{12,18}$/.test(t)) return true;
  return false;
}

export function looksLikeQrPayload(text: string): boolean {
  const t = text.trim();
  return /^https?:\/\//i.test(t) && t.length >= 12;
}

export function canBuildClonedLabel(detection: Pick<CloneDetection, 'codes' | 'lines'>): boolean {
  if (detection.codes.some((c) => c.data.trim().length > 0)) return true;
  const usable = detection.lines.filter((line) => line.text.trim().length >= 2);
  return usable.length >= 3;
}

function plausibleCodeBox(box: CloneCodeHit['box'], kind: CloneCodeHit['kind']): boolean {
  if (!box) return false;
  if (box.w < 0.02 || box.h < 0.02) return false;
  if (box.w > 0.92 && box.h > 0.92) return false;
  if (kind === 'qr' && (box.w > 0.72 || box.h > 0.72)) return false;
  return true;
}

export function enrichCodesFromOcr(
  codes: CloneCodeHit[],
  lines: CloneOcrLine[],
  imageWidth: number,
  imageHeight: number,
): CloneCodeHit[] {
  const out = codes.map((hit) => {
    const box = plausibleCodeBox(hit.box, hit.kind) ? hit.box : undefined;
    if (box) return { ...hit, box };
    return {
      ...hit,
      box: attachLineBoxToCode(lines, hit.data, imageWidth, imageHeight, hit.kind),
    };
  });
  const payloads = new Set(out.map((c) => normalizePayload(c.data)));
  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;
    const key = normalizePayload(text);
    if (payloads.has(key)) continue;
    let kind: CloneCodeHit['kind'] | null = null;
    if (looksLikeQrPayload(text)) kind = 'qr';
    else if (looksLikeTrackingCode(text)) kind = 'barcode';
    if (!kind) continue;
    payloads.add(key);
    out.push({
      kind,
      type: kind === 'qr' ? 'qr' : 'code128',
      data: text.replace(/\s+/g, ''),
      box: attachLineBoxToCode([line], text, imageWidth, imageHeight, kind),
    });
  }
  return out;
}

/** True when OCR spans nearly the full photo — typical of a framed shipping label. */
export function detectionHasOutline(detection: CloneDetection): boolean {
  const frames = detection.lines.map((line) => line.frame).filter(Boolean) as NonNullable<
    CloneOcrLine['frame']
  >[];
  if (frames.length < 4 || detection.imageWidth < 2 || detection.imageHeight < 2) return false;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of frames) {
    minX = Math.min(minX, f.left);
    minY = Math.min(minY, f.top);
    maxX = Math.max(maxX, f.left + f.width);
    maxY = Math.max(maxY, f.top + f.height);
  }
  const edge = 0.08;
  return (
    minX / detection.imageWidth <= edge &&
    minY / detection.imageHeight <= edge &&
    (detection.imageWidth - maxX) / detection.imageWidth <= edge &&
    (detection.imageHeight - maxY) / detection.imageHeight <= edge
  );
}

function qrEncodeModeForType(type: string): QrEncodeMode {
  const n = type.toLowerCase();
  if (n.includes('pdf417')) return 'PDF417';
  if (n.includes('datamatrix')) return 'DataMatrix';
  return 'QRCode';
}

function fontSizeFromHeightMm(heightMm: number): number {
  const pt = mmToPt(Math.max(1.2, heightMm)) * 0.66;
  return Math.round(Math.min(22, Math.max(5, pt)) * 2) / 2;
}

function fitFontToBox(text: string, widthMm: number, heightMm: number, wrapping: 'Close' | 'Word'): number {
  let pt = fontSizeFromHeightMm(heightMm);
  if (wrapping === 'Word') return pt;
  for (let i = 0; i < 8; i++) {
    const needed = measureTextWidthMm(text, pt);
    if (needed <= widthMm * 1.04) break;
    pt = Math.max(5, Math.round(pt * (widthMm / Math.max(0.6, needed)) * 0.98 * 2) / 2);
  }
  return pt;
}

function padQrBox(box: CloneMmBox, widthMm: number, heightMm: number): CloneMmBox {
  const detected = Math.max(box.width, box.height);
  const shortSide = Math.min(widthMm, heightMm);
  const minQr = Math.min(16, shortSide * 0.16);
  const maxQr = shortSide * 0.42;
  const size = Math.max(minQr, Math.min(maxQr, detected));
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  return clampMmBox(
    { left: cx - size / 2, top: cy - size / 2, width: size, height: size },
    widthMm,
    heightMm,
    minQr,
  );
}

function barcodePlacement(
  box: CloneMmBox,
  widthMm: number,
  heightMm: number,
): CloneMmBox & { rotation: 0 | 90 } {
  const vertical = box.height > box.width * 1.35;
  if (!vertical) {
    const minH = Math.min(8, heightMm * 0.055);
    const minW = Math.min(18, widthMm * 0.22);
    return {
      ...clampMmBox(
        {
          left: box.left,
          top: box.top,
          width: Math.max(minW, box.width),
          height: Math.max(minH, box.height),
        },
        widthMm,
        heightMm,
        minH,
      ),
      rotation: 0,
    };
  }
  const visualW = Math.max(6, box.width);
  const visualH = Math.max(18, box.height);
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  return {
    ...clampMmBox(
      {
        left: cx - visualH / 2,
        top: cy - visualW / 2,
        width: visualH,
        height: visualW,
      },
      widthMm,
      heightMm,
      6,
    ),
    rotation: 90,
  };
}

function defaultCodeBox(
  hit: CloneCodeHit,
  codes: CloneCodeHit[],
  widthMm: number,
  heightMm: number,
): CloneMmBox {
  const margin = 3;
  const portrait = heightMm >= widthMm * 0.92;
  const qrSize = Math.min(28, Math.max(16, widthMm * 0.26));
  if (hit.kind === 'qr') {
    return {
      left: widthMm - margin - qrSize,
      top: portrait ? margin + 4 : margin,
      width: qrSize,
      height: qrSize,
    };
  }
  const barcodes = codes.filter((c) => c.kind === 'barcode');
  const barcodeIndex = barcodes.findIndex((c) => c === hit);
  const hasQr = codes.some((c) => c.kind === 'qr');
  if (portrait && hasQr && barcodeIndex <= 0) {
    return {
      left: margin,
      top: margin + 8,
      width: 10,
      height: qrSize + 8,
    };
  }
  const slot = Math.max(0, barcodeIndex);
  return {
    left: margin,
    top: heightMm - 16 - slot * 16,
    width: widthMm - margin * 2,
    height: 12,
  };
}

function makeTextElement(
  text: string,
  box: CloneMmBox,
  fontSize: number,
  wrapping: 'Close' | 'Word' = 'Close',
): LabelElement {
  const vertical = box.height > box.width * 2.4 && text.replace(/\s+/g, '').length <= 18;
  return {
    ...DEFAULT_ELEMENT_STATE,
    id: generateId('txt'),
    type: 'text',
    text,
    fontSize,
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    bold: fontSize >= 10.5 || (text.length <= 18 && fontSize >= 9),
    autoWrapping: wrapping,
    autoTextHeight: false,
    verticalDisplay: vertical,
    rotation: 0,
    drawingColorIndex: 0,
  };
}

function makeBarcodeElement(hit: CloneCodeHit, box: CloneMmBox, rotation: 0 | 90): LabelElement {
  return {
    ...DEFAULT_BARCODE_STATE,
    id: generateId('bc'),
    type: 'barcode',
    content: hit.data,
    encodeMode: barcodeEncodeModeForScanType(hit.type),
    textFlag: rotation === 90 ? 'Hide' : 'Bottom',
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    rotation,
    fontSize: 7,
    drawingColorIndex: 0,
  };
}

function makeQrElement(hit: CloneCodeHit, box: CloneMmBox): LabelElement {
  return {
    ...DEFAULT_QRCODE_STATE,
    id: generateId('qr'),
    type: 'qrcode',
    content: hit.data,
    encodeMode: qrEncodeModeForType(hit.type),
    errorLevel: 'M',
    zoneSize: '0',
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    drawingColorIndex: 0,
  };
}

function makeBorderElement(widthMm: number, heightMm: number): LabelElement {
  const placement = defaultBorderPlacement(widthMm, heightMm);
  return {
    id: generateId('bd'),
    type: 'border',
    borderStyle: 'solid-medium',
    lineWidth: 0.55,
    ...placement,
    needPrinting: true,
    drawingColorIndex: 0,
  };
}

function usableOcrLines(lines: CloneOcrLine[]): CloneOcrLine[] {
  const seen = new Set<string>();
  const out: CloneOcrLine[] = [];
  for (const line of lines) {
    const text = line.text.replace(/\s+/g, ' ').trim();
    if (text.length < 2) continue;
    const key = normalizePayload(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text, frame: line.frame });
  }
  return out;
}

function mappedCodeBox(hit: CloneCodeHit, mapping: CloneMapping, codes: CloneCodeHit[]): CloneMmBox {
  if (hit.box) return mapNormBoxToMm(hit.box, mapping);
  if (hit.pxBox) return mapFrameToMm(hit.pxBox, mapping);
  return defaultCodeBox(hit, codes, mapping.widthMm, mapping.heightMm);
}

export type BuildClonedLabelOptions = {
  widthMm: number;
  heightMm: number;
  paperType?: PaperType;
  name?: string;
  /** Keep the given millimetre size instead of matching the photo aspect. */
  lockSize?: boolean;
};

/**
 * Native LabelDocument (text / barcode / QR / optional border) from a full-label scan.
 * No image layer — codes print as generated graphics.
 */
export function buildClonedLabel(
  detection: CloneDetection,
  options: BuildClonedLabelOptions,
): LabelDocument | null {
  const inferred = options.lockSize
    ? clampLabelMm(options.widthMm, options.heightMm)
    : resolveCloneStockSize(detection, options.widthMm, options.heightMm);
  const size = inferred;
  const codes = enrichCodesFromOcr(
    detection.codes.filter((c) => c.data.trim().length > 0),
    detection.lines,
    detection.imageWidth,
    detection.imageHeight,
  );
  if (!canBuildClonedLabel({ codes, lines: detection.lines })) return null;

  const mapping = createCloneMapping(
    cloneSourceRect(detection),
    size.widthMm,
    size.heightMm,
    detection.imageWidth,
    detection.imageHeight,
  );

  const payloads = codes.map((c) => c.data);
  const codeBoxesMm: CloneMmBox[] = [];
  const codeElements: LabelElement[] = [];

  codes.forEach((hit) => {
    const raw = mappedCodeBox(hit, mapping, codes);
    if (hit.kind === 'qr') {
      const placed = padQrBox(raw, size.widthMm, size.heightMm);
      codeBoxesMm.push(placed);
      codeElements.push(makeQrElement(hit, placed));
      return;
    }
    const placed = barcodePlacement(raw, size.widthMm, size.heightMm);
    codeBoxesMm.push(placed);
    codeElements.push(makeBarcodeElement(hit, placed, placed.rotation));
  });

  const textElements: LabelElement[] = [];
  const leftover: string[] = [];
  for (const line of usableOcrLines(detection.lines)) {
    if (isCodePayloadText(line.text, payloads)) continue;
    const cleaned = stripCodePayload(line.text, payloads);
    if (cleaned.length < 2) continue;
    if (!line.frame) {
      leftover.push(cleaned);
      continue;
    }
    const box = clampMmBox(mapFrameToMm(line.frame, mapping), size.widthMm, size.heightMm, 1.1);
    if (codeBoxesMm.some((codeBox) => boxOverlapRatio(box, codeBox) > 0.55)) continue;
    const wrapping: 'Close' | 'Word' = cleaned.length > 36 ? 'Word' : 'Close';
    const padded = clampMmBox(
      { ...box, width: box.width * 1.06 },
      size.widthMm,
      size.heightMm,
      1.1,
    );
    textElements.push(
      makeTextElement(cleaned, padded, fitFontToBox(cleaned, padded.width, padded.height, wrapping), wrapping),
    );
  }

  if (leftover.length > 0 && textElements.length < 2) {
    const block = leftover.join('\n');
    const qr = codeElements.find((el) => el.type === 'qrcode');
    const left = 3;
    const width = qr && qr.type === 'qrcode' ? Math.max(24, qr.left - 5) : size.widthMm - 6;
    textElements.unshift(
      makeTextElement(
        block,
        clampMmBox(
          { left, top: 4, width, height: Math.min(size.heightMm * 0.45, Math.max(12, leftover.length * 3.2)) },
          size.widthMm,
          size.heightMm,
        ),
        7.5,
        'Word',
      ),
    );
  }

  const elements: LabelElement[] = [...textElements, ...codeElements];
  if (detectionHasOutline(detection) || looksLikeWaybill({ codes, lines: detection.lines })) {
    elements.unshift(makeBorderElement(size.widthMm, size.heightMm));
  }
  if (elements.length === 0) return null;

  return createLabelDocument({
    name: options.name ?? `Cloned Label ${Math.round(size.widthMm)}×${Math.round(size.heightMm)}`,
    widthMm: size.widthMm,
    heightMm: size.heightMm,
    paperType: options.paperType ?? 'Label',
    elements,
    background: { type: 'color', color: '#FFFFFF' },
  });
}
