import { getAdminApiBase } from './api';

async function parseError(res: Response, fallback: string) {
  const data = await res.json().catch(() => null);
  return (data as { error?: string } | null)?.error || fallback;
}

export async function fetchAdminSession(): Promise<{ userId: string }> {
  const res = await fetch(`${getAdminApiBase()}/me`, { credentials: 'include' });
  if (!res.ok) throw new Error(await parseError(res, 'Not signed in'));
  return (await res.json()) as { userId: string };
}

export async function loginAdmin(userId: string, password: string): Promise<{ userId: string }> {
  const res = await fetch(`${getAdminApiBase()}/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, password }),
  });
  if (!res.ok) throw new Error(await parseError(res, 'Invalid user ID or password'));
  return (await res.json()) as { userId: string };
}

export async function logoutAdmin(): Promise<void> {
  await fetch(`${getAdminApiBase()}/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}
