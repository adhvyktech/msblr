import { BellRing } from 'lucide-react';

export const adminNav = [
  { to: '/admin/notifications', labelKey: 'notifications:nav.title', icon: BellRing, perm: 'notifications.send', group: 'content' as const, order: 50 },
];
