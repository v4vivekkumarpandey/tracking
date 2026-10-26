import path from 'node:path';
import maxmind, { type CountryResponse, type Reader } from 'maxmind';

// Visitor country from the bundled DB-IP Lite database (CC BY 4.0,
// https://db-ip.com). Refresh monthly with scripts/update-geoip.mjs.
// On custom domains the Cloudflare Worker already sends the country.

let reader: Promise<Reader<CountryResponse> | null> | undefined;

function open() {
  return (reader ??= maxmind
    .open<CountryResponse>(path.join(process.cwd(), 'data', 'dbip-country-lite.mmdb'))
    .catch((e) => {
      console.error('geo database unavailable', e);
      return null;
    }));
}

/** ISO country code ("US") or "" if unknown. Never throws. */
export async function countryOf(ip: string): Promise<string> {
  if (!ip) return '';
  try {
    const r = await open();
    return (r?.get(ip)?.country?.iso_code ?? '').toUpperCase();
  } catch {
    return '';
  }
}
