import type { RouteObject } from 'react-router-dom';
import { RequirePerm } from '@/lib/guards';
import Reports from './pages/Reports';

export const adminRoutes: RouteObject[] = [
  { path: 'reports', element: <RequirePerm perm="reports.view"><Reports /></RequirePerm> },
];
