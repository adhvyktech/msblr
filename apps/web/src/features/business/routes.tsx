import type { RouteObject } from 'react-router-dom';
import { RequireHead, RequirePerm } from '@/lib/guards';
import BusinessList from './pages/BusinessList';
import BusinessDetail from './pages/BusinessDetail';
import MyBusinesses from './pages/MyBusinesses';
import AdminBusinesses from './pages/AdminBusinesses';

export const memberRoutes: RouteObject[] = [
  { path: 'business', element: <BusinessList /> },
  { path: 'business/:id', element: <BusinessDetail /> },
  { path: 'me/business', element: <RequireHead><MyBusinesses /></RequireHead> },
];
export const adminRoutes: RouteObject[] = [
  { path: 'businesses', element: <RequirePerm perm="businesses.approve"><AdminBusinesses /></RequirePerm> },
];
