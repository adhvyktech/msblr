import type { RouteObject } from 'react-router-dom';
import Privacy from './Privacy';

export const memberRoutes: RouteObject[] = [{ path: 'me/privacy', element: <Privacy /> }];
