import { KeyRound } from 'lucide-react';

export const adminNav = [{ to: '/admin/roles', labelKey: 'roles:nav.title', icon: KeyRound, perm: 'roles.manage', group: 'control' as const, order: 30 }];
