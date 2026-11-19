import type { RouteObject } from 'react-router-dom';
import Approvals from './pages/Approvals';

export const adminRoutes: RouteObject[] = [{ path: 'approvals', element: <Approvals /> }];
