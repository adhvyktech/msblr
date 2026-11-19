import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Briefcase, CalendarDays, Landmark, Users, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Card, StatCard } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/States';

const TILES: { to: string; key: string; icon: LucideIcon }[] = [
  { to: '/business', key: 'business', icon: Briefcase },
  { to: '/events', key: 'events', icon: CalendarDays },
  { to: '/trusts', key: 'trusts', icon: Landmark },
];

/** Placeholder home — replaced by the Content builder's final home (features/home). */
export default function Home() {
  const { t } = useTranslation('shell');
  const { t: tc } = useTranslation('common');
  const { me } = useAuth();
  const stats = useQuery({ queryKey: ['public-stats'], queryFn: () => api.get<{ activeFamilies: number }>('/api/public/stats') });
  const first = me?.user.name.split(' ')[0] ?? '';
  const due = me?.family && me.family.subscriptionStatus !== 'ACTIVE';

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl">{t('home.greeting', { name: first })}</h1>
        <p className="mt-1 text-muted">{tc('sabhaName')} · {tc('tagline')}</p>
      </div>

      {due ? (
        <Link to="/me/subscription" className="mb-6 flex items-center gap-3 rounded-theme border border-warning/30 bg-warning-soft p-4">
          <AlertTriangle className="shrink-0 text-warning" aria-hidden />
          <span className="flex-1 text-sm sm:text-base">{t('home.subscriptionDue')}</span>
          <span className="font-semibold text-primary">{t('home.payNow')}</span>
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="col-span-2 lg:col-span-1">
          {stats.isLoading ? <Skeleton className="h-40 w-full" /> : (
            <StatCard tone="accent" icon={Users} to="/members" value={fmtNumber(stats.data?.activeFamilies ?? 0)} label={t('home.activeFamilies')} className="min-h-[150px]" />
          )}
        </div>
        {TILES.map(({ to, key, icon: Icon }) => (
          <Link key={to} to={to} className="block rounded-theme">
            <Card tone="accent-soft" className={cn('flex h-full min-h-[150px] flex-col justify-between transition-shadow hover:shadow-pop')}>
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-surface text-accent"><Icon size={22} aria-hidden /></span>
              <span className="text-lg font-semibold">{tc(`nav.${key}`)}</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
