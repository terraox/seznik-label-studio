import assert from 'node:assert/strict';
import test from 'node:test';

import { isLabelFileName } from '../file-name';

test('only .sezlabel and .sezlabel.zip names are label files', () => {
  for (const ok of ['a.sezlabel', 'Shelf tag.SEZLABEL', 'a.sezlabel.zip', 'My-label.Sezlabel.ZIP', ' x.sezlabel ']) assert.equal(isLabelFileName(ok), true, ok);
  for (const bad of ['a.zip', 'photos.zip', 'a.pdf', 'a.sezlabel.json', 'sezlabel', 'a.sezlabel.png', '']) assert.equal(isLabelFileName(bad), false, bad);
});
