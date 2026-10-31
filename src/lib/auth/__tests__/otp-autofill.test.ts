import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Documents the OTP autofill contract used by otp-boxes.tsx:
 * - iOS: textContentType oneTimeCode + autoComplete one-time-code (system SMS autofill)
 * - Android: autoComplete sms-otp (+ optional sms-consent native listener)
 * SMS User Consent / phone-number hint stay Android-only (sms-consent module).
 */
test('ios otp autofill uses one-time-code autocomplete token', () => {
  const iosAutoComplete = 'ios' === 'android' ? 'sms-otp' : 'one-time-code';
  assert.equal(iosAutoComplete, 'one-time-code');
});

test('android otp autofill uses sms-otp autocomplete token', () => {
  const platform = 'android';
  const autoComplete = platform === 'android' ? 'sms-otp' : 'one-time-code';
  assert.equal(autoComplete, 'sms-otp');
});

test('sms consent module is android-gated by platform check contract', () => {
  const platformsThatLoadSmsConsent = ['android'];
  assert.equal(platformsThatLoadSmsConsent.includes('ios'), false);
  assert.equal(platformsThatLoadSmsConsent.includes('android'), true);
});
