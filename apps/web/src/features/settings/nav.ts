import { Settings } from 'lucide-react';

export const adminNav = [{ to: '/admin/settings', labelKey: 'settings:nav.title', icon: Settings, perm: 'settings.edit', group: 'control' as const, order: 40 }];
