import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Briefcase, CalendarDays, Home, Landmark, Phone, Search, User, Users, X, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { LangSwitch } from '@/components/ui/LangSwitch';
import { SearchInput } from '@/components/ui/SearchInput';
import { IconButton } from '@/components/ui/Button';
import { AvatarMenu, Brand, NotificationBell } from './parts';

interface Item { to: string; key: string; icon: LucideIcon; end?: boolean }
// Direction C slim sidebar (≥1024px)
const SIDE: Item[] = [
  { to: '/', key: 'home', icon: Home, end: true },
  { to: '/members', key: 'members', icon: Users },
  { to: '/business', key: 'business', icon: Briefcase },
  { to: '/events', key: 'events', icon: CalendarDays },
  { to: '/trusts', key: 'trusts', icon: Landmark },
  { to: '/contacts', key: 'contacts', icon: Phone },
];
// Mobile bottom tab bar (<1024px)
const TABS: Item[] = [
  { to: '/', key: 'home', icon: Home, end: true },
  { to: '/members', key: 'members', icon: Users },
  { to: '/business', key: 'business', icon: Briefcase },
  { to: '/events', key: 'events', icon: CalendarDays },
  { to: '/me', key: 'me', icon: User },
];

export function MemberLayout() {
  const { t } = useTranslation('common');
  const nav = useNavigate();
  const [mobileSearch, setMobileSearch] = useState(false);
  const search = (q: string) => { if (q) nav(`/members?q=${encodeURIComponent(q)}`); };
  return (
    <div className="min-h-screen bg-bg lg:pl-[92px]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">Skip to content</a>

      {/* slim icon sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[92px] flex-col items-center gap-2 border-r border-line bg-surface py-5 lg:flex" aria-label="Main">
        <Brand size={48} />
        <nav className="mt-4 flex flex-col items-center gap-1.5">
          {SIDE.map(({ to, key, icon: Icon, end }) => (
            <NavLink
              key={to} to={to} end={end}
              className={({ isActive }) => cn('flex w-[74px] flex-col items-center gap-1 rounded-2xl py-2.5 transition-colors', isActive ? 'bg-primary text-on-primary' : 'text-muted hover:bg-ink/5 hover:text-ink')}
            >
              <Icon size={22} aria-hidden />
              <span className="text-[11px] font-semibold">{t(`nav.${key}`)}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* top bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur pt-safe">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-3 px-4 lg:px-8">
          <div className="lg:hidden"><Brand size={40} /></div>
          <div className="hidden flex-1 lg:block"><SearchInput onSearch={search} rounded placeholder={t('search.placeholder')} className="max-w-[360px]" /></div>
          <div className="flex-1 lg:hidden" />
          <IconButton icon={mobileSearch ? X : Search} label={t('actions.search')} className="lg:hidden" onClick={() => setMobileSearch((s) => !s)} />
          <LangSwitch />
          <NotificationBell />
          <AvatarMenu />
        </div>
        {mobileSearch ? <div className="px-4 pb-3 lg:hidden"><SearchInput autoFocus rounded onSearch={(q) => { search(q); if (q) setMobileSearch(false); }} placeholder={t('search.placeholder')} /></div> : null}
      </header>

      <main id="main" className="mx-auto max-w-[1320px] px-4 pb-28 pt-5 lg:px-8 lg:pb-10 lg:pt-6">
        <Outlet />
      </main>

      {/* bottom tab bar */}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-safe lg:hidden">
        <ul className="mx-auto flex max-w-xl justify-around px-1 pt-1.5">
          {TABS.map(({ to, key, icon: Icon, end }) => (
            <li key={to} className="flex-1">
              <NavLink to={to} end={end} className={({ isActive }) => cn('flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-xl text-[12px]', isActive ? 'font-bold text-primary' : 'text-muted')}>
                <Icon size={24} aria-hidden />
                {t(`nav.${key}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
