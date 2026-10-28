import assert from 'node:assert/strict';

import {
  PRINT_PROGRESS_IDLE,
  applyPrintProgressEvent,
  printProgressFraction,
  printProgressText,
  progressFailMessage,
} from '@/lib/printer/print-progress';

// Idle → no text / no bar.
assert.equal(printProgressText(PRINT_PROGRESS_IDLE), null);
assert.equal(printProgressFraction(PRINT_PROGRESS_IDLE), null);

// TD-404 paced vocabulary (same events as Josh).
let s = applyPrintProgressEvent(PRINT_PROGRESS_IDLE, { progress: 'START_COPY', copy: 1, copies: 5 });
assert.equal(printProgressText(s), 'Sending');
s = applyPrintProgressEvent(s, { progress: 'DATA_ENDED', copy: 1, copies: 5 });
assert.equal(printProgressText(s), 'Printing 1 of 5');
s = applyPrintProgressEvent(s, { progress: 'SUCCESS', copy: 1, copies: 5 });
assert.equal(s.copiesDone, 1);
assert.equal(s.phase, 'printing');
s = applyPrintProgressEvent(s, { progress: 'START_COPY', copy: 2, copies: 5 });
s = applyPrintProgressEvent(s, { progress: 'DATA_ENDED', copy: 2, copies: 5 });
s = applyPrintProgressEvent(s, { progress: 'SUCCESS', copy: 5, copies: 5 });
assert.equal(s.phase, 'done');
assert.equal(printProgressText(s), 'Done');
assert.equal(printProgressFraction(s), 1);

// failureMessage from native status bits wins over reason codes.
s = applyPrintProgressEvent(PRINT_PROGRESS_IDLE, {
  progress: 'FAILED',
  copy: 2,
  copies: 5,
  reason: 'StatusError',
  failureMessage: 'No paper detected. Load paper and try again.',
});
assert.equal(s.phase, 'failed');
assert.equal(printProgressText(s), 'Failed: No paper detected. Load paper and try again.');
assert.equal(
  progressFailMessage('StatusError', null, 'Printer lid is open. Close it and try again.'),
  'Printer lid is open. Close it and try again.',
);

// Bulk Excel: Label i of n prefix.
s = applyPrintProgressEvent(
  { ...PRINT_PROGRESS_IDLE, bulkIndex: 3, bulkTotal: 12 },
  { progress: 'DATA_ENDED', copy: 1, copies: 1 },
);
assert.equal(printProgressText(s), 'Label 3 of 12: Printing');

// Unknown progress names are ignored.
assert.equal(applyPrintProgressEvent(PRINT_PROGRESS_IDLE, { progress: 'NOPE' }), PRINT_PROGRESS_IDLE);

// SUCCESS without a real copy count leaves state alone (submit-accepted noise).
const mid = applyPrintProgressEvent(PRINT_PROGRESS_IDLE, { progress: 'START_COPY', copy: 1, copies: 3 });
assert.equal(applyPrintProgressEvent(mid, { progress: 'SUCCESS', copy: 0, copies: 3 }), mid);

console.log('ok print-progress');
