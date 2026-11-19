/** Minimal RFC-4180 CSV parser: quoted fields, escaped quotes, CRLF/LF, UTF-8 BOM, tab or comma separated. */
export function parseCsv(input: string): string[][] {
  const s = input.replace(/^﻿/, '');
  const firstLine = s.split(/\r?\n/, 1)[0] ?? '';
  const sep = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      rows.push(row); row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r[0] ?? '').trim() !== '');
}
