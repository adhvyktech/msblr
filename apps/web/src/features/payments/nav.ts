import { CalendarCheck, Wallet } from 'lucide-react';
import type { AdminNavItem } from '@/components/layout/AdminLayout';

export const adminNav: AdminNavItem[] = [
  { to: '/admin/payments', labelKey: 'payments:nav.title', icon: Wallet, perm: 'payments.verify', group: 'people', order: 30 },
  { to: '/admin/subscriptions', labelKey: 'payments:nav.subscriptions', icon: CalendarCheck, perm: 'payments.verify', group: 'people', order: 32 },
];
