import { sampleTextHeightMm, type SampleElement } from './template-sample';

/**
 * Starter content for catalogue templates, picked by the template's shape. Pure data: the admin seed
 * script stores it in the database, and the app uses it for any template that has no sample yet.
 */
type Panel = { x: number; y: number; w: number; h: number; round?: boolean };
let n = 0;
const text = (left: number, top: number, width: number, t: string, fontSize: number, extra: Partial<SampleElement> = {}): SampleElement => ({
  id: `s${(n += 1)}`, type: 'text', left: r(left), top: r(top), width: r(width), height: sampleTextHeightMm(fontSize, t.split('\n').length), text: t, fontSize, ...extra,
});
const barcode = (left: number, top: number, width: number, height: number, content = '8901234567890'): SampleElement => ({ id: `s${(n += 1)}`, type: 'barcode', left: r(left), top: r(top), width: r(width), height: r(height), text: content });
const qr = (left: number, top: number, size: number): SampleElement => ({ id: `s${(n += 1)}`, type: 'qrcode', left: r(left), top: r(top), width: r(size), height: r(size), text: 'https://seznik.in' });
const rule = (left: number, top: number, width: number): SampleElement => ({ id: `s${(n += 1)}`, type: 'line', left: r(left), top: r(top), width: r(width), height: 0.4 });
function r(v: number) { return Math.round(v * 100) / 100; }

/** Height of a text line at the given size, used to stack lines. */
const lh = (size: number, lines = 1) => sampleTextHeightMm(size, lines);
const centred = { align: 'center' as const };

/** One tiny round seal (about 12 mm across): a brand mark and a number. */
function tinySeal({ x, y, w, h }: Panel): SampleElement[] {
  const d = Math.min(w, h);
  return [
    text(x + d * 0.15, y + d * 0.28, d * 0.7, 'SEZ', d * 0.3, { bold: true, ...centred }),
    text(x + d * 0.15, y + d * 0.28 + lh(d * 0.3) + 0.2, d * 0.7, 'No.01', d * 0.2, centred),
  ];
}

/** Jar / pack seal for a 25 mm round sticker. */
function packSeal({ x, y, w, h }: Panel): SampleElement[] {
  const d = Math.min(w, h);
  const inner = d * 0.7;
  const left = x + (w - inner) / 2;
  return [
    text(left, y + d * 0.24, inner, 'HAND', d * 0.2, { bold: true, ...centred }),
    text(left, y + d * 0.24 + lh(d * 0.2), inner, 'MADE', d * 0.2, { bold: true, ...centred }),
    rule(left + inner * 0.2, y + d * 0.58, inner * 0.6),
    text(left, y + d * 0.64, inner, 'SEZNIK', d * 0.13, centred),
  ];
}

/** Offer sticker for a 40 mm round label. */
function offerSeal({ x, y, w, h }: Panel): SampleElement[] {
  const d = Math.min(w, h);
  const inner = d * 0.74;
  const left = x + (w - inner) / 2;
  return [
    text(left, y + d * 0.22, inner, '20% OFF', d * 0.19, { bold: true, ...centred }),
    rule(left + inner * 0.15, y + d * 0.46, inner * 0.7),
    text(left, y + d * 0.52, inner, 'Today only', d * 0.12, centred),
    text(left, y + d * 0.68, inner, 'Use code SEZ20', d * 0.09, centred),
  ];
}

/** Brand sticker for a 50 mm round label. */
function brandSeal({ x, y, w, h }: Panel): SampleElement[] {
  const d = Math.min(w, h);
  const inner = d * 0.7;
  const left = x + (w - inner) / 2;
  return [
    text(left, y + d * 0.2, inner, 'SEZNIK', d * 0.16, { bold: true, ...centred }),
    text(left, y + d * 0.2 + lh(d * 0.16) + 0.4, inner, 'Made with care', d * 0.085, centred),
    qr(x + (w - d * 0.3) / 2, y + d * 0.5, d * 0.3),
    text(left, y + d * 0.84, inner, 'seznik.in', d * 0.075, centred),
  ];
}

/** Scan-to-order tag for a 25 mm square. */
function scanTag({ x, y, w, h }: Panel): SampleElement[] {
  const m = Math.max(1, Math.min(w, h) * 0.08);
  const q = Math.min(w, h) - m * 2 - 4.5;
  return [
    qr(x + (w - q) / 2, y + m, q),
    text(x + m, y + m + q + 0.8, w - m * 2, 'SCAN TO ORDER', Math.min(w, h) * 0.2, { bold: true, ...centred }),
  ];
}

/** 40 x 15 mm shelf price tag: item, weight and price. */
function shelfPrice({ x, y, w, h }: Panel): SampleElement[] {
  const m = 1.5;
  return [
    text(x + m, y + m, w * 0.55, 'Basmati Rice', 7, { bold: true }),
    text(x + m, y + m + lh(7) + 0.4, w * 0.55, '1 kg pack', 5.5),
    text(x + w * 0.52, y + h * 0.2, w * 0.45 - m, 'Rs 120', 12, { bold: true, align: 'right' }),
  ];
}

/** 50 x 15 mm barcode strip: barcode with the SKU under it. */
function barcodeStrip({ x, y, w, h }: Panel): SampleElement[] {
  const m = 2.5;
  return [barcode(x + m, y + 1.2, w - m * 2, h - 2.4, '8901234567890')];
}

