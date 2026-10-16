import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyAmazonUrl, openAmazonUrl } from '@/lib/shop/amazon-url';

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
