import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePlatformId } from '@/lib/ecommerce-label/platforms';
import { WIDGET_LINKS, WIDGET_SCHEME } from '@/widgets/deep-links';

test('widget links use the app scheme', () => {
  for (const uri of Object.values(WIDGET_LINKS)) {
    assert.ok(uri.startsWith(`${WIDGET_SCHEME}://`));
  }
});

test('shipping platform links encode a parseable platform id', () => {
  assert.equal(parsePlatformId('amazon'), 'amazon');
  assert.equal(parsePlatformId('flipkart'), 'flipkart');
  assert.equal(parsePlatformId('meesho'), 'meesho');
  assert.equal(parsePlatformId('ebay'), null);

  assert.match(WIDGET_LINKS.amazon, /platform=amazon$/);
  assert.match(WIDGET_LINKS.flipkart, /platform=flipkart$/);
  assert.match(WIDGET_LINKS.meesho, /platform=meesho$/);
});

test('feature shortcuts point at known routes', () => {
  assert.equal(WIDGET_LINKS.newLabel, 'sezprint://new-label');
  assert.equal(WIDGET_LINKS.pdf, 'sezprint://pdf');
  assert.equal(WIDGET_LINKS.shipping, 'sezprint://ecommerce-label');
  assert.equal(WIDGET_LINKS.excel, 'sezprint://excel-print');
  assert.equal(WIDGET_LINKS.serial, 'sezprint://new-label-setup?serialEditor=1');
});
