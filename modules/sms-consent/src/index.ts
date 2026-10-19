import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type NativeSmsConsent = {
  startListening(): Promise<void>;
  stopListening(): void;
  requestPhoneNumberHint(): Promise<string | null>;
  addListener(event: 'onMessage', cb: (e: { message: string }) => void): { remove(): void };
  addListener(event: 'onTimeout', cb: () => void): { remove(): void };
};

let cached: NativeSmsConsent | null | undefined;

function getNative(): NativeSmsConsent | null {
  if (Platform.OS !== 'android') return null;
  if (cached !== undefined) return cached;
  try {
    cached = requireNativeModule<NativeSmsConsent>('SmsConsent');
  } catch {
    // Older dev build without this module: typing the code by hand still works.
    cached = null;
  }
  return cached;
}

/**
 * Asks Android to offer the next incoming SMS to the app (system prompt "Allow to read this
 * message?"). Resolves the first run of `length` digits in the message. Returns a stop function.
 * Does nothing off Android or when the native module is missing from the build.
 */
export function listenForOtp(length: number, onCode: (code: string) => void): () => void {
  const mod = getNative();
  if (!mod) return () => undefined;
  const pattern = new RegExp(`(?<!\\d)\\d{${length}}(?!\\d)`);
  const sub = mod.addListener('onMessage', ({ message }) => {
    const code = pattern.exec(message)?.[0];
    if (code) onCode(code);
  });
  mod.startListening().catch(() => undefined);
  return () => {
    sub.remove();
    try {
      mod.stopListening();
    } catch {
      // already stopped
    }
  };
}

/**
 * Shows Android's "choose a phone number" sheet (numbers saved on the phone) and resolves the
 * chosen number as 10 digits, or null if dismissed, unavailable, or not Android.
 */
export async function requestPhoneNumberHint(): Promise<string | null> {
  const mod = getNative();
  if (!mod || typeof mod.requestPhoneNumberHint !== 'function') return null;
  try {
    const raw = await mod.requestPhoneNumberHint();
    const digits = (raw ?? '').replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : null;
  } catch {
    return null;
  }
}
