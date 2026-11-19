import { Link, useNavigate } from 'react-router-dom';
import { Briefcase, CalendarDays, Gift, Phone, Users, Landmark } from 'lucide-react';
import { useT } from '@/lib/useT';
import { fmtNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import { AdSlot, Carousel, ImageWithFallback, SearchInput } from '@/components/ui';
import { useAdAvailable, type HomeData } from '../api';
import { AnnouncementsStrip, BirthdayAvatars, BirthdayCard, DueAlert, EventRows, Greeting, HighlightFeature, Tile, TrustsList, useSlides } from './pieces';

/* ---------- Direction C — Warm Community (default). Desktop bento; mobile big 2x2 tiles. ---------- */
/** The accent "active families" tile needs its number; split out so Tile stays generic. */
export function ActiveTile({ d, className }: { d: HomeData; className?: string }) {
  const { t } = useT('home');
  return (
    <Link to="/members" className={cn('flex flex-col justify-between rounded-theme bg-accent p-5 text-on-primary transition-shadow hover:shadow-pop', className)}>
      <Users size={28} aria-hidden />
      <span><span className="block font-head text-[40px] leading-none" style={{ fontWeight: 'var(--hw)' }}>{fmtNumber(d.stats.activeFamilies)}</span><span className="text-sm opacity-90">{t('activeFamilies')}</span></span>
    </Link>
  );
}

export function DesktopC({ d }: { d: HomeData }) {
  const { t } = useT('home');
  const slides = useSlides(d.banners);
  const hasAd = useAdAvailable('WEB_SIDE');
  return (
    <div>
      <Greeting name={d.greetingName} className="mb-5" />
      <AnnouncementsStrip items={d.announcements} />
      <DueAlert />
      <div className="grid grid-cols-[1.5fr_1fr_1fr] grid-rows-[240px_180px_220px] gap-4">
        <div className="row-span-2"><Carousel items={slides} height="100%" className="h-full" label={t('carousel')} /></div>
        <ActiveTile d={d} />
        <Link to="/members" className="flex flex-col justify-between rounded-theme border border-line bg-surface p-5 shadow-card" aria-label={t('birthdays')}>
          <Gift size={26} className="text-primary" aria-hidden />
          <div><div className="font-semibold">{t('birthdays')}</div><div className="mt-2"><BirthdayAvatars people={d.todaysBirthdays} /></div></div>
        </Link>
        <Tile to="/business" icon={Briefcase} title={t('business')} sub={t('listings', { count: d.stats.businesses })} />
        <Tile to="/events" icon={CalendarDays} title={t('events')} sub={t('upcomingN', { count: d.upcomingEventCount })} />
        <HighlightFeature h={d.highlights[0]} />
        <TrustsList trusts={d.trusts} />
        {hasAd ? (
          <div className="h-[220px] overflow-hidden rounded-theme [&>div]:h-full [&>div>a]:h-full [&>div>div]:h-full"><AdSlot placement="WEB_SIDE" className="h-full" /></div>
        ) : (
          <Tile to="/contacts" icon={Phone} title={t('contacts')} sub={t('contactsSub')} />
        )}
      </div>
    </div>
  );
}

export function MobileC({ d }: { d: HomeData }) {
  const { t } = useT('home');
  const slides = useSlides(d.banners);
  return (
    <div>
      <Greeting name={d.greetingName} className="mb-3" />
      <AnnouncementsStrip items={d.announcements} />
      <DueAlert />
      <Carousel items={slides} height={160} label={t('carousel')} />
      <div className="mt-3.5 grid grid-cols-2 gap-3">
        <Tile to="/members" tone="accent" icon={Users} title={t('members')} sub={t('familiesN', { count: d.stats.activeFamilies })} className="h-[104px] !p-3.5" />
        <Tile to="/business" icon={Briefcase} title={t('business')} sub={fmtNumber(d.stats.businesses)} className="h-[104px] !p-3.5" />
        <Tile to="/events" icon={CalendarDays} title={t('events')} sub={t('upcomingN', { count: d.upcomingEventCount })} className="h-[104px] !p-3.5" />
        <Tile to="/trusts" icon={Landmark} title={t('trusts')} sub={t('trustsN', { count: d.trusts.length })} className="h-[104px] !p-3.5" />
      </div>
      <BirthdayCard people={d.todaysBirthdays} className="mt-3.5" />
      <HighlightFeature h={d.highlights[0]} className="mt-3" />
      <div className="mt-3.5"><AdSlot placement="APP_CARD" /></div>
    </div>
  );
}

/* ---------- Direction A — Heritage: carousel + quick links + highlights, right column ---------- */
export function VariantA({ d }: { d: HomeData }) {
  const { t } = useT('home');
  const slides = useSlides(d.banners);
  const quick = [
    { to: '/members', icon: Users, label: t('members') }, { to: '/business', icon: Briefcase, label: t('business') },
    { to: '/events', icon: CalendarDays, label: t('events') }, { to: '/trusts', icon: Landmark, label: t('trusts') },
  ];
  return (
    <div>
      <Greeting name={d.greetingName} className="mb-4" />
      <AnnouncementsStrip items={d.announcements} />
      <DueAlert />
      <div className="grid gap-6 lg:grid-cols-[1fr_290px]">
        <div className="min-w-0">
          <Carousel items={slides} height={260} label={t('carousel')} />
          <p className="mt-3 flex items-center gap-2 text-sm text-muted"><Users size={16} aria-hidden /><span><b className="text-primary">{fmtNumber(d.stats.activeFamilies)}</b> {t('activeFamilies')}</span></p>
          <ul className="mt-4 grid grid-cols-4 gap-2 sm:gap-3">
            {quick.map(({ to, icon: Icon, label }) => (
              <li key={to}><Link to={to} className="flex flex-col items-center gap-1.5 rounded-theme border border-line bg-surface px-1 py-3 text-center shadow-card sm:flex-row sm:px-3 sm:text-left">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-[1.5px] border-accent text-primary"><Icon size={22} aria-hidden /></span>
                <span className="text-sm font-semibold">{label}</span>
              </Link></li>
            ))}
          </ul>
          <div className="mt-6 flex items-center gap-3"><h2 className="text-xl">{t('recentHighlights')}</h2><span className="h-px flex-1 bg-line" /><Link to="/highlights" className="text-sm font-semibold text-primary">{t('viewAll')}</Link></div>
          <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
            {d.highlights.slice(0, 3).map((h) => (
              <Link key={h.id} to={`/highlights/${h.id}`} className="min-w-[200px] overflow-hidden rounded-theme border border-line bg-surface shadow-card sm:min-w-0">
                <ImageWithFallback src={h.coverUrl ?? undefined} alt="" className="h-28 w-full object-cover" />
                <div className="p-3"><div className="line-clamp-1 font-semibold">{h.title}</div><div className="line-clamp-1 text-xs text-muted">{h.summary}</div></div>
              </Link>
            ))}
            {d.highlights.length === 0 ? <p className="text-muted">{t('noHighlights')}</p> : null}
          </div>
          <BirthdayCard people={d.todaysBirthdays} className="mt-5" />
        </div>
        <aside className="grid content-start gap-4">
          <div className="hidden lg:block"><AdSlot placement="WEB_SIDE" /></div>
          <TrustsList trusts={d.trusts} />
          <EventRows events={d.upcomingEvents} />
          <div className="lg:hidden"><AdSlot placement="APP_CARD" /></div>
        </aside>
      </div>
    </div>
  );
}

/* ---------- Direction B — Modern Trust: search-first hero ---------- */
export function VariantB({ d }: { d: HomeData }) {
  const { t } = useT('home');
  const nav = useNavigate();
  const slides = useSlides(d.banners);
  const stats = [[d.stats.activeFamilies, t('activeFamiliesShort')], [d.stats.members, t('membersShort')], [d.stats.businesses, t('businessesShort')]] as const;
  return (
    <div>
      <AnnouncementsStrip items={d.announcements} />
      <DueAlert />
      <div className="grid items-stretch gap-6 lg:grid-cols-[1fr_1.15fr]">
        <div className="flex flex-col justify-center">
          <p className="text-sm font-semibold text-accent">{t('greeting', { name: d.greetingName })}</p>
          <h1 className="my-2 text-3xl leading-tight sm:text-[34px]" style={{ fontWeight: 800 }}>{t('heroTitle')}</h1>
          <SearchInput onSearch={(q) => q && nav(`/members?q=${encodeURIComponent(q)}`)} placeholder={t('heroSearch')} className="shadow-card" />
          <div className="mt-3 flex flex-wrap gap-2">
            {[['/members', t('members')], ['/business', t('business')], ['/events', t('events')], ['/trusts', t('trusts')], ['/contacts', t('contacts')]].map(([to, label]) => (
              <Link key={to} to={to!} className="inline-flex min-h-[40px] items-center rounded-full border border-line bg-surface px-4 text-sm font-medium hover:border-primary">{label}</Link>
            ))}
          </div>
          <dl className="mt-5 flex gap-6">
            {stats.map(([v, l]) => <div key={l}><dd className="text-2xl font-extrabold text-primary">{fmtNumber(v)}</dd><dt className="text-xs text-muted">{l}</dt></div>)}
          </dl>
        </div>
        <Carousel items={slides} height={300} label={t('carousel')} />
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_1fr_300px]">
        <section>
          <div className="mb-2 flex items-center justify-between"><h2 className="text-lg">{t('recentHighlights')}</h2><Link to="/highlights" className="text-sm font-semibold text-primary">{t('viewAll')}</Link></div>
          <div className="grid gap-3">{d.highlights.slice(0, 2).map((h) => <HighlightFeature key={h.id} h={h} />)}{d.highlights.length === 0 ? <p className="text-muted">{t('noHighlights')}</p> : null}</div>
        </section>
        <section className="grid content-start gap-4"><EventRows events={d.upcomingEvents} /><BirthdayCard people={d.todaysBirthdays} /></section>
        <aside className="grid content-start gap-4"><TrustsList trusts={d.trusts} /><div className="hidden lg:block"><AdSlot placement="WEB_SIDE" /></div><div className="lg:hidden"><AdSlot placement="APP_CARD" /></div></aside>
      </div>
    </div>
  );
}
