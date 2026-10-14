/** Placeholder OTP until an SMS provider is wired up. */
export const DEMO_OTP = '0000';
export const OTP_LENGTH = DEMO_OTP.length;

export const PHONE_LENGTH = 10;

export type PasswordRule = { id: string; label: string; test: (password: string) => boolean };

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'number', label: 'One number', test: (p) => /\d/.test(p) },
  { id: 'special', label: 'One special character', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function digitsOnly(value: string, max = PHONE_LENGTH): string {
  return value.replace(/\D/g, '').slice(0, max);
}

/** Indian mobile number: 10 digits starting with 6-9. */
export function isValidPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone);
}

export function isValidName(name: string): boolean {
  return name.trim().length >= 2;
}

export function passwordRuleResults(password: string) {
  return PASSWORD_RULES.map((rule) => ({ ...rule, met: rule.test(password) }));
}

export function isStrongPassword(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}
