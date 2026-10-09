import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

import { clusterToTwemojiId, clusterToTwemojiLookupIds } from '@/lib/emoji/twemoji-id';

const horns = String.fromCodePoint(0x1f608);
const thumbMedium = String.fromCodePoint(0x1f44d, 0x1f3fd);
const family = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);

test('clusterToTwemojiId strips variation selectors and keeps ZWJ and skin tone', () => {
  assert.equal(clusterToTwemojiId(horns), '1f608');
  assert.equal(clusterToTwemojiId(`${horns}\uFE0F`), '1f608');
  assert.equal(clusterToTwemojiId(thumbMedium), '1f44d-1f3fd');
  assert.equal(clusterToTwemojiId(family), '1f468-200d-1f469-200d-1f467');
});

test('clusterToTwemojiLookupIds falls back without skin tone', () => {
  assert.deepEqual(clusterToTwemojiLookupIds(thumbMedium), ['1f44d-1f3fd', '1f44d']);
  assert.deepEqual(clusterToTwemojiLookupIds(horns), ['1f608']);
});

test('generated Twemoji pngs exist for horns, skin tone, and family', () => {
  for (const id of ['1f608', '1f44d-1f3fd', '1f468-200d-1f469-200d-1f467']) {
    assert.equal(existsSync(new URL(`../../../../assets/twemoji/${id}.png`, import.meta.url)), true, id);
  }
});
