import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, Phone, Mail, MapPin } from 'lucide-react';
import { LangSwitch } from '@/components/ui/LangSwitch';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/overlay';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { usePublicConfig, useLogo } from '@/app/theme';

/** Pages that lay themselves out full-width (landing + site pages). Others (e.g. /register) get a centred column. */
const SITE_PATHS = ['/', '/about', '/public-events', '/trusts-info', '/privacy', '/terms'];

/** Header + footer shell for public pages (landing, about, register, ...). */
export function PublicLayout() {
  const { t, i18n } = useTranslation('site');
  const { t: tc } = useTranslation('common');
  const { status } = useAuth();
  const cfg = usePublicConfig();
  const logo = useLogo();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const hi = i18n.language?.startsWith('hi');
  const authed = status === 'authed';
  const sabha = cfg?.sabha ?? {};
  const name = (hi && sabha.nameHi) || sabha.name || tc('sabhaName');
  const sub = hi ? sabha.name : sabha.nameHi;
  const wide = SITE_PATHS.includes(loc.pathname);

  useEffect(() => { setOpen(false); }, [loc.pathname, loc.hash]);

  const nav = [
    { to: '/', label: t('nav.home'), end: true },
    { to: '/about', label: t('nav.about') },
    { to: '/public-events', label: t('nav.events') },
    { to: '/trusts-info', label: t('nav.trusts') },
    { to: authed ? '/about#contact' : '/#contact', label: t('nav.contact'), hash: true },
  ];
  const link = 'inline-flex min-h-[44px] items-center rounded-theme px-3 font-semibold hover:bg-ink/5';
  const mapQ = sabha.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sabha.address)}` : '';

  const items = (cls: string) => nav.map((n) =>
    n.hash
      ? <Link key={n.to} to={n.to} className={cn(cls, 'text-ink')}>{n.label}</Link>
      : <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn(cls, isActive ? 'text-primary' : 'text-ink')}>{n.label}</NavLink>);

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur pt-safe">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex min-w-0 flex-1 items-center gap-3 lg:flex-none" aria-label={name}>
            <img src={logo} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-[22%]" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-head text-sm sm:text-base" style={{ fontWeight: 'var(--hw)' }}>{name}</span>
              {sub ? <span className="hidden truncate text-xs text-muted sm:block">{sub}</span> : null}
            </span>
          </Link>
          <nav aria-label={t('nav.menu')} className="ml-4 hidden flex-1 items-center gap-1 lg:flex">{items(link)}</nav>
          <div className="hidden items-center gap-3 lg:flex">
            <LangSwitch />
            <Link to="/register" className="whitespace-nowrap font-semibold text-primary hover:underline">{t('registerFamily')}</Link>
            <Link to={authed ? '/' : '/login'}><Button size="sm" className="whitespace-nowrap">{authed ? t('dashboard') : t('memberLogin')}</Button></Link>
          </div>
          <button type="button" className="grid h-11 w-11 place-items-center rounded-theme lg:hidden" aria-label={t('nav.menu')} aria-expanded={open} onClick={() => setOpen(true)}>
            <Menu size={24} aria-hidden />
          </button>
        </div>
      </header>

      <Drawer open={open} onClose={() => setOpen(false)} side="right" title={t('nav.menu')}>
        <div className="flex flex-col gap-1 p-3">
          {items(cn(link, 'w-full text-lg'))}
          <Link to="/register" className={cn(link, 'w-full text-lg text-primary')}>{t('registerFamily')}</Link>
          <div className="mt-3 flex items-center justify-between gap-3">
            <LangSwitch />
            <Link to={authed ? '/' : '/login'}><Button>{authed ? t('dashboard') : t('memberLogin')}</Button></Link>
          </div>
        </div>
      </Drawer>

      <main className={cn('flex-1', !wide && 'mx-auto w-full max-w-5xl px-4 py-6')}><Outlet /></main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 md:grid-cols-3">
          <div>
            <p className="font-head text-lg" style={{ fontWeight: 'var(--hw)' }}>{name}</p>
            <p className="mt-1 text-sm text-muted">{tc('tagline')}</p>
          </div>
          <div>
            <p className="font-semibold">{t('footer.quick')}</p>
            <ul className="mt-2 space-y-1">
              {nav.filter((n) => !n.hash).map((n) => <li key={n.to}><Link className="inline-flex min-h-[36px] items-center text-muted hover:text-primary" to={n.to}>{n.label}</Link></li>)}
              <li><Link className="inline-flex min-h-[36px] items-center text-muted hover:text-primary" to="/privacy">{t('footer.privacy')}</Link></li>
              <li><Link className="inline-flex min-h-[36px] items-center text-muted hover:text-primary" to="/terms">{t('footer.terms')}</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">{t('footer.contact')}</p>
            <ul className="mt-2 space-y-2 text-sm text-muted">
              {sabha.address ? <li className="flex gap-2"><MapPin size={16} className="mt-0.5 shrink-0" aria-hidden /><a href={mapQ} target="_blank" rel="noreferrer" className="hover:text-primary">{sabha.address}</a></li> : null}
              {sabha.phone ? <li className="flex gap-2"><Phone size={16} className="mt-0.5 shrink-0" aria-hidden /><a href={`tel:${sabha.phone.replace(/[^\d+]/g, '')}`} className="hover:text-primary">{sabha.phone}</a></li> : null}
              {sabha.email ? <li className="flex gap-2"><Mail size={16} className="mt-0.5 shrink-0" aria-hidden /><a href={`mailto:${sabha.email}`} className="break-all hover:text-primary">{sabha.email}</a></li> : null}
            </ul>
          </div>
        </div>
        <div className="border-t border-line px-4 py-4 text-center text-sm text-muted">
          <p>{t('footer.copyright')}</p>
          <p>{t('footer.powered')}</p>
        </div>
      </footer>
    </div>
  );
}
