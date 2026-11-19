import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui/States';
import { MemberLayout } from '@/components/layout/MemberLayout';
import { PublicLayout } from '@/components/layout/PublicLayout';
import Landing from './pages/Landing';

const Loading = () => (
  <div className="grid min-h-screen place-items-center bg-bg" role="status" aria-live="polite"><Spinner size={36} /></div>
);

/** "/" layout: member shell when signed in, public shell otherwise; spinner while auth resolves. */
export function RootLayout() {
  const { status } = useAuth();
  if (status === 'loading') return <Loading />;
  return status === 'authed' ? <MemberLayout /> : <PublicLayout />;
}

/** "/" content: member home when signed in, public landing page otherwise. */
export function RootIndex({ member }: { member: ReactNode }) {
  const { status } = useAuth();
  return status === 'authed' ? <>{member}</> : <Landing />;
}
