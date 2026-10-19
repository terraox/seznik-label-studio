import { checkSecrets } from './secrets';

/** Stops the server when a secret is missing, short, a placeholder, or reused, or the admin sign-in is not set. */
export function assertSecrets() {
  const problems = checkSecrets();
  if (!(process.env.ADMIN_FIXED_USERNAME ?? '').trim() || (process.env.ADMIN_FIXED_PASSWORD ?? '').length < 8) {
    problems.push('ADMIN_FIXED_USERNAME and ADMIN_FIXED_PASSWORD (8+ characters) must be set: they are the one admin sign-in.');
  }
  if (problems.length === 0) return;
  console.error('\n[boot] Refusing to start. Fix these in the environment:');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('  Generate fresh secrets with: npm run secrets:gen\n');
  process.exit(1);
}
