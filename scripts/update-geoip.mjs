// Downloads the latest free DB-IP Lite databases into apps/lite/data:
// country (visitor country) and ASN (network, for data-center detection).
// DB-IP publishes new files each month (CC BY 4.0, https://db-ip.com).
//   node scripts/update-geoip.mjs
// then commit apps/lite/data/*.mmdb and push.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'lite', 'data');
const month = (offset) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - offset);
  return d.toISOString().slice(0, 7);
};

async function update(kind) {
  for (const m of [month(0), month(1)]) { // early in the month the new file may not exist yet
    const url = `https://download.db-ip.com/free/dbip-${kind}-lite-${m}.mmdb.gz`;
    const res = await fetch(url);
    if (!res.ok) { console.log(`${url} -> ${res.status}, trying previous month`); continue; }
    const data = gunzipSync(Buffer.from(await res.arrayBuffer()));
    if (data.length < 1_000_000) throw new Error(`Downloaded ${kind} file looks too small; not replacing.`);
    const out = join(dir, `dbip-${kind}-lite.mmdb`);
    writeFileSync(out, data);
    console.log(`Saved ${kind} ${m} (${(data.length / 1048576).toFixed(1)} MB) to ${out}`);
    return;
  }
  throw new Error(`Could not download the DB-IP Lite ${kind} database.`);
}

await update('country');
await update('asn');
