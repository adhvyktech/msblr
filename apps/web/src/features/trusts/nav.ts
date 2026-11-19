import { Landmark } from 'lucide-react';

export const adminNav = [{ to: '/admin/trusts', labelKey: 'trusts:nav.title', icon: Landmark, perm: 'trusts.edit', group: 'content' as const, order: 50 }];
