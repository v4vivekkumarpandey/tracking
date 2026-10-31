import { inflateRawSync } from 'node:zlib';

// Reads the first sheet of a CSV or .xlsx upload into rows of strings.
// No dependency: .xlsx is a zip of XML files, and Node's zlib inflates it.

export const MAX_UNZIPPED = 20 * 1024 * 1024;

/** Undo the formula guard lib/csv.ts adds on export ('=x → =x stays text here anyway). */
const unguard = (s: string) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);

/** RFC 4180 CSV; detects , ; or tab as the delimiter (European Excel saves with ;). */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const outside = firstLine.replace(/"[^"]*"/g, '');
  const counts = [',', ';', '\t'].map((d) => [d, outside.split(d).length - 1] as const);
  const delim = counts.reduce((a, b) => (b[1] > a[1] ? b : a))[0];

  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return tidy(rows);
}

function zipEntries(buf: Buffer): Map<string, () => Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This is not a valid .xlsx file.');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, () => Buffer>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('This is not a valid .xlsx file.');
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    out.set(name, () => {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data, { maxOutputLength: MAX_UNZIPPED });
      throw new Error('Unsupported .xlsx compression.');
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const decode = (s: string) => s
  .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
    : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[e.toLowerCase()]);

/** All <t> text of a string item, without phonetic runs. */
const textOf = (xml: string) =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');

const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export function parseXlsx(buf: Buffer): string[][] {
  const zip = zipEntries(buf);
  const read = (name: string) => zip.get(name)?.().toString('utf8');

  let sheetPath = 'xl/worksheets/sheet1.xml';
  const rid = read('xl/workbook.xml')?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const rels = read('xl/_rels/workbook.xml.rels');
  if (rid && rels) {
    const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${rid}"`));
    const target = rel?.match(/Target="([^"]+)"/)?.[1];
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  const sheet = read(sheetPath);
  if (!sheet) throw new Error('The .xlsx file has no worksheet.');
  const shared = [...(read('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));

  const rows: string[][] = [];
  for (const rm of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(rm[1].match(/\br="(\d+)"/)?.[1] ?? rows.length + 1) - 1;
    const cells: string[] = [];
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], body = cm[2] ?? '';
      const ref = attrs.match(/\br="([A-Z]+\d*)"/)?.[1];
      const type = attrs.match(/\bt="(\w+)"/)?.[1] ?? 'n';
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let val = '';
      if (type === 's') val = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') val = textOf(body);
      else if (type === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else if (type === 'str' || type === 'e') val = v !== undefined ? decode(v) : '';
      else if (v !== undefined) val = String(Number(Number(v).toPrecision(15))); // 32.499999999 → 32.5
      cells[ref ? colIndex(ref) : cells.length] = val;
    }
    rows[r] = Array.from(cells, (c) => c ?? '');
  }
  return tidy(Array.from(rows, (r) => r ?? []));
}

/** Drop empty rows, pad to the header width, undo the export formula guard. */
function tidy(rows: string[][]): string[][] {
  const kept = rows.filter((r) => r.some((c) => c.trim() !== ''));
  const width = Math.max(0, ...kept.map((r) => r.length));
  return kept.map((r) => Array.from({ length: width }, (_, i) => unguard(r[i] ?? '')));
}

/** CSV or .xlsx by content (an .xlsx file is a zip, starting with "PK"). */
export function readSheet(buf: Buffer): string[][] {
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    try {
      return parseXlsx(buf);
    } catch (e) {
      // Truncated or damaged zip: out-of-range reads, inflate errors.
      if (e instanceof RangeError || (e as { code?: string }).code?.startsWith('Z_') || (e as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') {
        throw new Error('This .xlsx file is damaged or too large. Re-save it in Excel, or upload a CSV.');
      }
      throw e;
    }
  }
  if (buf[0] === 0xd0 && buf[1] === 0xcf) throw new Error('Old .xls files aren\'t supported. In Excel use Save As → .xlsx or CSV.');
  return parseCsv(buf.toString('utf8'));
}
