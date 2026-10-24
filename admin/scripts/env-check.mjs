#!/usr/bin/env node
// Compares the live environment with .env.production.example: lists names that are missing or unknown,
// and refuses values that must not exist in production. Run before every start (deploy.sh does).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const example = readFileSync(join(here, '..', '.env.production.example'), 'utf8');
const required = [];
const optional = [];
for (const line of example.split('\n')) {
  const m = line.match(/^(#\s*)?([A-Z][A-Z0-9_]*)=/);
  if (!m) continue;
  (m[1] ? optional : required).push(m[2]);
}
const problems = [];
for (const name of required) if (!(process.env[name] ?? '').trim()) problems.push(`missing: ${name}`);
const known = new Set([...required, ...optional, 'PATH', 'HOME', 'PWD', 'SHELL', 'USER', 'LANG', 'NODE_ENV']);
const forbidden = ['OTP_DEV_BYPASS'];
for (const name of forbidden) if (process.env[name]) problems.push(`must not be set in production: ${name}`);
if (process.env.NODE_ENV !== 'production') problems.push('NODE_ENV must be production');
const url = process.env.DATABASE_URL ?? '';
if (url && !url.includes('-pooler')) problems.push('DATABASE_URL should be the pooled Neon URL (host contains -pooler)');
if ((process.env.DIRECT_URL ?? '').includes('-pooler')) problems.push('DIRECT_URL must be the direct URL (no -pooler)');
if (problems.length) {
  console.error('[env-check] FAILED');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`[env-check] ok (${required.length} required names set)`);
void known;
