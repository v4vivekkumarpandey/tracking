// Signed session cookie: base64url(email).expiry.hmac
// Uses Web Crypto only, so it runs in both Node and the Edge runtime.

export const SESSION_COOKIE = 'trk_session';
const enc = new TextEncoder();

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET must be at least 16 characters');
  return s;
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

async function sign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export async function createSession(email: string): Promise<string> {
  const body = `${b64url(enc.encode(email))}.${Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS}`;
  return `${body}.${await sign(body)}`;
}

/** Returns the signed-in email, or null. */
export async function verifySession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const body = token.slice(0, i);
  if (!safeEqual(token.slice(i + 1), await sign(body))) return null;
  const [email, exp] = body.split('.');
  if (!email || !exp || Number(exp) < Date.now() / 1000) return null;
  try {
    return fromB64url(email);
  } catch {
    return null;
  }
}
