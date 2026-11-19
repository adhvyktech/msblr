import type { RouteObject } from 'react-router-dom';
import { RequirePerm } from '@/lib/guards';
import Register from './Register';
import RegisterStatus from './RegisterStatus';
import AdminRegistrations from './AdminRegistrations';

export const publicRoutes: RouteObject[] = [
  { path: 'register', element: <Register /> },
  { path: 'register/status', element: <RegisterStatus /> },
];
export const adminRoutes: RouteObject[] = [
  { path: 'registrations', element: <RequirePerm perm="registrations.approve"><AdminRegistrations /></RequirePerm> },
];
