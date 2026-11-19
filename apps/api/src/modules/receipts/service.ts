import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../../lib/prisma';
import { getSetting } from '../../lib/settings';
import { renderPdf, text } from '../../lib/pdf';
import { registerFileAccessRule, storeFile, absPath } from '../../lib/files';

const here = path.dirname(fileURLToPath(import.meta.url));
const LOGO = path.resolve(here, '../../../../web/public/brand/logo-orange.png');

// ---------- helpers ----------
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function below100(n: number): string {
  return n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}
function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? below100(r) : ''].filter(Boolean).join(' ');
}
/** Indian numbering words: 1100 -> "One Thousand One Hundred", 250000 -> "Two Lakh Fifty Thousand". */
export function intToWordsIndian(n: number): string {
  if (n === 0) return 'Zero';
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  return [
    crore ? `${intToWordsIndian(crore)} Crore` : '',
    lakh ? `${below100(lakh)} Lakh` : '',
    thousand ? `${below100(thousand)} Thousand` : '',
    rest ? below1000(rest) : '',
  ].filter(Boolean).join(' ');
}
/** amountInWords(1100.5) -> "Rupees One Thousand One Hundred and Fifty Paise Only" */
export function amountInWords(amount: number): string {
  const rupees = Math.floor(amount + 1e-9);
  const paise = Math.round((amount - rupees) * 100);
  const r = `Rupees ${intToWordsIndian(rupees)}`;
  return paise ? `${r} and ${intToWordsIndian(paise)} Paise Only` : `${r} Only`;
}

/** "26-27" -> "2026–27" */
export const fyLong = (fy: string) => `20${fy.slice(0, 2)}–${fy.slice(3)}`;

/** Payment/Receipt label for the period: "Subscription 2026–27" */
export const subscriptionLabel = (fy: string) => `Subscription ${fyLong(fy)}`;

export const inr = (n: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

// ---------- PDF ----------
const dmy = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

export async function buildReceiptPdf(r: { serialNo: string; issuedAt: Date; memberName: string; membershipNo?: string | null; amount: number; purpose: string; utr?: string | null; paidOn?: Date | null }) {
  const sabha = await getSetting<{ name?: string; nameHi?: string; address?: string; phone?: string; email?: string }>('sabha', {});
  return renderPdf((doc) => {
    const W = doc.page.width;
    const left = 50;
    const right = W - 50;
    let y = 45;
    if (fs.existsSync(LOGO)) {
      try { doc.image(LOGO, left, y, { height: 64 }); } catch { /* logo is optional */ }
    }
    const tx = left + 80;
    text(doc, sabha.name ?? 'Maheshwari Sabha, Bengaluru', tx, y + 2, { bold: true, size: 18, width: right - tx });
    if (sabha.nameHi) text(doc, sabha.nameHi, tx, y + 26, { size: 13, width: right - tx });
    const contact = [sabha.address, [sabha.phone, sabha.email].filter(Boolean).join('  |  ')].filter(Boolean).join('\n');
    if (contact) text(doc, contact, tx, y + 44, { size: 9, width: right - tx });
    y = 125;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(1.5).stroke();
    y += 18;
    text(doc, 'RECEIPT', left, y, { bold: true, size: 20 });
    text(doc, `Receipt No: ${r.serialNo}`, left, y + 4, { bold: true, size: 12, width: right - left, align: 'right' });
    text(doc, `Date: ${dmy(r.issuedAt)}`, left, y + 22, { size: 11, width: right - left, align: 'right' });
    y += 70;
    const row = (label: string, value: string, bold = false) => {
      text(doc, label, left, y, { size: 11, width: 130 });
      text(doc, value, left + 140, y, { size: 12, bold, width: right - left - 140 });
      y = Math.max(y + 22, doc.y + 8);
    };
    row('Received with thanks from', r.memberName, true);
    if (r.membershipNo) row('Membership No', r.membershipNo);
    row('Towards', r.purpose);
    row('Mode of payment', 'UPI');
    if (r.utr) row('UTR / Reference', r.utr);
    if (r.paidOn) row('Paid on', dmy(r.paidOn));
    y += 8;
    doc.roundedRect(left, y, right - left, 62, 6).lineWidth(1).stroke();
    text(doc, 'Amount', left + 14, y + 10, { size: 10 });
    text(doc, `Rs. ${inr(r.amount)}`, left + 14, y + 24, { bold: true, size: 20 });
    text(doc, amountInWords(r.amount), left + 200, y + 14, { size: 11, width: right - left - 214 });
    y += 90;
    text(doc, 'Computer generated receipt', left, y, { size: 9, bold: true, width: right - left, align: 'center' });
    text(doc, 'This receipt is generated by the system and does not require a signature.', left, y + 14, { size: 9, width: right - left, align: 'center' });
  });
}

/** Generates (or regenerates when missing on disk) the PDF for a receipt and links it. Returns the File row. */
export async function ensureReceiptPdf(receiptId: number, force = false) {
  const rc = await prisma.receipt.findUnique({ where: { id: receiptId }, include: { payment: true } });
  if (!rc) return null;
  if (rc.pdfFileId && !force) {
    const f = await prisma.file.findUnique({ where: { id: rc.pdfFileId } });
    if (f && fs.existsSync(absPath(f))) return f;
  }
  const fam = rc.familyId ? await prisma.family.findUnique({ where: { id: rc.familyId }, select: { membershipNo: true } }) : null;
  const buffer = await buildReceiptPdf({
    serialNo: rc.serialNo,
    issuedAt: rc.issuedAt,
    memberName: rc.memberName,
    membershipNo: fam?.membershipNo,
    amount: Number(rc.amount),
    purpose: rc.purpose,
    utr: rc.utr,
    paidOn: rc.payment?.paidOn,
  });
  const file = await storeFile({ buffer, filename: `${rc.serialNo.replace(/[^\w-]+/g, '-')}.pdf`, mime: 'application/pdf', kind: 'receipt_pdf', visibility: 'PRIVATE', ownerUserId: null });
  await prisma.receipt.update({ where: { id: rc.id }, data: { pdfFileId: file.id } });
  return file;
}

// ---------- access ----------
/** Does this user own the receipt (family member, payer, or the advertiser behind the payment)? */
export async function ownsReceipt(
  rc: { familyId: number | null; paymentId: number | null },
  user: { id: number; familyId: number | null; advertiserId: number | null },
): Promise<boolean> {
  if (rc.familyId && user.familyId === rc.familyId) return true;
  if (!rc.paymentId) return false;
  const p = await prisma.payment.findUnique({ where: { id: rc.paymentId }, select: { payerUserId: true, adRequest: { select: { advertiserId: true } } } });
  if (!p) return false;
  if (p.payerUserId === user.id) return true;
  return !!(user.advertiserId && p.adRequest?.advertiserId === user.advertiserId);
}

registerFileAccessRule(async (file, user) => {
  if (file.kind !== 'receipt_pdf') return false;
  const rc = await prisma.receipt.findFirst({ where: { pdfFileId: file.id }, select: { familyId: true, paymentId: true } });
  return rc ? ownsReceipt(rc, user) : false;
});
