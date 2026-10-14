export const OCR_MAX_EDGE_PX = 2048;

export type OcrWorkingSize = {
  widthPx: number;
  heightPx: number;
  downscaled: boolean;
};

export function ocrWorkingSize(
  widthPx: number,
  heightPx: number,
  maxEdgePx = OCR_MAX_EDGE_PX,
): OcrWorkingSize {
  const w = Number.isFinite(widthPx) && widthPx > 0 ? widthPx : 1;
  const h = Number.isFinite(heightPx) && heightPx > 0 ? heightPx : 1;
  const cap = Number.isFinite(maxEdgePx) && maxEdgePx > 0 ? maxEdgePx : OCR_MAX_EDGE_PX;
  const longEdge = Math.max(w, h);
  if (longEdge <= cap) {
    return { widthPx: Math.round(w), heightPx: Math.round(h), downscaled: false };
  }
  const scale = cap / longEdge;
  return {
    widthPx: Math.max(1, Math.round(w * scale)),
    heightPx: Math.max(1, Math.round(h * scale)),
    downscaled: true,
  };
}
