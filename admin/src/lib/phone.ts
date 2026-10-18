/**
 * One canonical form per mobile number: the 10-digit Indian number (starts 6-9).
 * Accepts the usual spellings (+91…, 91…, 0…, spaces, dashes) so the same phone can never
 * be registered twice by writing it differently.
 */
export function normalizeMobile(input: string | null | undefined): string | null {
  let digits = (input ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/** 98•••••210 for lists and logs. */
export function maskMobile(mobile: string): string {
  return mobile.length === 10 ? `${mobile.slice(0, 2)}••••••${mobile.slice(-2)}` : '••••';
}
