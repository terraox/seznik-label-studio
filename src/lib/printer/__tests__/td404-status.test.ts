import assert from 'node:assert/strict';

import {
  TD404_STATUS_QUERY,
  parseTd404StatusReply,
  td404EstimateFeedMs,
  td404IdleTimeoutMs,
} from '@/lib/printer/td404-status';

assert.deepEqual([...TD404_STATUS_QUERY], [0x1b, 0x21, 0x3f]);

// Empty / missing reply → unknown printing, no hard error (timed fallback path).
for (const empty of [null, undefined, new Uint8Array(0), []]) {
  const s = parseTd404StatusReply(empty);
  assert.equal(s.raw, null);
  assert.equal(s.printing, null);
  assert.equal(s.error, false);
  assert.equal(s.failureMessage, null);
}

// Idle: printing bit clear.
{
  const s = parseTd404StatusReply(new Uint8Array([0x00]));
  assert.equal(s.raw, 0);
  assert.equal(s.printing, false);
  assert.equal(s.error, false);
  assert.equal(s.failureMessage, null);
}

// Printing bit 5 (0x20).
{
  const s = parseTd404StatusReply([0x20]);
  assert.equal(s.printing, true);
  assert.equal(s.error, false);
}

// Paper out bit 2 (0x04).
{
  const s = parseTd404StatusReply([0x04]);
  assert.equal(s.paperOut, true);
  assert.equal(s.error, true);
  assert.match(s.failureMessage ?? '', /paper/i);
}

// Cover / head: bit 6 or bit 0.
{
  const cover = parseTd404StatusReply([0x40]);
  assert.equal(cover.coverOpen, true);
  assert.match(cover.failureMessage ?? '', /lid/i);
  const head = parseTd404StatusReply([0x01]);
  assert.equal(head.coverOpen, true);
}

// Jam bit 1.
{
  const s = parseTd404StatusReply([0x02]);
  assert.equal(s.jammed, true);
  assert.match(s.failureMessage ?? '', /jam/i);
}

// Pause alone is not a hard error bit, but still surfaces a message for FAILED mapping.
{
  const s = parseTd404StatusReply([0x10]);
  assert.equal(s.paused, true);
  assert.equal(s.error, false);
  assert.match(s.failureMessage ?? '', /paused/i);
}

// Feed pace: SPEED n is inches/sec (×25.4 mm/s); travel = height + gap.
{
  const ms = td404EstimateFeedMs(75, 3, 3);
  // (75+3) / (3*25.4) * 1000 + 60 ≈ 1083
  assert.ok(ms > 900 && ms < 1300, String(ms));
  assert.ok(td404EstimateFeedMs(75, 6, 3) < ms);
}

// Timeout budget: floor 3s, ceiling 90s.
assert.equal(td404IdleTimeoutMs(1, 10, 1), 3_000);
assert.ok(td404IdleTimeoutMs(50, 3, 1) >= 3_000);
assert.equal(td404IdleTimeoutMs(500, 1, 20), 90_000);
assert.ok(td404IdleTimeoutMs(75, 3, 6) > td404IdleTimeoutMs(75, 3, 1));

console.log('ok td404-status');
