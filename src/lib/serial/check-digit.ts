/** Check digits shared by the serial engine and barcode-code128.ts (one implementation). */

/** GS1 mod-10 digit for EAN-13 (12 digits), UPC-A (11) and EAN-8 (7). Rightmost payload digit has weight 3. */
export function gs1CheckDigit(digits: string): number {
  let sum = 0;
  for (let i = digits.length - 1, weight = 3; i >= 0; i -= 1, weight = weight === 3 ? 1 : 3) {
    sum += Number(digits[i]) * weight;
  }
  return (10 - (sum % 10)) % 10;
}

/** Luhn check digit for a digits-only payload. */
export function luhnCheckDigit(digits: string): number {
  let sum = 0;
  let double = true;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

/** Payload digit counts (without the check digit) for symbologies that carry one. */
export function checkDigitPayloadLength(encodeMode: string | undefined): number | null {
  switch (encodeMode) {
    case 'EAN-13':
      return 12;
    case 'UPC-A':
      return 11;
    case 'EAN-8':
      return 7;
    default:
      return null;
  }
}
