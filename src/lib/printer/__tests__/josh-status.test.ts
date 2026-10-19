import assert from 'node:assert/strict';

import { JOSH_BATTERY_LEVELS, joshBatteryLevel } from '@/lib/printer/josh-battery-levels';
import {
  JOSH_FAIL_MESSAGES,
  JOSH_FAIL_REASONS,
  JOSH_LID_MESSAGE,
  JOSH_PAPER_MESSAGE,
  JOSH_PROGRESS_IDLE,
  applyJoshProgressEvent,
  formatJoshStatusLog,
  changedStatusBits,
  joshFailMessage,
  joshLidOpen,
  joshPrintError,
  joshProgressText,
  joshReadingText,
} from '@/lib/printer/josh-status';

// Every PrintFailReason has a one-line message.
for (const reason of JOSH_FAIL_REASONS) {
  const msg = joshFailMessage(reason);
  assert.ok(msg.length > 0 && !msg.includes('\n'), reason);
  assert.equal(typeof JOSH_FAIL_MESSAGES[reason], 'string');
}
for (const r of ['CoverOpened', 'TphOpened', 'LabelCanOpend']) assert.equal(joshFailMessage(r), JOSH_LID_MESSAGE);
for (const r of ['No_Paper', 'No_Label', 'Usedup_Label']) assert.equal(joshFailMessage(r), JOSH_PAPER_MESSAGE);
assert.equal(joshFailMessage('VolTooLow'), 'Battery too low. Charge the printer.');
assert.equal(joshFailMessage('TphTooHot'), 'Printer is too hot. Let it cool down.');
assert.equal(joshFailMessage('TphTooCold'), 'Printer is too cold. Move it somewhere warmer.');
assert.match(joshFailMessage('Other', 25), /code 25/);
assert.match(joshFailMessage('SomethingNew'), /SomethingNew/);
assert.ok(joshFailMessage(undefined).length > 0);

// Native rejection text maps to the plain message; unrelated errors pass through.
const mapped = joshPrintError(new Error('Call rejected. JOSH_PRINT_FAILED: CoverOpened')) as Error;
assert.equal(mapped.message, JOSH_LID_MESSAGE);
assert.equal((joshPrintError(new Error('JOSH_PRINT_TIMEOUT')) as Error).message, JOSH_FAIL_MESSAGES.Timeout);
const plain = new Error('boom');
assert.equal(joshPrintError(plain), plain);

// Battery bars: 1-4 or null, never throws.
for (const v of [undefined, null, NaN, Infinity, -1, 0, '7', {}, 1e9, 0.0001, 6.9, 7.7, 8.4]) {
  const level = joshBatteryLevel(v);
  assert.ok(level === null || (level >= 1 && level <= 4), String(v));
}
assert.equal(joshBatteryLevel(0), null);
assert.equal(joshBatteryLevel(undefined), null);
assert.equal(joshBatteryLevel(8.4), 4);
assert.equal(joshBatteryLevel(6.1), 1);
const mins = JOSH_BATTERY_LEVELS.map((r) => r.minVoltage);
assert.deepEqual(mins, [...mins].sort((a, b) => a - b));

// Readings: zero or missing is "not reported", otherwise the raw number labelled as reported.
assert.equal(joshReadingText(0), 'not reported');
assert.equal(joshReadingText(undefined), 'not reported');
assert.equal(joshReadingText(NaN), 'not reported');
assert.equal(joshReadingText(7.4), '7.4 (as reported by printer)');

// Progress text.
let s = JOSH_PROGRESS_IDLE;
assert.equal(joshProgressText(s), null);
s = applyJoshProgressEvent(s, { progress: 'CONNECTED', copies: 5 });
assert.equal(joshProgressText(s), 'Sending');
s = applyJoshProgressEvent(s, { progress: 'DATA_ENDED', copy: 2, copies: 5 });
assert.equal(joshProgressText(s), 'Printing 2 of 5');
s = applyJoshProgressEvent(s, { progress: 'SUCCESS', copy: 5, copies: 5 });
assert.equal(joshProgressText(s), 'Done');
s = applyJoshProgressEvent(s, { progress: 'FAILED', reason: 'CoverOpened' });
assert.equal(joshProgressText(s), `Failed: ${JOSH_LID_MESSAGE}`);
assert.doesNotMatch(joshProgressText(s) ?? '', /%/);
assert.equal(
  joshProgressText({ ...JOSH_PROGRESS_IDLE, phase: 'printing', copy: 1, copies: 1, bulkIndex: 3, bulkTotal: 12 }),
  'Label 3 of 12: Printing',
);
assert.equal(applyJoshProgressEvent(JOSH_PROGRESS_IDLE, { progress: 'WHATEVER' }), JOSH_PROGRESS_IDLE);

// Status log lists every field, and does not throw on a missing status.
const log = formatJoshStatusLog(
  { available: true, printerStatus: 5, printerHeadTem: 31, batteryVoltage: 7.4, supportedGapTypes: [1, 2] },
  new Date(0),
);
for (const key of [
  'printerHeadTem', 'batteryVoltage', 'batteryCount', 'batteryVoltageCount', 'chargeStatus', 'isConnectedAdapter',
  'printerStatus:', 'printerStatus(binary): 0000000000000101', 'printPages', 'printLines', 'workLines', 'nullLines',
  'gapType', 'supportedGapTypes: 1,2', 'time: 1970-01-01',
]) {
  assert.ok(log.includes(key), key);
}
assert.ok(formatJoshStatusLog(null).includes('unavailable'));

// Lid bit: unknown until verified, then a plain mask test. Never throws.
assert.equal(joshLidOpen(4), null);
assert.equal(joshLidOpen(4, 4), true);
assert.equal(joshLidOpen(1, 4), false);
assert.equal(joshLidOpen(undefined, 4), null);
assert.equal(changedStatusBits(1, 5), '0000000000000100');
assert.equal(changedStatusBits(undefined, 5), '0000000000000000');

console.log('ok josh-status');
