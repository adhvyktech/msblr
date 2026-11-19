import { Phone } from 'lucide-react';

export const adminNav = [{ to: '/admin/contacts', labelKey: 'contacts:nav.title', icon: Phone, perm: 'contacts.edit', group: 'content' as const, order: 60 }];
