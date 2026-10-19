import { useCallback, useRef } from 'react';

import { requestPhoneNumberHint } from 'sms-consent';

/**
 * Returns an onFocus handler for the phone field. The first time the empty field is tapped, Android
 * offers the numbers on the phone; the chosen one is passed to `onPick`. Asked once per screen, so
 * dismissing the sheet never makes it pop up again on every tap. Does nothing on iOS.
 */
export function usePhoneHint(currentPhone: string, onPick: (phone: string) => void) {
  const asked = useRef(false);
  return useCallback(() => {
    if (asked.current || currentPhone.length > 0) return;
    asked.current = true;
    void requestPhoneNumberHint().then((phone) => {
      if (phone) onPick(phone);
    });
  }, [currentPhone, onPick]);
}
