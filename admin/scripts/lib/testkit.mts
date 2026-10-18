// Small helpers shared by the end-to-end test scripts.
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

import { hashPassword } from '../../src/lib/passwords.ts';
import { generateTotpSecret, totpNow } from '../../src/lib/totp.ts';

export const ROOT = path.join(import.meta.dirname, '..', '..');
process.loadEnvFile(path.join(ROOT, '.env'));
export const BASE = process.env.BASE ?? 'http://localhost:3000';
export const prisma = new PrismaClient();

export type Res = { status: number; body: any; headers: Headers };

export async function call(
  method: string,
  url: string,
  opts: { body?: unknown; form?: FormData; cookie?: string; token?: string } = {},
): Promise<Res> {
  const res = await fetch(BASE + url, {
    method,
    redirect: 'manual',
    headers: {
      ...(opts.form ? {} : { 'Content-Type': 'application/json' }),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.form ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* svg, csv or html */
  }
  const set = res.headers.get('set-cookie');
  if (set && typeof body === 'object') body.__cookie = set.split(';')[0];
  return { status: res.status, body, headers: res.headers };
}

export type TestAdmin = { id: string; email: string; role: string; password: string };

export async function createAdmins(admins: TestAdmin[]) {
  const secrets: Record<string, string> = {};
  for (const a of admins) {
    secrets[a.id] = generateTotpSecret();
    await prisma.adminAccount.create({
      data: { id: a.id, name: a.email, email: a.email, role: a.role, passwordHash: hashPassword(a.password), totpSecret: secrets[a.id] },
    });
  }
  return secrets;
}

export async function login(a: TestAdmin, secret: string) {
  const first = await call('POST', '/api/auth/login', { body: { username: a.email, password: a.password } });
  if (first.body.step !== 'totp') throw new Error('expected totp step');
  const r = await call('POST', '/api/auth/login', { body: { username: a.email, password: a.password, code: totpNow(secret) } });
  if (r.status !== 200) throw new Error(`login failed ${r.status}`);
  return r.body.__cookie as string;
}

export function checker() {
  const state = { failures: 0, n: 0 };
  return {
    check(label: string, ok: boolean, detail = '') {
      state.n += 1;
      if (!ok) state.failures += 1;
      console.log(`${String(state.n).padStart(2)}. ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  [${detail}]` : ''}`);
    },
    async finish() {
      console.log(`\n${state.failures === 0 ? 'ALL PASSED' : `${state.failures} FAILED`} (${state.n} checks)`);
      await prisma.$disconnect();
      process.exit(state.failures === 0 ? 0 : 1);
    },
  };
}
