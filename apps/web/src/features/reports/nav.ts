import { FileBarChart } from 'lucide-react';

export const adminNav = [{ to: '/admin/reports', labelKey: 'reports:nav.title', icon: FileBarChart, perm: 'reports.view', group: 'control' as const, order: 10 }];
