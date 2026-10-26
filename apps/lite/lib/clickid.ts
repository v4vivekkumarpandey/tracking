// Signed click IDs, byte-for-byte the same format as the Go tracker
// (services/go/internal/clickid): ULID + uvarint(offer, publisher, link) +
// 8-byte HMAC-SHA256, base32 without padding, lowercase. With the same
// CLICK_SECRET, IDs from either version verify in the other.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type Click = { offerId: number; publisherId: number; linkId: number; time: Date };

const MAC_LEN = 8;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function b32encode(buf: Uint8Array): string {
  let out = '';
  let bits = 0;
  let val = 0;
  for (const b of buf) {
    val = (val << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
    val &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(val << (5 - bits)) & 31];
  return out;
}

function b32decode(s: string): Buffer | null {
  const out: number[] = [];
  let bits = 0;
  let val = 0;
  for (const ch of s) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) return null;
    val = (val << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
    val &= (1 << bits) - 1;
  }
  return Buffer.from(out);
}

function putUvarint(out: number[], n: number) {
  while (n >= 0x80) {
    out.push((n % 0x80) | 0x80);
    n = Math.floor(n / 0x80);
  }
  out.push(n);
}

function readUvarint(buf: Buffer, pos: number): [number, number] | null {
  let n = 0;
  let mul = 1;
  for (let i = pos; i < buf.length && i < pos + 9; i++) {
    const b = buf[i];
    n += (b & 0x7f) * mul;
    if (b < 0x80) return [n, i + 1];
    mul *= 0x80;
  }
  return null;
}

function secret(): string {
  const s = process.env.CLICK_SECRET ?? '';
  if (s.length < 16) throw new Error('CLICK_SECRET must be at least 16 characters');
  return s;
}

function mac(body: Uint8Array, key = secret()): Buffer {
  return createHmac('sha256', key).update(body).digest().subarray(0, MAC_LEN);
}

export function newClickId(offerId: number, publisherId: number, linkId: number, now = new Date(), key?: string): string {
  const ulid = Buffer.alloc(16);
  ulid.writeUIntBE(now.getTime(), 0, 6);
  randomBytes(10).copy(ulid, 6);
  const tail: number[] = [];
  putUvarint(tail, offerId);
  putUvarint(tail, publisherId);
  putUvarint(tail, linkId);
  const body = Buffer.concat([ulid, Buffer.from(tail)]);
  return b32encode(Buffer.concat([body, mac(body, key)])).toLowerCase();
}

/** Returns null for malformed or forged IDs. */
export function parseClickId(id: string, key?: string): Click | null {
  const raw = b32decode(id.toUpperCase());
  if (!raw || raw.length < 16 + 3 + MAC_LEN) return null;
  const body = raw.subarray(0, raw.length - MAC_LEN);
  const sig = raw.subarray(raw.length - MAC_LEN);
  if (!timingSafeEqual(sig, mac(body, key))) return null;

  const vals: number[] = [];
  let pos = 16;
  for (let i = 0; i < 3; i++) {
    const r = readUvarint(body, pos);
    if (!r) return null;
    vals.push(r[0]);
    pos = r[1];
  }
  if (pos !== body.length) return null;
  return { offerId: vals[0], publisherId: vals[1], linkId: vals[2], time: new Date(body.readUIntBE(0, 6)) };
}
