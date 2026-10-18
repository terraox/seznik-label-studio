import bcrypt from 'bcryptjs';

const ROUNDS = 10;

/** Mobile app user passwords (Prisma AppUser). Desk admins use scrypt in passwords.ts. */
export async function hashAppPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyAppPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
