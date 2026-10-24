import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ClipartGrid,
  clipartTileWidth,
  DataFileGrid,
  dataFileTileWidth,
  editorFallbackViewportPx,
  ocrPreviewSize,
  pdfModalPreviewSize,
  printPreviewBounds,
  scanFrameSize,
  scanTopMaskHeight,
  ShopGrid,
  shopCardWidth,
  templateLayout,
} from '../screen-sizes';

/** Narrowest to widest phones the app supports (dp, portrait). */
const PHONES = [
  { w: 320, h: 568 },
  { w: 360, h: 640 },
  { w: 393, h: 852 },
  { w: 412, h: 915 },
  { w: 430, h: 932 },
] as const;

/** Smallest tappable size (Material / Apple HIG ≈ 44–48 dp). */
const MIN_TAP = 48;

/**
 * Values pinned on 2026-10-23, before the responsiveness work. Phones that look right today must
 * keep them exactly; change a row only on purpose.
 */
const PINNED = {
  320: { shop: 138, clipart: 69, dataFile: 92, templateCard: 196, card: 272, preview: 239, pdf: [256, 154], editor: 352.16, ocr: 198, scan: [230, 129] },
  360: { shop: 158, clipart: 82, dataFile: 105, templateCard: 236, card: 312, preview: 269, pdf: [296, 178], editor: 396.8, ocr: 223, scan: [259, 150.5] },
  393: { shop: 174.5, clipart: 93, dataFile: 116, templateCard: 269, card: 345, preview: 358, pdf: [320, 192], editor: 528.24, ocr: 244, scan: [280, 246] },
  412: { shop: 184, clipart: 100, dataFile: 122, templateCard: 288, card: 364, preview: 384, pdf: [320, 192], editor: 567.3, ocr: 255, scan: [280, 277.5] },
  430: { shop: 193, clipart: 106, dataFile: 128, templateCard: 306, card: 382, preview: 391, pdf: [320, 192], editor: 577.84, ocr: 260, scan: [280, 286] },
} as const;

test('sizes match the pinned values on every phone', () => {
  for (const { w, h } of PHONES) {
    const p = PINNED[w];
    const pdf = pdfModalPreviewSize(w, h, { widthMm: 50, heightMm: 30 });
    const actual = {
      shop: shopCardWidth(w),
      clipart: clipartTileWidth(w),
      dataFile: dataFileTileWidth(w),
      templateCard: templateLayout(w).cardMaxWidth,
      card: printPreviewBounds(w, h).baseCardWidth,
      preview: printPreviewBounds(w, h).maxPreviewHeight,
      pdf: [pdf.width, pdf.height],
      editor: editorFallbackViewportPx(h),
      ocr: ocrPreviewSize(w),
      // 24 dp status bar.
      scan: [scanFrameSize(w), scanTopMaskHeight(h, scanFrameSize(w), 24)],
    };
    assert.deepEqual(actual, p, `${w}×${h}`);
  }
});

test('grids fit the screen and tiles stay tappable', () => {
  for (const { w } of PHONES) {
    const shop = shopCardWidth(w);
    assert.ok(shop * 2 + ShopGrid.gap + ShopGrid.pad * 2 <= w, `shop ${w}`);
    assert.ok(shop >= MIN_TAP, `shop card ${shop} at ${w}`);

    const { columns, gap, pad, railWidth } = ClipartGrid;
    const clip = clipartTileWidth(w);
    assert.ok(railWidth + pad * 2 + clip * columns + gap * (columns - 1) <= w, `clipart ${w}`);
    assert.ok(clip >= MIN_TAP, `clipart tile ${clip} at ${w}`);

    const data = dataFileTileWidth(w);
    const g = DataFileGrid;
    assert.ok(g.pad * 2 + data * g.columns + g.gap * (g.columns - 1) <= w, `data file ${w}`);
    assert.ok(data >= MIN_TAP, `data file tile ${data} at ${w}`);

    const { layoutWidth, cardMaxWidth } = templateLayout(w);
    assert.ok(layoutWidth <= w && cardMaxWidth > 0 && cardMaxWidth <= layoutWidth, `template ${w}`);
  }
});

