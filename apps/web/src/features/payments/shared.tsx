import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useT } from '@/lib/useT';
import { ApiError } from '@/lib/api';

export function BackLink({ to, label }: { to: string; label?: string }) {
  const { tc } = useT('payments');
  return (
    <Link to={to} className="mb-2 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary">
      <ArrowLeft size={18} aria-hidden />{label ?? tc('actions.back')}
    </Link>
  );
}

/** true when the viewport matches (e.g. '(min-width: 1024px)'). */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [m, setM] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}

/** upi://pay deep link built from the API's UPI details. */
export function upiLink(u: { id: string; payeeName: string; note: string }, amount?: number): string {
  const q = [`pa=${encodeURIComponent(u.id)}`, `pn=${encodeURIComponent(u.payeeName)}`, ...(amount && amount > 0 ? [`am=${amount.toFixed(2)}`] : []), 'cu=INR', `tn=${encodeURIComponent(u.note)}`];
  return `upi://pay?${q.join('&')}`;
}

export const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError || e instanceof Error ? e.message : fallback);

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
