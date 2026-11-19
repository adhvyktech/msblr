import { Megaphone } from 'lucide-react';

export const adminNav = [
  { to: '/admin/ads', labelKey: 'ads:nav.title', icon: Megaphone, perm: ['ads.manage', 'ads.approve'], group: 'content' as const, order: 40 },
];
