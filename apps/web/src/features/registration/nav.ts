import { ClipboardCheck } from 'lucide-react';
import type { AdminNavItem } from '@/components/layout/AdminLayout';

export const adminNav: AdminNavItem[] = [
  { to: '/admin/registrations', labelKey: 'registration:nav.title', icon: ClipboardCheck, perm: 'registrations.approve', group: 'people', order: 20 },
];
