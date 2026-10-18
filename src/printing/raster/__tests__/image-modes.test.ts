import assert from 'node:assert/strict';
import { test } from 'node:test';
import { binarizeGray8 } from '@/printing/raster/bitmap';
import {
  DEFAULT_IMAGE_SETTINGS,
  applyImageEffects,
  hashGray,
  normalizeImageSettings,
  packMono,
  photoRegionMask,
  quantizeGray,
  renderImageToMono,
  renderImageToMonoCached,
  renderPageToMono,
  resampleGray,
  rgbaToGrayOnWhite,
  rotateImage,
  type ImageMode,
  type ImageSettings,
} from '@/printing/raster/image-modes';

const MODES: ImageMode[] = ['solid', 'floyd', 'atkinson', 'ordered'];
const S = (mode: ImageMode, extra: Partial<ImageSettings> = {}): ImageSettings =>
  normalizeImageSettings({ mode, ...extra });

function gradient(w: number, h: number): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = Math.round((x / (w - 1)) * 255);
  return g;
}

function noisy(w: number, h: number): Uint8Array {
  const g = new Uint8Array(w * h);
  let s = 12345;
  for (let i = 0; i < g.length; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    g[i] = (s >>> 16) & 255;
  }
  return g;
}

test('every mode is deterministic', () => {
  const g = noisy(61, 37);
  for (const mode of MODES) {
    const a = quantizeGray(g, 61, 37, S(mode));
    const b = quantizeGray(g, 61, 37, S(mode));
    assert.equal(hashGray(a), hashGray(b), mode);
    assert.ok(a.every((v) => v === 0 || v === 255), `${mode} output is pure 0/255`);
  }
});

test('solid at the default threshold matches the old binarizer byte for byte', () => {
  const g = noisy(80, 50);
  const old = binarizeGray8({ width: 80, height: 50, gray: g }, DEFAULT_IMAGE_SETTINGS.threshold).gray;
  assert.deepEqual(quantizeGray(g, 80, 50, S('solid')), old);
  for (const t of [1, 64, 160, 200, 254]) {
    assert.deepEqual(
      quantizeGray(g, 80, 50, S('solid', { threshold: t })),
      binarizeGray8({ width: 80, height: 50, gray: g }, t).gray,
      `threshold ${t}`,
    );
  }
});

test('pure black and white input passes through every mode unchanged', () => {
  const w = 40;
  const h = 24;
  const g = new Uint8Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = (i * 7 + (i >> 3)) % 5 < 2 ? 0 : 255;
  for (const mode of MODES) {
    assert.deepEqual(quantizeGray(g, w, h, S(mode, { threshold: 128 })), g, mode);
  }
});

test('dither modes keep average tone', () => {
  const g = new Uint8Array(64 * 64).fill(128);
  for (const mode of ['floyd', 'atkinson', 'ordered'] as ImageMode[]) {
    const out = quantizeGray(g, 64, 64, S(mode));
    const ink = out.reduce((n, v) => n + (v === 0 ? 1 : 0), 0) / out.length;
    assert.ok(ink > 0.35 && ink < 0.65, `${mode} ink ${ink}`);
  }
  const white = new Uint8Array(64 * 64).fill(255);
  const black = new Uint8Array(64 * 64).fill(0);
  for (const mode of MODES) {
    assert.ok(quantizeGray(white, 64, 64, S(mode)).every((v) => v === 255), `${mode} white`);
    assert.ok(quantizeGray(black, 64, 64, S(mode)).every((v) => v === 0), `${mode} black`);
  }
});

test('ordered 8x8 repeats every 8 dots', () => {
  const g = new Uint8Array(32 * 32).fill(100);
  const out = quantizeGray(g, 32, 32, S('ordered'));
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) assert.equal(out[y * 32 + x], out[(y + 8) * 32 + x + 8]);
});

test('effects: defaults return the same array, others change it', () => {
  const g = gradient(32, 4);
  assert.equal(applyImageEffects(g, S('solid')), g);
  assert.notDeepEqual(applyImageEffects(g, S('solid', { brightness: 30 })), g);
  const inv = applyImageEffects(g, S('solid', { invert: true }));
  assert.equal(inv[0], 255);
  assert.equal(inv[31], 0);
  const bright = applyImageEffects(new Uint8Array([100]), S('solid', { brightness: 20 }));
  assert.ok(bright[0] > 100);
  const dark = applyImageEffects(new Uint8Array([100]), S('solid', { brightness: -20 }));
  assert.ok(dark[0] < 100);
  const hi = applyImageEffects(new Uint8Array([200, 60]), S('solid', { contrast: 50 }));
  assert.ok(hi[0] > 200 && hi[1] < 60);
});

test('normalizeImageSettings: missing fields mean today', () => {
  assert.deepEqual(normalizeImageSettings(undefined), DEFAULT_IMAGE_SETTINGS);
  assert.deepEqual(normalizeImageSettings({}), DEFAULT_IMAGE_SETTINGS);
  assert.equal(normalizeImageSettings({ threshold: 999 }).threshold, 254);
  assert.equal(normalizeImageSettings({ mode: 'bogus' as ImageMode }).mode, 'solid');
});

