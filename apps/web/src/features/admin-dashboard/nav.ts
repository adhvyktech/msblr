import { LayoutDashboard } from 'lucide-react';

export const adminNav = [
  { to: '/admin/dashboard', labelKey: 'admin-dashboard:nav.title', icon: LayoutDashboard, perm: 'dashboard.view', group: 'overview' as const, order: 0 },
];
