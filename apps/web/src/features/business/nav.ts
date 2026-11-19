import { Briefcase } from 'lucide-react';

export const adminNav = [{ to: '/admin/businesses', labelKey: 'business:nav.title', icon: Briefcase, perm: 'businesses.approve', group: 'people' as const, order: 30 }];
