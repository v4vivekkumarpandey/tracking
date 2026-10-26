import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

// scrypt parameters: N=2^15 is ~50ms per hash, slow enough to resist
// guessing, fast enough for a login on shared hosting.
const N = 32768, R = 8, P = 1, LEN = 32;
const OPTS = { N, r: R, p: P, maxmem: 64 * 1024 * 1024 };

export const MIN_PASSWORD = 10;

/** Format: scrypt$N$r$p$salt$hash (base64). */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(pw, salt, LEN, OPTS);
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = await scryptAsync(pw, Buffer.from(salt, 'base64'), want.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
  });
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Readable temporary password for admin resets, e.g. "k7Qm-pX3z-Wn9c". */
export function tempPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const s = Array.from(randomBytes(12), (b) => chars[b % chars.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
