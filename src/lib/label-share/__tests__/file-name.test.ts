import assert from 'node:assert/strict';
import test from 'node:test';

import { isLabelFileName } from '../file-name';

test('.seznik names (and older .sezlabel ones) are label files', () => {
  for (const ok of ['a.seznik', 'Shelf tag.SEZNIK', 'a.seznik.zip', 'My-label.Seznik.ZIP', ' x.seznik ', 'old.sezlabel', 'old.sezlabel.zip']) assert.equal(isLabelFileName(ok), true, ok);
  for (const bad of ['a.zip', 'photos.zip', 'a.pdf', 'a.sezlabel.json', 'a.seznik.json', 'seznik', 'a.seznik.png', '']) assert.equal(isLabelFileName(bad), false, bad);
});
