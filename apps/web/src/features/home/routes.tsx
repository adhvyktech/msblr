import type { RouteObject } from 'react-router-dom';
import Home from './pages/Home';

// Replaces the shell placeholder index route.
export const memberRoutes: RouteObject[] = [{ index: true, element: <Home /> }];
