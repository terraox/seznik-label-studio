import { useCallback, useEffect, useRef, useState } from 'react';
import { listenForOtp } from 'sms-consent';

import { sendOtpRequest, verifyOtpRequest, type OtpPurpose } from '@/lib/auth/api';
import { OTP_LENGTH, OTP_RESEND_SECONDS } from '@/lib/auth/validation';

/** Send / resend (with 60s cooldown) and verify for one OTP purpose. */
export function useOtp(purpose: OtpPurpose, onAutoCode?: (code: string) => void) {
  const stopListen = useRef<(() => void) | null>(null);
  const onAutoCodeRef = useRef(onAutoCode);
  onAutoCodeRef.current = onAutoCode;
  const stopListening = useCallback(() => {
    stopListen.current?.();
    stopListen.current = null;
  }, []);
  useEffect(() => stopListening, [stopListening]);

  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const reset = useCallback(() => {
    stopListening();
    setSent(false);
    setCooldown(0);
    setError(null);
  }, [stopListening]);

  const send = useCallback(
    async (mobile: string): Promise<boolean> => {
      if (busy || cooldown > 0) return false;
      setBusy(true);
      setError(null);
      // Android shows its "Allow to read this message?" prompt for the incoming SMS.
      stopListening();
      stopListen.current = listenForOtp(OTP_LENGTH, (code) => {
        stopListening();
        onAutoCodeRef.current?.(code);
      });
      try {
        await sendOtpRequest(mobile, purpose);
        setSent(true);
        setCooldown(OTP_RESEND_SECONDS);
        return true;
      } catch (err) {
        stopListening();
        setError(err instanceof Error ? err.message : 'Could not send OTP.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, cooldown, purpose, stopListening],
  );

  /** Returns the proof on success, null on failure (error is set). */
  const verify = useCallback(
    async (mobile: string, otp: string): Promise<string | null> => {
      if (busy) return null;
      setBusy(true);
      setError(null);
      try {
        const result = await verifyOtpRequest(mobile, otp, purpose);
        return result.otpProof;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Incorrect OTP. Please try again.');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [busy, purpose],
  );

  return { sent, busy, cooldown, error, setError, send, verify, reset };
}
