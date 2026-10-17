import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyAmazonUrl, openAmazonUrl, openProductUrl } from '@/lib/shop/amazon-url';

test('product dp URLs stay amazon.in and are openable', () => {
  const url = 'https://www.amazon.in/dp/B0GT9ZZFCC';
  const classified = classifyAmazonUrl(url);
  assert.equal(classified.kind, 'product');
  assert.equal(classified.asin, 'B0GT9ZZFCC');
  assert.equal(classified.openable, true);
  assert.equal(classified.url, url);
});

test('amzn.in short links are allowed and not rewritten', () => {
  const url = 'https://amzn.in/d/00Yi9C8X';
  const classified = classifyAmazonUrl(url);
  assert.equal(classified.kind, 'short_link');
  assert.equal(classified.openable, true);
  assert.equal(classified.url, url);
});

test('link.amazon is flagged unusual but still openable without rewriting', () => {
  const url = 'https://link.amazon/B04nK2SFU';
  const classified = classifyAmazonUrl(url);
  assert.equal(classified.kind, 'unusual_domain');
  assert.equal(classified.openable, true);
  assert.equal(classified.url, url);
});

test('openAmazonUrl sends the exact source URL and never a search page', async () => {
  const source = 'https://amzn.in/d/09ilynRs';
  const opened: string[] = [];
  const result = await openAmazonUrl(source, async (url) => {
    opened.push(url);
    return true;
  });
  assert.equal(result.ok, true);
  assert.equal(result.openedUrl, source);
  assert.equal(opened.length, 1);
  assert.equal(opened[0], source);
  assert.equal(opened[0]?.includes('/s?'), false);
  assert.equal(opened[0]?.includes('s?k='), false);
});

test('invalid URLs are not opened and not replaced with a search URL', async () => {
  const opened: string[] = [];
  const result = await openAmazonUrl('not-a-url', async (url) => {
    opened.push(url);
    return true;
  });
  assert.equal(result.ok, false);
  assert.equal(result.openedUrl, null);
  assert.deepEqual(opened, []);
});

test('openProductUrl keeps exact Amazon dp URLs including ref=sr tracking', async () => {
  const source =
    'https://www.amazon.in/SEZNIK-Bluetooth-Commerce-Jewellery-SellerFlex/dp/B0GZ9XFWZX/ref=sr_1_4?nsdOptOutParam=true&s=kitchen&sr=1-4';
  const opened: string[] = [];
  const result = await openProductUrl(
    { amazonUrl: source, storeUrl: 'https://www.seznik.in/products/seznik-tejas-shipping-label-printer-304-dpi-hd-print-usb-bluetooth-direct-thermal-label-printer-for-e-commerce-mrp-sticker-jewellery-excel-barcode-1-year-warranty-no-sellerflex' },
    async (url) => {
      opened.push(url);
      return true;
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.openedUrl, source);
  assert.deepEqual(opened, [source]);
  assert.equal(opened[0]?.includes('/s?'), false);
  assert.equal(opened[0]?.includes('s?k='), false);
});

test('openProductUrl falls back to store URL when Amazon is not openable', async () => {
  const store = 'https://www.seznik.in/products/seznik-josh-label-printer';
  const opened: string[] = [];
  const result = await openProductUrl(
    { amazonUrl: 'not-a-url', storeUrl: store },
    async (url) => {
      opened.push(url);
      return true;
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.openedUrl, store);
  assert.deepEqual(opened, [store]);
});
