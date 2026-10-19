import Constants from 'expo-constants';

import type { ConsumerPrinterId } from '@/constants/printer-models';
import { appHeaders, appPlatform } from '@/lib/telemetry/app-headers';

export type AuthUserDto = {
  id: string;
  name: string;
  mobile: string;
  printerId: string | null;
  printerName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
};

export type OtpPurpose = 'register' | 'login';

export type AuthResponse = {
  token: string;
  user: AuthUserDto;
  needsPrinter: boolean;
};

function apiBase(): string {
  const fromExtra = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  const base = (fromEnv || fromExtra || 'http://localhost:3000').replace(/\/$/, '');
  return base;
}

async function parseError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error || fallback;
}

export async function sendOtpRequest(
  mobile: string,
  purpose: OtpPurpose,
): Promise<{ resendAfter: number }> {
  const res = await fetch(`${apiBase()}/api/app/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...appHeaders() },
    body: JSON.stringify({ mobile, purpose }),
  });
  if (!res.ok) throw new Error(await parseError(res, 'Could not send OTP.'));
  return (await res.json()) as { resendAfter: number };
}

export async function verifyOtpRequest(
  mobile: string,
  otp: string,
  purpose: OtpPurpose,
): Promise<{ otpProof: string }> {
  const res = await fetch(`${apiBase()}/api/app/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...appHeaders() },
    body: JSON.stringify({ mobile, otp, purpose }),
  });
  if (!res.ok) throw new Error(await parseError(res, 'Could not verify OTP.'));
  return (await res.json()) as { otpProof: string };
}

export async function registerUser(input: {
  name: string;
  mobile: string;
  password: string;
  otpProof: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${apiBase()}/api/app/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...appHeaders() },
    body: JSON.stringify({ ...input, platform: appPlatform() }),
  });
  if (!res.ok) throw new Error(await parseError(res, 'Registration failed.'));
  return (await res.json()) as AuthResponse;
}

export async function loginUser(input: {
  mobile: string;
  password?: string;
  otpProof?: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${apiBase()}/api/app/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...appHeaders() },
    body: JSON.stringify({ ...input, platform: appPlatform() }),
  });
  if (!res.ok) throw new Error(await parseError(res, 'Login failed.'));
  return (await res.json()) as AuthResponse;
}

export async function fetchMe(token: string): Promise<{ user: AuthUserDto; needsPrinter: boolean }> {
  const res = await fetch(`${apiBase()}/api/app/me`, {
    headers: { Authorization: `Bearer ${token}`, ...appHeaders() },
  });
  if (!res.ok) throw new Error(await parseError(res, 'Session expired.'));
  return (await res.json()) as { user: AuthUserDto; needsPrinter: boolean };
}

export async function setPurchasedPrinter(
  token: string,
  printerId: ConsumerPrinterId,
): Promise<{ user: AuthUserDto; needsPrinter: boolean }> {
  const res = await fetch(`${apiBase()}/api/app/printer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...appHeaders(),
    },
    body: JSON.stringify({ printerId }),
  });
  if (!res.ok) throw new Error(await parseError(res, 'Could not save printer.'));
  return (await res.json()) as { user: AuthUserDto; needsPrinter: boolean };
}
