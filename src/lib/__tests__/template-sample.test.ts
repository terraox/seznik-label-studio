import assert from 'node:assert/strict';
import test from 'node:test';

import { cleanSampleLayout, sampleVisualBox, turnSampleLayout, type SampleElement } from '@/lib/template-sample';

const text: SampleElement = { id: 't', type: 'text', left: 5, top: 4, width: 20, height: 6, text: 'Hi', fontSize: 8, bold: false, align: 'left' };

test('rotation is kept as a quarter turn and dropped when 0', () => {
  const ok = cleanSampleLayout([{ ...text, rotation: 92 }, { ...text, id: 'u', rotation: 0 }, { ...text, id: 'v', rotation: -90 }], 50, 30);
  assert.ok(ok.ok);
  if (!ok.ok) return;
  assert.equal(ok.layout[0].rotation, 90);
  assert.equal('rotation' in ok.layout[1], false);
  assert.equal(ok.layout[2].rotation, 270);
});

test('a sideways element covers its box with width and height swapped about the centre', () => {
  assert.deepEqual(sampleVisualBox({ ...text, rotation: 90 }), { left: 12, top: -3, width: 6, height: 20 });
  assert.deepEqual(sampleVisualBox(text), { left: 5, top: 4, width: 20, height: 6 });
});

test('turning clockwise moves the element where it lands on the H x W label and turns it', () => {
  // 50 x 30 label; text centre (15, 7) lands at (30 - 7, 15) = (23, 15) on the 30 x 50 label.
  const [t] = turnSampleLayout([text], 50, 30, true);
  assert.equal(t.rotation, 90);
  assert.deepEqual([t.left + t.width / 2, t.top + t.height / 2], [23, 15]);
  assert.deepEqual([t.width, t.height], [20, 6]);
  // What it covers sits inside the turned label exactly where the original sat, turned.
  assert.deepEqual(sampleVisualBox(t), { left: 20, top: 5, width: 6, height: 20 });
});

test('four turns, or a turn and its opposite, give the design back', () => {
  let l = [text];
  let w = 50;
  let h = 30;
  for (let i = 0; i < 4; i++) {
    l = turnSampleLayout(l, w, h, true);
    [w, h] = [h, w];
  }
  assert.deepEqual(l, [text]);
  const back = turnSampleLayout(turnSampleLayout([text], 50, 30, true), 30, 50, false);
  assert.deepEqual(back, [text]);
});
