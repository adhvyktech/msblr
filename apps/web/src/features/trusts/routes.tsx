import type { RouteObject } from 'react-router-dom';
import { RequirePerm } from '@/lib/guards';
import Trusts from './pages/Trusts';
import AdminTrusts from './pages/AdminTrusts';

export const memberRoutes: RouteObject[] = [{ path: 'trusts', element: <Trusts /> }];
export const adminRoutes: RouteObject[] = [{ path: 'trusts', element: <RequirePerm perm="trusts.edit"><AdminTrusts /></RequirePerm> }];
