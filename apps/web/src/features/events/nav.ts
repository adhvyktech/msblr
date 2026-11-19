import { CalendarDays, Images, Megaphone, PanelTop } from 'lucide-react';

export const adminNav = [
  { to: '/admin/events', labelKey: 'events:nav.events', icon: CalendarDays, perm: 'events.post', group: 'content' as const, order: 10 },
  { to: '/admin/highlights', labelKey: 'events:nav.highlights', icon: Images, perm: 'highlights.post', group: 'content' as const, order: 20 },
  { to: '/admin/announcements', labelKey: 'events:nav.announcements', icon: Megaphone, perm: 'events.post', group: 'content' as const, order: 30 },
  { to: '/admin/banners', labelKey: 'events:nav.banners', icon: PanelTop, perm: 'banners.edit', group: 'content' as const, order: 40 },
];
