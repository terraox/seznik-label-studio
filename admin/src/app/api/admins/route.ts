import { toRecord } from '@/lib/admin-db';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { isEmail, nid } from '@/lib/format';
import { hashPassword } from '@/lib/passwords';
import { ROLE_IDS, type Role } from '@/lib/permissions';
import { publicAdmin } from '@/lib/present';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requirePermission('overview.view');
    const rows = await prisma.adminAccount.findMany({ orderBy: { createdAt: 'asc' } });
    return json({ admins: rows.map((row) => publicAdmin(toRecord(row))) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission('admins.manage');
    const body = (await request.json()) as { name?: string; email?: string; password?: string; role?: Role };
    const name = (body.name ?? '').trim();
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    const role = body.role ?? 'support';
    if (!name) throw new HttpError(400, 'Add a name.');
    if (!isEmail(email)) throw new HttpError(400, 'That email does not look right.');
    if (password.length < 12) throw new HttpError(400, 'Use at least 12 characters for the password.');
    if (!(ROLE_IDS as readonly string[]).includes(role)) throw new HttpError(400, 'Pick a role.');
    if (await prisma.adminAccount.findUnique({ where: { email } })) {
      throw new HttpError(400, 'That email is already on the desk.');
    }
    const created = await prisma.adminAccount.create({
      data: { id: nid('adm'), name, email, role, passwordHash: hashPassword(password), mustChangePassword: true },
    });
    await audit(actor, 'admin.create', 'admin', created.id, undefined, { email, role }, request);
    return json({ admin: publicAdmin(toRecord(created)) }, 201);
  } catch (error) {
    return fail(error);
  }
}
