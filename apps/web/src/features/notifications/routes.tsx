import type { RouteObject } from 'react-router-dom';
import { RequirePerm } from '@/lib/guards';
import Inbox from './pages/Inbox';
import Composer from './admin/Composer';

export const memberRoutes: RouteObject[] = [{ path: 'notifications', element: <Inbox /> }];

export const adminRoutes: RouteObject[] = [
  { path: 'notifications', element: <RequirePerm perm="notifications.send"><Composer /></RequirePerm> },
];
