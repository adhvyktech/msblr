import dayjs from 'dayjs';
import 'dayjs/locale/hi';
import i18n from '@/app/i18n';

const loc = () => (i18n.language?.startsWith('hi') ? 'hi' : 'en');

export const fmtDate = (d?: string | Date | null, f = 'D MMM YYYY') => (d ? dayjs(d).locale(loc()).format(f) : '—');
export const fmtDateTime = (d?: string | Date | null) => (d ? dayjs(d).locale(loc()).format('D MMM YYYY, h:mm A') : '—');
export const fmtTime = (d?: string | Date | null) => (d ? dayjs(d).locale(loc()).format('h:mm A') : '—');
export const fmtNumber = (n?: number | null) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('en-IN').format(n));
export const fmtINR = (n?: number | string | null) =>
  n === null || n === undefined || n === '' ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n));

export const initials = (name?: string | null) =>
  (name ?? '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';

export const formatMobile = (m?: string | null) => (m && m.length === 10 ? `+91 ${m.slice(0, 5)} ${m.slice(5)}` : m ?? '');
export const whatsappLink = (mobile: string, text?: string) => `https://wa.me/91${mobile.replace(/\D/g, '').slice(-10)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

/** Indian financial year label, e.g. "26-27" */
export function fyOf(date: Date | string = new Date()): string {
  const d = new Date(date);
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${String(y % 100).padStart(2, '0')}-${String((y + 1) % 100).padStart(2, '0')}`;
}
