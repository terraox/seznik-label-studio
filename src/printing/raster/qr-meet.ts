import { generateQrMatrix } from '@/printing/renderer/qrcode';

type FillTarget = {
  fillRect: (x: number, y: number, w: number, h: number, gray: number) => void;
};

/**
 * Editor QrcodeContent: viewBox modules + preserveAspectRatio xMidYMid meet.
 * Stretch modules to fill the box (fractional cell), snap each module edge to a whole dot.
 */
export function drawQrMeet(
  target: FillTarget,
  content: string,
  errorLevel: 'L' | 'M' | 'Q' | 'H',
  quietZone: number,
  x0: number,
  y0: number,
  boxW: number,
  boxH: number,
  ink: number,
): void {
  const matrix = generateQrMatrix(content, errorLevel);
  if (!matrix) throw new Error('QR encode failed');
  const qz = Math.max(0, quietZone);
  const total = matrix.size + qz * 2;
  const available = Math.max(1, Math.min(boxW, boxH));
  const cell = available / total;
  const drawn = cell * total;
  const ox = x0 + (boxW - drawn) / 2;
  const oy = y0 + (boxH - drawn) / 2;
  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (matrix.data[r * matrix.size + c]) {
        const left = Math.round(ox + (c + qz) * cell);
        const top = Math.round(oy + (r + qz) * cell);
        const right = Math.round(ox + (c + qz + 1) * cell);
        const bottom = Math.round(oy + (r + qz + 1) * cell);
        target.fillRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top), ink);
      }
    }
  }
}

/** Ink bounds for tests — returns outer black extent inside the box. */
export function measureQrInkBounds(
  content: string,
  errorLevel: 'L' | 'M' | 'Q' | 'H',
  quietZone: number,
  boxW: number,
  boxH: number,
): { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number } {
  const gridW = Math.max(1, Math.ceil(boxW));
  const gridH = Math.max(1, Math.ceil(boxH));
  const gray = new Uint8Array(gridW * gridH);
  gray.fill(255);
  drawQrMeet(
    {
      fillRect: (x, y, w, h, v) => {
        for (let py = y; py < y + h; py++) {
          for (let px = x; px < x + w; px++) {
            if (px >= 0 && px < gridW && py >= 0 && py < gridH) gray[py * gridW + px] = v;
          }
        }
      },
    },
    content,
    errorLevel,
    quietZone,
    0,
    0,
    boxW,
    boxH,
    0,
  );
  let minX = gridW;
  let minY = gridH;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      if (gray[y * gridW + x] < 160) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
  return { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
