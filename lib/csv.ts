// CSV writer: RFC 4180 quoting, a UTF-8 BOM so Excel detects the encoding,
// and protection against spreadsheet formula injection (a cell starting with
// = + - @ is prefixed with ' so Excel shows it as text instead of running it).

export type Column<T> = { header: string; value: (row: T) => string | number | null | undefined };

export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], cols: Column<T>[]): string {
  const lines = [cols.map((c) => csvCell(c.header)).join(',')];
  for (const r of rows) lines.push(cols.map((c) => csvCell(c.value(r))).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
