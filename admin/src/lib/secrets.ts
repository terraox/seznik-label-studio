/**
 * Server secrets. One secret per purpose, no fallbacks.
 * Edge-safe on purpose (no node imports): the middleware reads SEZ_ADMIN_SECRET too.
 * Error text never contains a secret value.
 */
export const SECRET_NAMES = [
  'ADMIN_SESSION_SECRET', // second admin API sign-in cookie (/api/admin/*)
  'APP_TOKEN_SECRET', // mobile app session tokens
  'OTP_HASH_SECRET', // OTP code hashes and OTP proofs
  'SEZ_ADMIN_SECRET', // desk admin session cookie
] as const;

export type SecretName = (typeof SECRET_NAMES)[number];

export const SECRET_MIN_LENGTH = 32;

const KNOWN_DEFAULTS = new Set([
  'replace-with-a-long-random-string',
  'change-me-in-production',
]);

const PLACEHOLDER = /replace-?with|change-?me|your-?secret|placeholder|example|default|xxxxxxxx/i;

function readEnv(name: SecretName): string | undefined {
  // Literal accesses: the edge runtime inlines env reads per name.
  switch (name) {
    case 'ADMIN_SESSION_SECRET':
      return process.env.ADMIN_SESSION_SECRET;
    case 'APP_TOKEN_SECRET':
      return process.env.APP_TOKEN_SECRET;
    case 'OTP_HASH_SECRET':
      return process.env.OTP_HASH_SECRET;
    case 'SEZ_ADMIN_SECRET':
      return process.env.SEZ_ADMIN_SECRET;
  }
}

/** Why a value is not acceptable, or null when it is. */
export function secretProblem(value: string | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v) return 'is missing';
  if (v.length < SECRET_MIN_LENGTH) return `is too short (${v.length} chars, need ${SECRET_MIN_LENGTH}+)`;
  if (KNOWN_DEFAULTS.has(v.toLowerCase()) || PLACEHOLDER.test(v)) return 'is a known default or placeholder';
  if (new Set(v).size < 8) return 'has too little variety to be random';
  return null;
}

/** All problems with the four secrets, including reuse across purposes. */
export function checkSecrets(): string[] {
  const problems: string[] = [];
  const seen = new Map<string, SecretName>();
  for (const name of SECRET_NAMES) {
    const value = readEnv(name);
    const why = secretProblem(value);
    if (why) {
      problems.push(`${name} ${why}`);
      continue;
    }
    const v = (value as string).trim();
    const other = seen.get(v);
    if (other) problems.push(`${name} must differ from ${other}`);
    else seen.set(v, name);
  }
  return problems;
}

export function getSecret(name: SecretName): string {
  const value = readEnv(name);
  const why = secretProblem(value);
  if (why) throw new Error(`${name} ${why}. Run "npm run secrets:gen" and put the values in .env.`);
  return (value as string).trim();
}
