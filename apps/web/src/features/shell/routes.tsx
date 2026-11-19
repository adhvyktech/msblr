import type { RouteObject } from 'react-router-dom';
import Home from './pages/Home';
import Me from './pages/Me';
import AdminHome from './pages/AdminHome';

// Placeholders are dropped automatically when the Content / Admin features define the real index route.
export const memberRoutes: RouteObject[] = [
  { index: true, element: <Home />, handle: { placeholder: true } },
  { path: 'me', element: <Me /> },
];
export const adminRoutes: RouteObject[] = [{ index: true, element: <AdminHome />, handle: { placeholder: true } }];
