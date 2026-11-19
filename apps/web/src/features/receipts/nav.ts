import { ReceiptText } from 'lucide-react';
import type { AdminNavItem } from '@/components/layout/AdminLayout';

export const adminNav: AdminNavItem[] = [
  { to: '/admin/receipts', labelKey: 'receipts:nav.title', icon: ReceiptText, perm: 'receipts.view', group: 'people', order: 31 },
];
