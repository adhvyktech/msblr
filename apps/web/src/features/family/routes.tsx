import type { RouteObject } from 'react-router-dom';
import { RequirePerm } from '@/lib/guards';
import MyFamily from './MyFamily';
import LoginRequests from './LoginRequests';

export const memberRoutes: RouteObject[] = [{ path: 'me/family', element: <MyFamily /> }];
export const adminRoutes: RouteObject[] = [
  { path: 'logins', element: <RequirePerm perm="logins.approve"><LoginRequests /></RequirePerm> },
];
