import assert from 'node:assert/strict';
import test from 'node:test';

import {
  confirmLabel,
  confirmedCount,
  designHash,
  expandSerialBatch,
  markCancelled,
  markFailed,
  newCursor,
  resumeInfo,
  serialPhysicalTotal,
  serialPrintLogLine,
} from '@/lib/serial/job';
import { nonSerialFixture } from './regression-fixture';

test('batch expansion: uncollated sends all copies of a label together', () => {
  const items = expandSerialBatch({ count: 3, copies: 2 });
  assert.deepEqual(items.map((i) => [i.labelIndex, i.serialIndex, i.copies]), [[0, 0, 2], [1, 1, 2], [2, 2, 2]]);
  assert.equal(serialPhysicalTotal(3, 2), 6);
});

test('batch expansion: collated sends the whole set once per round', () => {
  const items = expandSerialBatch({ count: 2, copies: 3, collate: true });
  assert.deepEqual(items.map((i) => `${i.labelIndex}/${i.round}`), ['0/1', '1/1', '0/2', '1/2', '0/3', '1/3']);
  assert.ok(items.every((i) => i.copies === 1));
});

test('batch expansion: offset is added to the serial index, startAt skips printed labels', () => {
  const items = expandSerialBatch({ count: 5, offset: 100, startAt: 3 });
  assert.deepEqual(items.map((i) => [i.labelIndex, i.serialIndex]), [[3, 103], [4, 104]]);
  assert.equal(expandSerialBatch({ count: 99999 }).length, 5000);
  assert.deepEqual(expandSerialBatch({ count: 0 }), []);
});

test('resume cursor is written per confirmed label and survives a failure', () => {
  let c = newCursor({ jobId: 'j', labelId: 'L', designHash: 'abc', total: 5, baseOffset: 40 });
  assert.equal(c.nextIndex, 0);
  c = confirmLabel(c, 0);
  c = confirmLabel(c, 1);
  c = confirmLabel(c, 2);
  assert.equal(c.nextIndex, 3);
  c = markFailed(c, 3);
  assert.equal(c.status, 'failed');
  const info = resumeInfo(c, 'abc');
  assert.deepEqual(info && { at: info.resumeAt, skip: info.skipTo, off: info.baseOffset, changed: info.designChanged }, { at: 3, skip: 4, off: 40, changed: false });
  // resume at the failed label, finish the job
  c = confirmLabel(c, 3);
  c = confirmLabel(c, 4);
  assert.equal(c.status, 'done');
  assert.equal(resumeInfo(c, 'abc'), null);
  assert.equal(confirmedCount(c), 5);
});

test('resume warns when the design changed since the failure', () => {
  const c = markFailed(confirmLabel(newCursor({ jobId: 'j', labelId: 'L', designHash: 'old', total: 4, baseOffset: 0 }), 0), 1);
  assert.equal(resumeInfo(c, 'new')?.designChanged, true);
  assert.equal(resumeInfo(c, 'old')?.designChanged, false);
});

test('cancel keeps what was printed and can be resumed; continue offset math', () => {
  let c = newCursor({ jobId: 'j', labelId: 'L', designHash: 'h', total: 10, baseOffset: 100 });
  for (let i = 0; i < 4; i += 1) c = confirmLabel(c, i);
  c = markCancelled(c);
  assert.equal(c.status, 'cancelled');
  assert.equal(resumeInfo(c, 'h')?.resumeAt, 4);
  // continue-from-last advances only by fully confirmed labels
  assert.equal(c.baseOffset + confirmedCount(c), 104);
  // a resumed job re-uses the failed job's offset, so values continue seamlessly
  const resumed = expandSerialBatch({ count: 10, offset: c.baseOffset, startAt: resumeInfo(c, 'h')!.resumeAt });
  assert.equal(resumed[0].serialIndex, 104);
});

test('design hash ignores ids and timestamps but tracks what prints', () => {
  const a = nonSerialFixture();
  const b = { ...a, id: 'other', createdAt: 5, updatedAt: 9 };
  assert.equal(designHash(a), designHash(b));
  const c = { ...a, elements: a.elements.slice(1) };
  assert.notEqual(designHash(a), designHash(c));
  assert.notEqual(designHash(a), designHash({ ...a, serialBatch: { v: 1, count: 3 } }));
});

test('the [serial-print] log line has the exact agreed shape', () => {
  assert.equal(
    serialPrintLogLine({ jobId: 'sj_1', label: 12, total: 50, serialIndex: 111, value: 'SN-012', copy: 1, copies: 2, state: 'confirmed' }),
    '[serial-print] job=sj_1 label=12/50 serialIndex=111 value="SN-012" copy=1/2 state=confirmed',
  );
});
