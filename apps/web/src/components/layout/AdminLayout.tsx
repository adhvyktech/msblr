import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Menu, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth';
import { Drawer } from '@/components/ui/overlay';
import { IconButton } from '@/components/ui/Button';
import { LangSwitch } from '@/components/ui/LangSwitch';
import { AvatarMenu, Brand, NotificationBell } from './parts';

export type AdminNavGroup = 'overview' | 'people' | 'content' | 'control';
export interface AdminNavItem {
  /** full path, e.g. '/admin/payments' */
  to: string;
  /** i18n key incl. namespace, e.g. 'payments:nav.title' */
  labelKey: string;
  icon: LucideIcon;
  perm?: string | string[];
  group: AdminNavGroup;
  order: number;
}

// features/*/nav.ts each export `adminNav: AdminNavItem[]`
const navModules = import.meta.glob('../../features/*/nav.ts', { eager: true }) as Record<string, { adminNav?: AdminNavItem[] }>;
const ALL_NAV: AdminNavItem[] = Object.values(navModules).flatMap((m) => m.adminNav ?? []);
const GROUPS: AdminNavGroup[] = ['overview', 'people', 'content', 'control'];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation('common');
  const { can } = useAuth();
  const groups = useMemo(() => {
    const visible = ALL_NAV.filter((n) => !n.perm || can(...(Array.isArray(n.perm) ? n.perm : [n.perm])));
    return GROUPS.map((g) => ({ g, items: visible.filter((n) => n.group === g).sort((a, b) => a.order - b.order) })).filter((x) => x.items.length);
  }, [can]);
  // Pending-approval badges (sidebar). Keys match /api/approvals/counts.
  const counts = useQuery({
    queryKey: ['approvals', 'counts'],
    queryFn: () => api.get<Record<string, number>>('/api/approvals/counts'),
    refetchInterval: 60_000,
    retry: false,
  });
  const badgeFor = (to: string): number => {
    const c = counts.data;
    if (!c) return 0;
    const map: Record<string, string> = {
      '/admin/approvals': 'total',
      '/admin/registrations': 'registrations',
      '/admin/logins': 'logins',
      '/admin/businesses': 'businesses',
      '/admin/ads': 'ads',
      '/admin/payments': 'payments',
    };
    const k = map[to];
    return k ? c[k] ?? 0 : 0;
  };
  const link = ({ isActive }: { isActive: boolean }) =>
    cn('flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-[15px] transition-colors', isActive ? 'bg-white/15 font-semibold text-white' : 'text-white/80 hover:bg-white/10');
  return (
    <nav aria-label="Admin" className="flex flex-col gap-0.5 p-3">
      <NavLink to="/admin" end className={link} onClick={onNavigate}><LayoutDashboard size={19} aria-hidden />{t('admin-dashboard:nav.title')}</NavLink>
      {groups.map(({ g, items }) => (
        <div key={g}>
          <p className="mx-3 mb-1 mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">{t(`groups.${g}`)}</p>
          {items.map((n) => {
            const b = badgeFor(n.to);
            return (
              <NavLink key={n.to} to={n.to} className={link} onClick={onNavigate}>
                <n.icon size={19} aria-hidden />
                <span className="flex-1">{t(n.labelKey)}</span>
                {b > 0 && <span className="rounded-full bg-accent px-2 text-[11px] font-bold leading-5 text-white" aria-label={`${b} pending`}>{b}</span>}
              </NavLink>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function AdminLayout() {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  return (
    <div className="min-h-screen bg-bg lg:pl-64">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 overflow-y-auto bg-primary text-on-primary lg:block">
        <div className="flex items-center gap-3 px-5 pb-1 pt-5"><Brand size={40} to="/admin" /><span className="font-head text-lg" style={{ fontWeight: 'var(--hw)' }}>{t('nav.admin')}</span></div>
        <Sidebar />
      </aside>
      <Drawer open={open} onClose={() => setOpen(false)} title={t('nav.admin')} width={288}>
        <div className="min-h-full bg-primary text-on-primary"><Sidebar onNavigate={() => setOpen(false)} /></div>
      </Drawer>

      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur pt-safe">
        <div className="flex h-16 items-center gap-3 px-4 lg:px-8">
          <IconButton icon={Menu} label={t('menu.openMenu')} className="lg:hidden" onClick={() => setOpen(true)} />
          <div className="flex-1 truncate font-head text-lg lg:hidden" style={{ fontWeight: 'var(--hw)' }}>{t('nav.admin')}</div>
          <div className="hidden flex-1 lg:block" />
          <LangSwitch />
          <NotificationBell />
          <AvatarMenu inAdmin />
        </div>
      </header>
      <main id="main" key={loc.pathname} className="px-4 pb-12 pt-5 lg:px-8 lg:pt-6"><Outlet /></main>
    </div>
  );
}
