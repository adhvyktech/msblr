import type { RouteObject } from 'react-router-dom';
import { RequirePerm } from '@/lib/guards';
import { EventDetailPage, Events, HighlightDetailPage, Highlights } from './pages/MemberPages';
import AdminEvents from './pages/AdminEvents';
import AdminHighlights from './pages/AdminHighlights';
import AdminAnnouncements from './pages/AdminAnnouncements';
import AdminBanners from './pages/AdminBanners';

export const memberRoutes: RouteObject[] = [
  { path: 'events', element: <Events /> },
  { path: 'events/:id', element: <EventDetailPage /> },
  { path: 'highlights', element: <Highlights /> },
  { path: 'highlights/:id', element: <HighlightDetailPage /> },
];
export const adminRoutes: RouteObject[] = [
  { path: 'events', element: <RequirePerm perm="events.post"><AdminEvents /></RequirePerm> },
  { path: 'highlights', element: <RequirePerm perm="highlights.post"><AdminHighlights /></RequirePerm> },
  { path: 'announcements', element: <RequirePerm perm="events.post"><AdminAnnouncements /></RequirePerm> },
  { path: 'banners', element: <RequirePerm perm="banners.edit"><AdminBanners /></RequirePerm> },
];
