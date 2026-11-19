import type { RouteObject } from 'react-router-dom';
import { RequirePerm } from '@/lib/guards';
import Roles from './pages/Roles';

export const adminRoutes: RouteObject[] = [
  { path: 'roles', element: <RequirePerm perm="roles.manage"><Roles /></RequirePerm> },
];