/** 50 x 25 mm product price label: name, MRP and barcode. */
function productPrice({ x, y, w, h }: Panel): SampleElement[] {
  const m = 2;
  return [
    text(x + m, y + 1.6, w * 0.6, 'Cotton Kurta', 8.5, { bold: true }),
    text(x + m, y + 1.6 + lh(8.5) + 0.2, w * 0.6, 'Size M  |  Navy', 6),
    text(x + w * 0.55, y + 1.6, w * 0.45 - m, 'Rs 899', 12, { bold: true, align: 'right' }),
    barcode(x + m, y + 10.6, w - m * 2, h - 10.6 - 1.4, '8901234567890'),
  ];
}

/** 50 x 30 mm packaged food label: name, weight, dates, price. */
function foodPack({ x, y, w, h }: Panel): SampleElement[] {
  const m = 2.5;
  return [
    text(x + m, y + m, w - m * 2, 'Homemade Mango Pickle', 8, { bold: true }),
    rule(x + m, y + m + lh(8) + 0.6, w - m * 2),
    text(x + m, y + h * 0.4, w * 0.55, 'Net wt 250 g', 6.5),
    text(x + m, y + h * 0.4 + lh(6.5) + 0.3, w * 0.55, 'MFG 12/10/26', 6),
    text(x + m, y + h * 0.4 + (lh(6.5) + 0.3) * 2, w * 0.55, 'BEST BEFORE 6 MONTHS', 4.8),
    text(x + w * 0.55, y + h * 0.42, w * 0.45 - m, 'Rs 180', 11, { bold: true, align: 'right' }),
  ];
}

/** 50 x 50 mm asset tag: QR with owner and ID. */
function assetTag({ x, y, w, h }: Panel): SampleElement[] {
  const m = 3;
  const q = h * 0.5;
  return [
    text(x + m, y + m, w - m * 2, 'PROPERTY OF SEZNIK', 8, { bold: true, ...centred }),
    qr(x + (w - q) / 2, y + m + lh(8) + 1.2, q),
    text(x + m, y + h - m - lh(10) - lh(6.5), w - m * 2, 'AST-00417', 10, { bold: true, ...centred }),
    text(x + m, y + h - m - lh(6.5), w - m * 2, 'Laptop  |  IT Dept', 6.5, centred),
  ];
}

/** 50 x 75 mm shipping label: from, to, order and barcode. */
function shippingLabel({ x, y, w, h }: Panel): SampleElement[] {
  const m = 3;
  const iw = w - m * 2;
  return [
    text(x + m, y + m, iw, 'FROM', 6, { bold: true }),
    text(x + m, y + m + lh(6), iw, 'Seznik Labels, Pune', 7),
    rule(x + m, y + h * 0.2, iw),
    text(x + m, y + h * 0.23, iw, 'SHIP TO', 6, { bold: true }),
    text(x + m, y + h * 0.23 + lh(6), iw, 'Riya Sharma', 10, { bold: true }),
    text(x + m, y + h * 0.23 + lh(6) + lh(10) + 0.3, iw, '14 MG Road, Indiranagar\nBengaluru 560038\nPh 98450 12345', 7),
    rule(x + m, y + h * 0.6, iw),
    text(x + m, y + h * 0.63, iw, 'Order #SZ-20418  |  COD Rs 899', 6.5),
    barcode(x + m, y + h * 0.7, iw, h * 0.2),
  ];
}

/** Cable flag: ID, rack and port on the printable block, with a QR for the cable record. */
function cableFlag({ x, y, w, h }: Panel): SampleElement[] {
  const m = 1.2;
  const iw = w - m * 2;
  const q = Math.min(iw, 13);
  return [
    text(x + m, y + m, iw, 'LAN-24', 11, { bold: true, ...centred }),
    rule(x + m, y + m + lh(11) + 0.6, iw),
    text(x + m, y + m + lh(11) + 1.6, iw, 'RACK A3', 7.5, { bold: true, ...centred }),
    text(x + m, y + m + lh(11) + 1.6 + lh(7.5), iw, 'Port 24 > SW-01', 5.5, centred),
    qr(x + (w - q) / 2, y + h - m - q, q),
  ];
}

/** Sample content for one label panel, picked by its size and shape (use case); mm on the whole sheet. */
function panelSample(p: Panel): SampleElement[] {
  const { w, h, round } = p;
  if (round) {
    const d = Math.min(w, h);
    if (d <= 14) return tinySeal(p);
    if (d <= 28) return packSeal(p);
    if (d <= 42) return offerSeal(p);
    return brandSeal(p);
  }
  if (h <= 16) return w >= 45 ? barcodeStrip(p) : shelfPrice(p);
  if (h <= 26) return w <= 26 ? scanTag(p) : productPrice(p);
  if (h <= 32) return foodPack(p);
  if (h <= 60) return assetTag(p);
  return shippingLabel(p);
}

/** Starter content for a template, or null to leave it to the app's built-in layout (jewellery). */
export function starterSample(name: string, w: number, h: number): SampleElement[] | null {
  n = 0;
  if (/jewel/i.test(name)) return null;
  if (/cable/i.test(name)) {
    // Two flags 25 mm wide; the printable area is the wide block below the 30 mm fold.
    return [0.5, 27.4].flatMap((x) => cableFlag({ x: x + 0.7, y: 31, w: 22.6, h: 42 }));
  }
  const round = /circle/i.test(name);
  if (/2up|two up/i.test(name)) {
    const pw = w / 2;
    return [0, pw].flatMap((x) => panelSample({ x, y: 0, w: pw, h, round }));
  }
  return panelSample({ x: 0, y: 0, w, h, round });
}
