// Downloads the latest free DB-IP Lite country database into apps/lite/data.
// DB-IP publishes a new file each month (CC BY 4.0, https://db-ip.com).
//   node scripts/update-geoip.mjs
// then commit apps/lite/data/dbip-country-lite.mmdb and push.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'lite', 'data', 'dbip-country-lite.mmdb');
const month = (offset) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - offset);
  return d.toISOString().slice(0, 7);
};

for (const m of [month(0), month(1)]) { // early in the month the new file may not exist yet
  const url = `https://download.db-ip.com/free/dbip-country-lite-${m}.mmdb.gz`;
  const res = await fetch(url);
  if (!res.ok) { console.log(`${url} -> ${res.status}, trying previous month`); continue; }
  const data = gunzipSync(Buffer.from(await res.arrayBuffer()));
  if (data.length < 1_000_000) throw new Error('Downloaded file looks too small; not replacing.');
  writeFileSync(out, data);
  console.log(`Saved ${m} (${(data.length / 1048576).toFixed(1)} MB) to ${out}`);
  process.exit(0);
}
throw new Error('Could not download the DB-IP Lite database.');