test('previews fit inside the window', () => {
  for (const { w, h } of PHONES) {
    const { baseCardWidth, maxPreviewHeight } = printPreviewBounds(w, h);
    assert.ok(baseCardWidth > 0 && baseCardWidth <= w, `print card ${w}`);
    assert.ok(maxPreviewHeight > 0 && maxPreviewHeight < h / 2, `print preview ${h}`);

    for (const page of [{ widthMm: 50, heightMm: 30 }, { widthMm: 100, heightMm: 150 }, { widthMm: 10, heightMm: 1000 }, null]) {
      const pdf = pdfModalPreviewSize(w, h, page);
      assert.ok(pdf.width > 0 && pdf.width <= w - 64, `pdf width ${w}`);
      assert.ok(pdf.height > 0 && pdf.height <= Math.max(220, h * 0.36 + 1), `pdf height ${h}`);
    }
  }
});

test('camera and OCR squares fit the width with room to spare', () => {
  for (const { w, h } of PHONES) {
    assert.ok(ocrPreviewSize(w) <= w - 32, `ocr ${w}`);
    const frame = scanFrameSize(w);
    assert.ok(frame <= w - 2 * 32, `scan frame ${w}`);
    assert.ok(scanTopMaskHeight(h, frame, 24) + frame < h, `scan mask ${h}`);
  }
});

test('editor fallback viewport never collapses on short screens', () => {
  assert.equal(editorFallbackViewportPx(400), 560 * 0.62);
  for (const { h } of PHONES) assert.ok(editorFallbackViewportPx(h) < h, `editor ${h}`);
});

/** The app rotates: every phone turned sideways, plus tablets both ways (dp). */
const ROTATED = [
  ...PHONES.map(({ w, h }) => ({ w: h, h: w })),
  { w: 800, h: 1280 },
  { w: 1280, h: 800 },
  { w: 1024, h: 1366 },
  { w: 1366, h: 1024 },
];

test('landscape and tablets: grids, previews and the camera fit', () => {
  for (const { w, h } of ROTATED) {
    const shop = shopCardWidth(w);
    assert.ok(shop * 2 + ShopGrid.gap + ShopGrid.pad * 2 <= w && shop >= MIN_TAP, `shop ${w}×${h}`);
    assert.ok(clipartTileWidth(w) >= MIN_TAP, `clipart ${w}×${h}`);
    assert.ok(dataFileTileWidth(w) >= MIN_TAP, `data file ${w}×${h}`);
    const { layoutWidth, cardMaxWidth } = templateLayout(w);
    assert.ok(layoutWidth <= w && cardMaxWidth > 0 && cardMaxWidth <= layoutWidth, `template ${w}×${h}`);

    const { baseCardWidth, maxPreviewHeight } = printPreviewBounds(w, h);
    assert.ok(baseCardWidth > 0 && baseCardWidth <= w && maxPreviewHeight < h / 2, `print ${w}×${h}`);
    const pdf = pdfModalPreviewSize(w, h, { widthMm: 100, heightMm: 150 });
    assert.ok(pdf.width <= w - 64 && pdf.height <= h * 0.36 + 1, `pdf ${w}×${h}`);

    assert.ok(ocrPreviewSize(w) <= Math.min(w - 32, h), `ocr ${w}×${h}`);
    const frame = scanFrameSize(w, h);
    // No status bar inset in landscape on most phones; 24 covers the rest.
    assert.ok(scanTopMaskHeight(h, frame, 24) + frame < h - 60, `scan ${w}×${h}: frame ${frame}`);
    assert.ok(editorFallbackViewportPx(h) < h, `editor ${w}×${h}`);
  }
});

test('portrait phones keep the same scan frame when the height is passed', () => {
  for (const { w, h } of PHONES) assert.equal(scanFrameSize(w, h), scanFrameSize(w), `${w}×${h}`);
});
