import type { RouteObject } from 'react-router-dom';
import { RequirePerm } from '@/lib/guards';
import Settings from './pages/Settings';

export const adminRoutes: RouteObject[] = [
  { path: 'settings', element: <RequirePerm perm="settings.edit"><Settings /></RequirePerm> },
];
