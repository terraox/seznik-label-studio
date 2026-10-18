#!/usr/bin/env node
// Prints fresh values for the four server secrets. Copy them into .env (never commit .env).
import { randomBytes } from 'node:crypto';

for (const name of ['ADMIN_SESSION_SECRET', 'APP_TOKEN_SECRET', 'OTP_HASH_SECRET', 'SEZ_ADMIN_SECRET']) {
  console.log(`${name}=${randomBytes(48).toString('base64url')}`);
}
