import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Gift, Landmark, Megaphone, Pin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/useT';
import { cn } from '@/lib/cn';
import { Avatar, ImageWithFallback, adHref, type CarouselItem } from '@/components/ui';
import { DateBox } from '@/features/events/components/parts';
import type { Announcement, EventItem, HighlightItem } from '@/features/events/api';
import type { HomeBanner, HomeBirthday, HomeData } from '../api';

/** Banner / ad / video feed -> Carousel slides. Ads are clickable and report the click. */
export function useSlides(banners: HomeBanner[]): CarouselItem[] {
  const { t } = useTranslation('home');
  const { t: tc } = useTranslation('common');
  if (!banners.length) {
    return [{ id: 'default', kind: 'gradient', kicker: tc('tagline'), title: tc('sabhaName'), subtitle: t('defaultSlide') }];
  }
  return banners.map((b): CarouselItem => {
    const base: CarouselItem = {
      id: b.id, kind: b.kind === 'VIDEO' ? 'video' : b.url ? 'image' : 'gradient', src: b.url, title: b.title ?? undefined, subtitle: b.subtitle ?? undefined,
      durationMs: b.durationMs, ad: b.kind === 'AD',
    };
    const external = b.linkUrl && /^https?:\/\//i.test(b.linkUrl) ? b.linkUrl : null;
    const adLink = b.kind === 'AD' && b.ad ? adHref(b.ad) : null;
    const href = adLink ?? external;
    if (href) {
      return {
        ...base,
        content: (
          <a
            href={href} target={href.startsWith('tel:') ? undefined : '_blank'} rel="noopener noreferrer sponsored" aria-label={b.title ?? t('openLink')}
            className="absolute inset-0 z-[5] flex items-end p-5 pr-20"
            onClick={() => { if (b.ad) void api.post(`/api/ads/${b.ad.id}/click`, { type: b.ad.clickType }).catch(() => undefined); }}
          >
            <span>
              {b.title ? <span className="block font-head text-xl leading-tight sm:text-2xl" style={{ fontWeight: 'var(--hw)' }}>{b.title}</span> : null}
              {b.subtitle ? <span className="mt-0.5 block text-sm opacity-90">{b.subtitle}</span> : null}
            </span>
          </a>
        ),
      };
    }
    return b.linkUrl?.startsWith('/') ? { ...base, href: b.linkUrl } : base;
  });
}

export function AnnouncementsStrip({ items }: { items: Announcement[] }) {
  const { t } = useT('home');
  if (!items.length) return null;
  return (
    <section aria-label={t('announcements')} className="mb-4 grid gap-2">
      {items.map((a) => (
        <div key={a.id} className="flex items-start gap-3 rounded-theme border border-gold/50 bg-warning-soft px-4 py-3">
          {a.pinned ? <Pin size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden /> : <Megaphone size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />}
          <div className="min-w-0"><div className="font-semibold">{a.title}</div>{a.body ? <div className="text-sm text-ink/80">{a.body}</div> : null}</div>
        </div>
      ))}
    </section>
  );
}

export function DueAlert() {
  const { t } = useT('home');
  const { me } = useAuth();
  if (!me?.family || me.family.subscriptionStatus === 'ACTIVE') return null;
  return (
    <Link to="/me/subscription" className="mb-4 flex items-center gap-3 rounded-theme border border-warning/30 bg-warning-soft p-4">
      <AlertTriangle className="shrink-0 text-warning" aria-hidden />
      <span className="flex-1 text-sm sm:text-base">{t('subscriptionDue')}</span>
      <span className="font-semibold text-primary">{t('payNow')}</span>
    </Link>
  );
}

export function Greeting({ name, className }: { name: string; className?: string }) {
  const { t } = useT('home');
  return (
    <div className={className}>
      <h1 className="text-2xl leading-tight sm:text-[28px]">{t('greeting', { name })}</h1>
      <p className="mt-0.5 text-sm text-muted">{t('sabhaLine')}</p>
    </div>
  );
}

export function BirthdayAvatars({ people, size = 34, max = 3 }: { people: HomeBirthday[]; size?: number; max?: number }) {
  const { t } = useT('home');
  if (!people.length) return <span className="text-sm text-muted">{t('noBirthdays')}</span>;
  return (
    <div className="flex items-center">
      <ul className="flex -space-x-2">{people.slice(0, max).map((p) => <li key={p.id} title={p.name}><Avatar name={p.name} src={p.photoUrl} size={size} className="ring-2 ring-surface" /></li>)}</ul>
      {people.length > max ? <span className="ml-2 text-sm text-muted">+{people.length - max}</span> : null}
    </div>
  );
}

