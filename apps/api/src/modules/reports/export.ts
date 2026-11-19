import type { FastifyReply } from 'fastify';
import { toCsv, toXlsx, type Column } from '../../lib/excel';
import { renderPdf, text, FONTS } from '../../lib/pdf';
import { httpError } from '../../lib/errors';

export interface ReportColumn {
  key: string;
  header: string;
  /** numeric columns are right-aligned in PDF */
  num?: boolean;
}
export type ReportRow = Record<string, string | number | boolean | null>;
export type ReportTotals = Record<string, string | number>;

export const FORMATS = ['json', 'xlsx', 'csv', 'pdf'] as const;
export type ReportFormat = (typeof FORMATS)[number];

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** rows (+ optional totals row as the last line) as flat export rows */
function withTotals(cols: ReportColumn[], rows: ReportRow[], totals?: ReportTotals): ReportRow[] {
  if (!totals || !Object.keys(totals).length) return rows;
  const t: ReportRow = {};
  for (const c of cols) t[c.key] = totals[c.key] ?? null;
  const first = cols[0]!.key;
  if (t[first] === null) t[first] = 'Total';
  return [...rows, t];
}

export function tablePdf(title: string, subtitle: string, cols: ReportColumn[], rows: ReportRow[]): Promise<Buffer> {
  return renderPdf(
    (doc) => {
      const M = 30;
      const W = doc.page.width - M * 2;
      const sample = rows.slice(0, 300);
      const lens = cols.map((c) => Math.min(38, Math.max(c.header.length, 5, ...sample.map((r) => String(r[c.key] ?? '').length))));
      const sum = lens.reduce((a, b) => a + b, 0);
      const widths = lens.map((l) => (W * l) / sum);
      const rowH = 16;
      const bottom = doc.page.height - 44;
      const header = (y: number) => {
        doc.save().rect(M, y, W, rowH + 2).fill('#EFE7DA').restore();
        let x = M;
        cols.forEach((c, i) => {
          doc.fillColor('#2D2620');
          text(doc, c.header, x + 3, y + 4, { bold: true, size: 8, width: widths[i]! - 6, height: 10, ellipsis: true, align: c.num ? 'right' : 'left' });
          x += widths[i]!;
        });
        return y + rowH + 4;
      };
      doc.fillColor('#2D2620');
      text(doc, title, M, M, { bold: true, size: 15 });
      doc.fillColor('#857767');
      text(doc, subtitle, M, M + 22, { size: 8.5 });
      let y = header(M + 42);
      rows.forEach((r, ri) => {
        if (y + rowH > bottom) {
          doc.addPage();
          y = header(M);
        }
        if (ri % 2 === 1) doc.save().rect(M, y - 2, W, rowH).fill('#FAF6EE').restore();
        let x = M;
        cols.forEach((c, i) => {
          doc.fillColor('#2D2620');
          text(doc, String(r[c.key] ?? ''), x + 3, y + 1, { size: 8, width: widths[i]! - 6, height: 10, ellipsis: true, align: c.num ? 'right' : 'left' });
          x += widths[i]!;
        });
        y += rowH;
      });
      if (!rows.length) {
        doc.fillColor('#857767');
        text(doc, 'No records', M, y + 6, { size: 10 });
      }
      doc.fillColor('#857767').font(FONTS.regular).fontSize(7).text(`Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC - MSBLR E-Directory`, M, doc.page.height - 30, { lineBreak: false });
    },
    { size: 'A4', layout: 'landscape', margin: 30 },
  );
}

/** Streams a table in the requested format. format json is handled by callers. */
export async function sendTable(
  reply: FastifyReply,
  format: Exclude<ReportFormat, 'json'>,
  o: { filename: string; title: string; subtitle?: string; columns: ReportColumn[]; rows: ReportRow[]; totals?: ReportTotals },
) {
  const flat = withTotals(o.columns, o.rows, o.totals);
  const cols: Column<ReportRow>[] = o.columns.map((c) => ({ key: c.key, header: c.header, width: c.num ? 14 : Math.max(14, Math.min(40, c.header.length + 8)) }));
  const disp = (ext: string) => `attachment; filename="${o.filename}.${ext}"`;
  if (format === 'xlsx') {
    const buf = await toXlsx(flat, cols, o.title);
    return reply.header('content-type', XLSX_MIME).header('content-disposition', disp('xlsx')).send(buf);
  }
  if (format === 'csv') {
    return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', disp('csv')).send(toCsv(flat, cols));
  }
  if (format === 'pdf') {
    const buf = await tablePdf(o.title, o.subtitle ?? '', o.columns, flat);
    return reply.header('content-type', 'application/pdf').header('content-disposition', disp('pdf')).send(buf);
  }
  throw httpError(400, 'VALIDATION_ERROR', 'Unknown export format');
}
