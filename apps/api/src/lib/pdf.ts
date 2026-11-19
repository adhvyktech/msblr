import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FONT_DIR = path.resolve(here, '../../assets/fonts');

/** Font names registered on every document: Noto (latin), Noto-Bold, NotoDeva (Hindi), NotoDeva-Bold. */
export const FONTS = {
  regular: 'Noto',
  bold: 'Noto-Bold',
  deva: 'NotoDeva',
  devaBold: 'NotoDeva-Bold',
} as const;

export function createPdf(opts: PDFKit.PDFDocumentOptions = {}): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'A4', margin: 40, ...opts });
  doc.registerFont(FONTS.regular, path.join(FONT_DIR, 'NotoSans-Regular.ttf'));
  doc.registerFont(FONTS.bold, path.join(FONT_DIR, 'NotoSans-Bold.ttf'));
  doc.registerFont(FONTS.deva, path.join(FONT_DIR, 'NotoSansDevanagari-Regular.ttf'));
  doc.registerFont(FONTS.devaBold, path.join(FONT_DIR, 'NotoSansDevanagari-Bold.ttf'));
  doc.font(FONTS.regular);
  return doc;
}

/** Pick the right font for a string (Devanagari vs Latin) — pass bold=true for headings. */
export const fontFor = (text: string, bold = false) =>
  /[ऀ-ॿ]/.test(text) ? (bold ? FONTS.devaBold : FONTS.deva) : bold ? FONTS.bold : FONTS.regular;

/** Draw text choosing the font per string. */
export function text(doc: PDFKit.PDFDocument, s: string, x: number, y: number, o: PDFKit.Mixins.TextOptions & { bold?: boolean; size?: number } = {}) {
  const { bold, size, ...rest } = o;
  doc.font(fontFor(s, bold));
  if (size) doc.fontSize(size);
  return doc.text(s, x, y, rest);
}

/** renderPdf(doc => { doc.text('hi') }) -> Buffer. Handles end() and collects the output. */
export function renderPdf(draw: (doc: PDFKit.PDFDocument) => void | Promise<void>, opts: PDFKit.PDFDocumentOptions = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = createPdf(opts);
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    Promise.resolve(draw(doc)).then(() => doc.end(), reject);
  });
}
