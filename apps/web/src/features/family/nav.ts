import { KeyRound } from 'lucide-react';
import type { AdminNavItem } from '@/components/layout/AdminLayout';

export const adminNav: AdminNavItem[] = [
  { to: '/admin/logins', labelKey: 'family:nav.title', icon: KeyRound, perm: 'logins.approve', group: 'people', order: 30 },
];
