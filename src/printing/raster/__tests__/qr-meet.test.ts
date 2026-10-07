import assert from 'node:assert/strict';
import { measureQrInkBounds } from '../qr-meet';

// 20 mm @ 203 dpi → 160 dots (typical QR box)
const BOX = 160;
const content = 'https://example.com';

const bounds = measureQrInkBounds(content, 'M', 0, BOX, BOX);

// Meet scaling should fill the box — outer quiet zone within 1 dot of edges (rounding).
assert.ok(bounds.width >= BOX - 2, `QR width ${bounds.width} should fill ${BOX} dots (was floor-shrunk)`);
assert.ok(bounds.height >= BOX - 2, `QR height ${bounds.height} should fill ${BOX} dots`);
assert.equal(bounds.minX, 0, 'QR should start at left edge of box');
assert.equal(bounds.minY, 0, 'QR should start at top edge of box');
assert.ok(bounds.maxX >= BOX - 2, 'QR should reach right edge of box');
assert.ok(bounds.maxY >= BOX - 2, 'QR should reach bottom edge of box');

console.log('ok qr-meet fills box');
