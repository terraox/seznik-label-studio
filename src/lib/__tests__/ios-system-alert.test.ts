import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dismissCurrentSystemAlert,
  enqueueSystemAlert,
  getCurrentSystemAlert,
  normalizeSystemAlert,
  resetSystemAlertsForTests,
} from '@/lib/ios-system-alert';

test('a bare alert becomes a bold OK button', () => {
  const alert = normalizeSystemAlert('Saved', 'The label is stored on this phone.');
  assert.equal(alert.title, 'Saved');
  assert.equal(alert.message, 'The label is stored on this phone.');
  assert.equal(alert.cancelable, false);
  assert.deepEqual(
    alert.buttons.map((button) => ({ text: button.text, bold: button.bold })),
    [{ text: 'OK', bold: true }],
  );
});

test('two-button alerts put Cancel on the left and keep a destructive action', () => {
  const alert = normalizeSystemAlert('Remove font', 'Delete this font?', [
    { text: 'Delete', style: 'destructive', onPress: () => undefined },
    { text: 'Cancel', style: 'cancel' },
  ]);
  assert.deepEqual(
    alert.buttons.map((button) => button.text),
    ['Cancel', 'Delete'],
  );
  assert.equal(alert.buttons[1]?.style, 'destructive');
});

test('lists longer than Android’s three-button limit stay intact', () => {
  const alert = normalizeSystemAlert('Choose Type', 'Pick one.', [
    { text: 'Text' },
    { text: 'Barcode' },
    { text: 'QRCode' },
    { text: 'Cancel', style: 'cancel' },
  ]);
  assert.deepEqual(
    alert.buttons.map((button) => button.text),
    ['Text', 'Barcode', 'QRCode', 'Cancel'],
  );
});

test('alerts queue one at a time and run the chosen action after dismiss', () => {
  resetSystemAlertsForTests();
  const presses: string[] = [];

  enqueueSystemAlert(
    normalizeSystemAlert('First', 'One', [
      { text: 'Go', onPress: () => presses.push('first') },
    ]),
  );
  enqueueSystemAlert(normalizeSystemAlert('Second', 'Two'));

  const first = getCurrentSystemAlert();
  assert.equal(first?.title, 'First');
  dismissCurrentSystemAlert();
  first?.buttons[0]?.onPress?.();
  assert.deepEqual(presses, ['first']);
  assert.equal(getCurrentSystemAlert()?.title, 'Second');

  dismissCurrentSystemAlert();
  assert.equal(getCurrentSystemAlert(), null);
  resetSystemAlertsForTests();
});