export function birthdayNames(people: HomeBirthday[], max = 2) {
  const first = people.slice(0, max).map((p) => p.name).join(', ');
  return people.length > max ? `${first} +${people.length - max}` : first;
}

export function BirthdayCard({ people, className }: { people: HomeBirthday[]; className?: string }) {
  const { t } = useT('home');
  return (
    <div className={cn('flex items-center gap-3 rounded-theme border border-line bg-surface px-4 py-3 shadow-card', className)}>
      <Gift size={24} className="shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{t('birthdays')}</div><div className="truncate text-xs text-muted">{people.length ? birthdayNames(people) : t('noBirthdays')}</div></div>
      {people.length ? <BirthdayAvatars people={people} size={30} max={2} /> : null}
    </div>
  );
}

export function HighlightFeature({ h, horizontal = true, className }: { h: HighlightItem | undefined; horizontal?: boolean; className?: string }) {
  const { t } = useT('home');
  if (!h) {
    return <Link to="/highlights" className={cn('flex items-center justify-between rounded-theme border border-dashed border-line bg-surface p-5 text-muted', className)}>{t('noHighlights')}<ChevronRight size={18} aria-hidden /></Link>;
  }
  return (
    <Link to={`/highlights/${h.id}`} className={cn('overflow-hidden rounded-theme border border-line bg-surface shadow-card transition-shadow hover:shadow-pop', horizontal ? 'grid grid-cols-[110px_1fr] lg:grid-cols-[200px_1fr]' : 'block', className)}>
      <ImageWithFallback src={h.coverUrl ?? undefined} alt="" className={cn('h-full w-full object-cover', horizontal ? 'min-h-[86px]' : 'h-36')} />
      <div className="min-w-0 p-3 lg:p-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary">{t('recentHighlight')}</div>
        <div className="my-0.5 line-clamp-2 font-semibold lg:text-[17px]">{h.title}</div>
        <div className="line-clamp-2 text-xs text-muted lg:text-sm">{h.summary}</div>
      </div>
    </Link>
  );
}

export function TrustsList({ trusts, className }: { trusts: HomeData['trusts']; className?: string }) {
  const { t } = useT('home');
  return (
    <div className={cn('rounded-theme border border-line bg-surface p-4 shadow-card sm:p-5', className)}>
      <Link to="/trusts" className="mb-2 flex items-center justify-between font-semibold hover:text-primary">{t('trusts')}<ChevronRight size={16} aria-hidden /></Link>
      {trusts.length === 0 ? <p className="text-sm text-muted">{t('noTrusts')}</p> : (
        <ul>{trusts.slice(0, 4).map((x) => <li key={x.id}><Link to="/trusts" className="flex min-h-[36px] items-center gap-2 py-1 text-sm hover:text-primary"><Landmark size={16} className="shrink-0 text-accent" aria-hidden /><span className="truncate">{x.name}</span></Link></li>)}</ul>
      )}
    </div>
  );
}

export function EventRows({ events, className }: { events: EventItem[]; className?: string }) {
  const { t } = useT('home');
  return (
    <div className={cn('rounded-theme border border-line bg-surface p-4 shadow-card', className)}>
      <Link to="/events" className="mb-2 flex items-center justify-between font-semibold hover:text-primary">{t('upcoming')}<ChevronRight size={16} aria-hidden /></Link>
      {events.length === 0 ? <p className="text-sm text-muted">{t('noEvents')}</p> : (
        <ul className="grid gap-2">{events.slice(0, 3).map((e) => (
          <li key={e.id}><Link to={`/events/${e.id}`} className="flex items-center gap-3"><DateBox iso={e.startsAt} /><div className="min-w-0"><div className="truncate text-sm font-semibold">{e.title}</div><div className="truncate text-xs text-muted">{e.venue}</div></div></Link></li>
        ))}</ul>
      )}
    </div>
  );
}

export function Tile({ to, icon: Icon, title, sub, tone = 'soft', className }: { to: string; icon: typeof Gift; title: string; sub?: ReactNode; tone?: 'soft' | 'accent'; className?: string }) {
  const accent = tone === 'accent';
  return (
    <Link to={to} className={cn('flex flex-col justify-between rounded-theme p-4 transition-shadow hover:shadow-pop sm:p-5', accent ? 'bg-accent text-on-primary' : 'bg-accent-soft', className)}>
      <span className={cn('grid h-11 w-11 place-items-center rounded-2xl', accent ? 'bg-white/20' : 'bg-surface text-accent')}><Icon size={22} aria-hidden /></span>
      <span><span className="block text-base font-semibold sm:text-[17px]">{title}</span>{sub ? <span className={cn('block text-sm', accent ? 'opacity-90' : 'text-muted')}>{sub}</span> : null}</span>
    </Link>
  );
}