test('transparency flattens onto white', () => {
  const rgba = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 128]);
  const g = rgbaToGrayOnWhite(rgba, 3, 1);
  assert.equal(g[0], 255);
  assert.equal(g[1], 0);
  assert.ok(g[2] > 120 && g[2] < 135);
});

test('resample: same size is untouched, shrink averages', () => {
  const g = gradient(10, 10);
  assert.equal(resampleGray(g, 10, 10, 10, 10), g);
  const flat = new Uint8Array(8 * 8).fill(90);
  assert.ok(resampleGray(flat, 8, 8, 3, 5).every((v) => v === 90));
});

test('rotation by 90 is an exact permutation; 0 is identity', () => {
  const w = 5;
  const h = 3;
  const g = noisy(w, h);
  const same = rotateImage({ gray: g, width: w, height: h, rotationDeg: 0, flipH: false, flipV: false });
  assert.deepEqual(same.gray, g);
  const r = rotateImage({ gray: g, width: w, height: h, rotationDeg: 90, flipH: false, flipV: false });
  assert.equal(r.width, h);
  assert.equal(r.height, w);
  assert.equal(r.mask, null);
  const back = rotateImage({ gray: r.gray, width: r.width, height: r.height, rotationDeg: 270, flipH: false, flipV: false });
  assert.deepEqual(back.gray, g);
  const r180 = rotateImage({ gray: g, width: w, height: h, rotationDeg: 180, flipH: false, flipV: false });
  assert.equal(r180.gray[0], g[w * h - 1]);
});

test('arbitrary rotation grows the box and masks the corners', () => {
  const g = new Uint8Array(20 * 10).fill(0);
  const r = rotateImage({ gray: g, width: 20, height: 10, rotationDeg: 30, flipH: false, flipV: false });
  assert.ok(r.width > 20 && r.height > 10);
  assert.ok(r.mask);
  assert.equal(r.mask![0], 0);
  const out = quantizeGray(r.gray, r.width, r.height, S('floyd'), r.mask);
  assert.equal(out[0], 255);
});

test('pipeline: scales once, same input same bytes, cached result is reused', () => {
  const g = noisy(33, 21);
  const input = { gray: g, width: 33, height: 21, destWidth: 48, destHeight: 30, settings: S('floyd') };
  const a = renderImageToMono(input);
  const b = renderImageToMono(input);
  assert.equal(a.width, 48);
  assert.equal(a.height, 30);
  assert.deepEqual(a.gray, b.gray);
  const c1 = renderImageToMonoCached('k', input);
  const c2 = renderImageToMonoCached('k', input);
  assert.equal(c1, c2);
  const c3 = renderImageToMonoCached('k', { ...input, settings: S('atkinson') });
  assert.notEqual(c1, c3);
});

test('pipeline at 1:1 with solid default leaves a 1-bit image as it is', () => {
  const w = 24;
  const h = 16;
  const g = new Uint8Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = (i % 3) === 0 ? 0 : 255;
  for (const mode of MODES) {
    const out = renderImageToMono({ gray: g, width: w, height: h, destWidth: w, destHeight: h, settings: S(mode) });
    assert.deepEqual(out.gray, g, mode);
  }
});

test('packMono: MSB first, set bit = ink', () => {
  const gray = new Uint8Array(10).fill(255);
  gray[0] = 0;
  gray[9] = 0;
  const { bytesPerRow, bytes } = packMono({ width: 10, height: 1, gray });
  assert.equal(bytesPerRow, 2);
  assert.equal(bytes[0], 0x80);
  assert.equal(bytes[1], 0x40);
});

test('photo mask: text-like pages have none, a photo block is found', () => {
  const w = 96;
  const h = 96;
  const text = new Uint8Array(w * h).fill(255);
  for (let y = 10; y < 90; y += 6) for (let x = 8; x < 88; x++) if ((x + y) % 5 < 3) text[y * w + x] = 0;
  assert.equal(photoRegionMask(text, w, h), null);
  const page = new Uint8Array(w * h).fill(255);
  for (let y = 32; y < 80; y++) for (let x = 32; x < 80; x++) page[y * w + x] = 60 + ((x * 3 + y * 5) % 120);
  const mask = photoRegionMask(page, w, h)!;
  assert.ok(mask);
  assert.equal(mask[50 * w + 50], 1);
  assert.equal(mask[2 * w + 2], 0);
});

test('page render: text stays crisp, only the photo is dithered', () => {
  const w = 96;
  const h = 96;
  const page = new Uint8Array(w * h).fill(255);
  for (let y = 4; y < 20; y++) for (let x = 4; x < 90; x++) page[y * w + x] = y % 3 === 0 ? 0 : 255;
  for (let y = 40; y < 90; y++) for (let x = 40; x < 90; x++) page[y * w + x] = 100 + ((x + y) % 60);
  const mask = photoRegionMask(page, w, h);
  const dith = renderPageToMono(page, w, h, S('floyd'), mask);
  const solid = renderPageToMono(page, w, h, S('solid'), null);
  for (let y = 0; y < 30; y++) for (let x = 0; x < w; x++) assert.equal(dith[y * w + x], solid[y * w + x]);
  let diff = 0;
  for (let y = 40; y < 90; y++) for (let x = 40; x < 90; x++) if (dith[y * w + x] !== solid[y * w + x]) diff++;
  assert.ok(diff > 100);
});
