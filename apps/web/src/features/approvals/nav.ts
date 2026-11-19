import { ClipboardCheck } from 'lucide-react';

export const adminNav = [
  {
    to: '/admin/approvals', labelKey: 'approvals:nav.title', icon: ClipboardCheck, group: 'overview' as const, order: 1,
    perm: ['registrations.approve', 'logins.approve', 'businesses.approve', 'ads.approve', 'ads.manage', 'payments.verify'],
  },
];
