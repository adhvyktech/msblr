import { Users } from 'lucide-react';
import type { AdminNavItem } from '@/components/layout/AdminLayout';

export const adminNav: AdminNavItem[] = [
  { to: '/admin/members', labelKey: 'members:nav.title', icon: Users, perm: ['members.view_private', 'members.edit'], group: 'people', order: 10 },
];
