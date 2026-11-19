import ExcelJS from 'exceljs';

export interface Column<T = Record<string, unknown>> {
  header: string;
  key: keyof T & string;
  width?: number;
  /** Optional formatter for csv/xlsx cell value. */
  format?: (v: unknown, row: T) => string | number | Date | null;
}

/** toXlsx(rows, columns, 'Receipts') -> Buffer (.xlsx). */
export async function toXlsx<T extends Record<string, unknown>>(rows: T[], columns: Column<T>[], sheetName = 'Sheet1'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 4) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of rows) {
    const o: Record<string, unknown> = {};
    for (const c of columns) o[c.key] = c.format ? c.format(r[c.key], r) : r[c.key];
    ws.addRow(o);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const esc = (v: unknown) => {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@]/.test(s) && typeof v === 'string') s = `'${s}`; // neutralise spreadsheet formula injection
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** toCsv(rows, columns) -> string with UTF-8 BOM so Excel opens Hindi correctly. */
export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: Column<T>[]): string {
  const head = columns.map((c) => esc(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(c.format ? c.format(r[c.key], r) : r[c.key])).join(','));
  return '﻿' + [head, ...body].join('\r\n');
}
