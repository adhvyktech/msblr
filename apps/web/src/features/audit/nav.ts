import { History } from 'lucide-react';

export const adminNav = [{ to: '/admin/audit', labelKey: 'audit:nav.title', icon: History, perm: 'audit.view', group: 'control' as const, order: 20 }];
