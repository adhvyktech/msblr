import type { RouteObject } from 'react-router-dom';
import About from './pages/About';
import PublicEvents from './pages/PublicEvents';
import TrustsInfo from './pages/TrustsInfo';
import { Privacy, Terms } from './pages/Legal';

// "/" itself is handled by RootGate in app/router.tsx (public landing vs member home).
export const publicRoutes: RouteObject[] = [
  { path: 'about', element: <About /> },
  { path: 'public-events', element: <PublicEvents /> },
  { path: 'trusts-info', element: <TrustsInfo /> },
  { path: 'privacy', element: <Privacy /> },
  { path: 'terms', element: <Terms /> },
];
