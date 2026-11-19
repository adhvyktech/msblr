import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from './auth';
import { Spinner } from '@/components/ui/States';
import { EmptyState } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';

function Loading() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg" role="status" aria-live="polite">
      <Spinner size={36} />
    </div>
  );
}

function Forbidden() {
  const { t } = useTranslation('common');
  return (
    <div className="mx-auto max-w-md p-6">
      <EmptyState
        icon={ShieldAlert}
        title={t('forbidden.title')}
        description={t('forbidden.body')}
        action={<Button variant="outline" onClick={() => history.back()}>{t('actions.back')}</Button>}
      />
    </div>
  );
}

/** Redirects anonymous visitors to /login?next=… */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status } = useAuth();
  const loc = useLocation();
  if (status === 'loading') return <Loading />;
  if (status === 'anon') return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children ?? <Outlet />}</>;
}

/** Any staff role (Admin panel). */
export function RequireStaff({ children }: { children?: ReactNode }) {
  const { status, isStaff } = useAuth();
  if (status === 'loading') return <Loading />;
  if (!isStaff) return <Forbidden />;
  return <>{children ?? <Outlet />}</>;
}

/** Any-of permission(s). Use inside adminRoutes: element: <RequirePerm perm="payments.verify"><Page/></RequirePerm> */
export function RequirePerm({ perm, children }: { perm: string | string[]; children?: ReactNode }) {
  const { status, can } = useAuth();
  if (status === 'loading') return <Loading />;
  const list = Array.isArray(perm) ? perm : [perm];
  if (!can(...list)) return <Forbidden />;
  return <>{children ?? <Outlet />}</>;
}

/** Only the head of a family. */
export function RequireHead({ children }: { children?: ReactNode }) {
  const { status, isHead } = useAuth();
  if (status === 'loading') return <Loading />;
  if (!isHead) return <Forbidden />;
  return <>{children ?? <Outlet />}</>;
}
