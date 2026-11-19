import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { MemberLayout } from '@/components/layout/MemberLayout';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { RequireAuth, RequireStaff } from '@/lib/guards';
import NotFound from '@/features/shell/pages/NotFound';

/**
 * Every features/<name>/routes.tsx may export any of:
 *   memberRoutes — logged-in member area (inside MemberLayout), absolute-looking paths without leading slash ('members', 'members/:id')
 *   adminRoutes  — staff area, mounted under /admin (paths relative to /admin: 'payments')
 *   publicRoutes — public pages inside PublicLayout (e.g. 'register')
 *   authRoutes   — public pages inside the centered AuthLayout (login)
 * A route with handle: { placeholder: true } is dropped when another feature defines the same path/index.
 */
interface FeatureRoutes {
  memberRoutes?: RouteObject[];
  adminRoutes?: RouteObject[];
  publicRoutes?: RouteObject[];
  authRoutes?: RouteObject[];
}
const mods = import.meta.glob('../features/*/routes.tsx', { eager: true }) as Record<string, FeatureRoutes>;

const key = (r: RouteObject) => (r.index ? '(index)' : r.path ?? '');
const isPlaceholder = (r: RouteObject) => !!(r.handle as { placeholder?: boolean } | undefined)?.placeholder;

function collect(kind: keyof FeatureRoutes): RouteObject[] {
  const all = Object.keys(mods).sort().flatMap((p) => mods[p]![kind] ?? []);
  const real = new Set(all.filter((r) => !isPlaceholder(r)).map(key));
  return all.filter((r) => !isPlaceholder(r) || !real.has(key(r)));
}

export const router = createBrowserRouter([
  { element: <AuthLayout />, children: collect('authRoutes') },
  { element: <PublicLayout />, children: collect('publicRoutes') },
  { element: <RequireAuth />, children: [{ element: <MemberLayout />, children: collect('memberRoutes') }] },
  {
    path: '/admin',
    element: <RequireAuth><RequireStaff><AdminLayout /></RequireStaff></RequireAuth>,
    children: collect('adminRoutes'),
  },
  { path: '*', element: <NotFound /> },
]);
