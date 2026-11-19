import type { RouteObject } from 'react-router-dom';
import { RequirePerm } from '@/lib/guards';
import ActivityLog from './pages/ActivityLog';

export const adminRoutes: RouteObject[] = [
  { path: 'audit', element: <RequirePerm perm="audit.view"><ActivityLog /></RequirePerm> },
];
