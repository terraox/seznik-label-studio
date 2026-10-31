import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IOS_PRINTER_AVAILABILITY,
  iosPrinterConnectBanner,
  printerScanUnavailableCopy,
} from '@/lib/printer/ios-platform-notice';

test('ios banner is set and mentions JOSH first', () => {
  const banner = iosPrinterConnectBanner('ios');
  assert.ok(banner);
  assert.match(banner!, /JOSH/i);
  assert.match(banner!, /TEJAS|RUDRA/i);
});

test('non-ios platforms have no connect banner', () => {
  assert.equal(iosPrinterConnectBanner('android'), null);
  assert.equal(iosPrinterConnectBanner('web'), null);
});

test('scan unavailable copy is platform-specific', () => {
  assert.match(printerScanUnavailableCopy('ios'), /iOS/i);
  assert.match(printerScanUnavailableCopy('android'), /Android/i);
});

test('availability flags document TD-404 and DEV', () => {
  assert.equal(IOS_PRINTER_AVAILABILITY.td404ComingSoon, true);
  assert.equal(IOS_PRINTER_AVAILABILITY.devAndroidOnly, true);
});
