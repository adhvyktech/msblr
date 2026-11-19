import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BookUser, CalendarDays, FileText, HandHeart, Landmark, Mail, MapPin, Megaphone, Phone, Smartphone, Store, Users,
} from 'lucide-react';
import { Avatar, Button, ErrorState, Skeleton } from '@/components/ui';
import { useLogo } from '@/app/theme';
import { useT } from '@/lib/useT';
import { mapsLink, useFormatDate, useHashScroll, usePublicSite, type PublicSite } from '../api';
import { Container } from '../components/sections';
import '../landing.css';

/** Concentric-circle motif from the design concepts (pure decoration). */
const Motif = ({ className, size = 420 }: { className?: string; size?: number }) => (
  <svg className={`ls-motif ${className ?? ''}`} width={size} height={size} viewBox="0 0 200 200" aria-hidden>
    <g fill="none" stroke="currentColor" strokeWidth="1.2">
      <circle cx="100" cy="100" r="30" /><circle cx="100" cy="100" r="52" /><circle cx="100" cy="100" r="74" /><circle cx="100" cy="100" r="96" />
    </g>
  </svg>
);

const Wave = () => (
  <svg className="ls-wave" viewBox="0 0 1440 56" preserveAspectRatio="none" aria-hidden>
    <path fill="currentColor" d="M0 32c160 22 320 28 480 18S800 6 960 8s320 28 480 30v18H0z" />
  </svg>
);

function SectionHead({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="ls-eyebrow">{eyebrow}</p>
        <h2 className="mt-2 text-2xl leading-tight sm:text-4xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

const MoreLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="group inline-flex min-h-[44px] items-center gap-2 font-semibold text-primary">
    {children}<ArrowRight size={18} className="transition-transform group-hover:translate-x-1" aria-hidden />
  </Link>
);

export default function Landing() {
  const { t, lang } = useT('site');
  const logo = useLogo();
  const q = usePublicSite();
  useHashScroll(!!q.data);
  const d = q.data;
  const fallbackName = lang === 'hi' ? 'माहेश्वरी सभा, बेंगलुरु' : 'Maheshwari Sabha, Bengaluru';
  const name = (lang === 'hi' ? d?.sabha.nameHi : d?.sabha.name) || fallbackName;
  const other = lang === 'hi' ? d?.sabha.name || 'Maheshwari Sabha, Bengaluru' : d?.sabha.nameHi || 'माहेश्वरी सभा, बेंगलुरु';

  return (
    <div className="bg-bg">
      {/* ---------------- HERO ---------------- */}
      <section className="ls-hero">
        <Motif className="-right-24 -top-24 hidden sm:block" size={520} />
        <Motif className="-bottom-40 -left-32" size={380} />
        <Container className="relative z-[1] grid items-center gap-10 pb-24 pt-10 sm:pt-16 lg:grid-cols-[1.15fr_1fr] lg:pb-32 lg:pt-20">
          <div className="ls-reveal order-2 lg:order-1">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-[var(--gold)]" aria-hidden />MSBLR E-Directory
            </span>
            <h1 className="mt-5 text-4xl leading-[1.08] text-white sm:text-6xl">{name}</h1>
            <p className="mt-2 text-lg text-white/85 sm:text-2xl" lang={lang === 'hi' ? 'en' : 'hi'}>{other}</p>
            <p className="mt-5 font-head text-lg font-semibold tracking-wide text-[var(--gold)] sm:text-xl">{t('hero.tagline')}</p>
            <p className="mt-3 max-w-xl text-base text-white/90 sm:text-lg">{t('hero.intro')}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/login"><Button size="lg" className="border-white bg-white text-primary shadow-lg hover:bg-white/90">{t('memberLogin')}</Button></Link>
              <Link to="/register"><Button size="lg" variant="outline" className="border-white/80 bg-transparent text-white hover:bg-white/10">{t('registerFamily')}</Button></Link>
              <Link to="/advertise" className="inline-flex min-h-[48px] items-center gap-2 px-2 font-semibold text-white/95 hover:text-white">
                <Megaphone size={18} aria-hidden />{t('hero.advertise')}
              </Link>
            </div>
          </div>

          <div className="ls-reveal-2 order-1 flex justify-center lg:order-2">
            <div className="relative px-10 py-6 sm:px-16">
              <div className="ls-logo-wrap">
                <img src={logo} alt={name} className="ls-logo h-40 w-40 sm:h-64 sm:w-64" />
              </div>
              {d ? (
                <>
                  <div className="ls-chip -left-16 top-0 hidden sm:flex"><span className="ls-chip-icon"><Users size={18} /></span><span><b className="block text-lg leading-none">{d.stats.activeFamilies}</b><span className="text-xs text-muted">{t('stats.families')}</span></span></div>
                  <div className="ls-chip -right-20 top-[45%] hidden sm:flex"><span className="ls-chip-icon"><Store size={18} /></span><span><b className="block text-lg leading-none">{d.stats.businesses}</b><span className="text-xs text-muted">{t('stats.businesses')}</span></span></div>
                  <div className="ls-chip -bottom-6 -left-6 hidden sm:flex"><span className="ls-chip-icon"><CalendarDays size={18} /></span><span><b className="block text-lg leading-none">{d.stats.upcomingEvents}</b><span className="text-xs text-muted">{t('stats.events')}</span></span></div>
                </>
              ) : null}
            </div>
          </div>
        </Container>
        <Wave />
      </section>

      {q.isLoading ? (
        <Container className="space-y-4 py-12"><Skeleton className="h-32" /><Skeleton className="h-64" /></Container>
      ) : q.isError || !d ? (
        <Container className="py-12"><ErrorState title={t('loadError')} onRetry={() => void q.refetch()} /></Container>
      ) : (
        <LandingBody d={d} />
      )}
    </div>
  );
}

function LandingBody({ d }: { d: PublicSite }) {
  const { t, lang } = useT('site');
  const fmt = useFormatDate();
  const about = lang === 'hi' && d.about.hi ? d.about.hi : d.about.en || d.about.hi;
  const map = mapsLink(d);
  const logo = useLogo();

  const features = [
    { icon: BookUser, title: t('landing.f1t'), body: t('landing.f1b'), to: '/login', hl: true },
    { icon: Store, title: t('landing.f2t'), body: t('landing.f2b'), to: '/login' },
    { icon: CalendarDays, title: t('landing.f3t'), body: t('landing.f3b'), to: '/public-events' },
    { icon: HandHeart, title: t('landing.f4t'), body: t('landing.f4b'), to: '/trusts-info' },
  ];

  return (
    <>
      {/* ---------------- STATS (mobile) ---------------- */}
      <Container className="-mt-10 grid grid-cols-3 gap-3 sm:hidden">
        {[
          { v: d.stats.activeFamilies, l: t('stats.families') },
          { v: d.stats.businesses, l: t('stats.businesses') },
          { v: d.stats.upcomingEvents, l: t('stats.events') },
        ].map((s) => (
          <div key={s.l} className="relative z-[2] rounded-theme border border-line bg-surface p-3 text-center shadow-lg">
            <b className="block font-head text-2xl text-primary">{s.v}</b>
            <span className="text-[11px] leading-tight text-muted">{s.l}</span>
          </div>
        ))}
      </Container>

      {/* ---------------- FEATURES BENTO ---------------- */}
      <section className="py-14 sm:py-20">
        <Container>
          <SectionHead eyebrow={t('landing.featEyebrow')} title={t('landing.featTitle')} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <Link
                key={f.title}
                to={f.to}
                className={`ls-card group flex min-h-[200px] flex-col justify-between rounded-theme p-6 ${f.hl ? 'bg-accent text-white' : 'bg-accent-soft text-ink'}`}
              >
                <span className={`grid h-12 w-12 place-items-center rounded-2xl ${f.hl ? 'bg-white/20 text-white' : 'bg-surface text-accent'}`}><f.icon size={24} aria-hidden /></span>
                <span>
                  <span className="block font-head text-xl font-semibold">{f.title}</span>
                  <span className={`mt-1 block text-sm ${f.hl ? 'text-white/85' : 'text-muted'}`}>{f.body}</span>
                  <ArrowRight size={18} className="mt-3 transition-transform group-hover:translate-x-1" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* ---------------- ABOUT ---------------- */}
      <section id="about" className="scroll-mt-20 bg-surface py-14 sm:py-20">
        <Container className="grid items-center gap-10 lg:grid-cols-[1fr_1.2fr]">
          <div className="ls-tile relative flex aspect-[4/3] flex-col justify-end rounded-theme p-8" data-tone="0">
            <Motif className="-right-16 -top-16" size={300} />
            <p className="relative font-head text-3xl font-semibold leading-tight sm:text-4xl">{t('hero.tagline')}</p>
            <p className="relative mt-3 text-white/90">{t('landing.aboutCard')}</p>
          </div>
          <div>
            <SectionHead eyebrow={t('landing.aboutEyebrow')} title={t('about.title')} />
            {about ? <p className="line-clamp-[8] whitespace-pre-line text-base leading-relaxed text-muted sm:text-lg">{about}</p> : <p className="text-muted">{t('about.empty')}</p>}
            <div className="mt-6"><MoreLink to="/about">{t('about.more')}</MoreLink></div>
          </div>
        </Container>

        <Container className="mt-14">
          <h3 className="mb-6 text-xl sm:text-2xl">{t('about.committee')}</h3>
          {d.committee.length ? (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {d.committee.map((c, i) => (
                <li key={`${c.name}-${i}`} className="ls-card rounded-theme border border-line bg-bg p-5 text-center">
                  <div className="mx-auto w-fit rounded-full p-1" style={{ background: 'linear-gradient(135deg, var(--primary), var(--gold))' }}>
                    <div className="rounded-full bg-surface p-1"><Avatar name={c.name} src={c.photoUrl} size={84} /></div>
                  </div>
                  <p className="mt-3 font-semibold">{c.name}</p>
                  <p className="text-sm text-primary">{lang === 'hi' && c.roleHi ? c.roleHi : c.role}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-4 rounded-theme border-2 border-dashed border-line bg-bg p-6 text-muted">
              <Users size={28} className="shrink-0 text-primary" aria-hidden />{t('about.committeeEmpty')}
            </div>
          )}
        </Container>
      </section>

      {/* ---------------- EVENTS ---------------- */}
      <section id="events" className="scroll-mt-20 py-14 sm:py-20">
        <Container>
          <SectionHead eyebrow={t('landing.eventsEyebrow')} title={t('events.title')} action={<MoreLink to="/public-events">{t('events.all')}</MoreLink>} />
          {d.upcomingEvents.length ? (
            <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
              {d.upcomingEvents.map((e, i) => {
                const dt = new Date(e.startsAt);
                return (
                  <li key={e.id} className="ls-card flex min-w-[78%] snap-start gap-4 rounded-theme border border-line bg-surface p-4 sm:min-w-0">
                    <div className="ls-tile grid w-20 shrink-0 place-items-center rounded-2xl py-3 text-center" data-tone={String(i % 4)}>
                      <span className="block font-head text-3xl font-bold leading-none">{dt.getDate()}</span>
                      <span className="mt-1 block text-xs font-bold uppercase tracking-wider">{dt.toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', { month: 'short' })}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="inline-block rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">{t(`events.kind.${e.kind}`)}</span>
                      <h3 className="mt-1.5 text-lg leading-snug">{e.title}</h3>
                      <p className="mt-1 text-sm text-muted">{fmt(e.startsAt, true)}</p>
                      {e.venue ? <p className="mt-1 flex items-start gap-1.5 text-sm text-muted"><MapPin size={15} className="mt-0.5 shrink-0" aria-hidden />{e.venue}</p> : null}
                      {e.noticeUrl ? <a href={e.noticeUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-[40px] items-center gap-1.5 text-sm font-semibold text-primary"><FileText size={15} aria-hidden />{t('events.notice')}</a> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted">{t('events.empty')}</p>
          )}
        </Container>
      </section>

      {/* ---------------- HIGHLIGHTS ---------------- */}
      {d.highlights.length ? (
        <section className="bg-surface py-14 sm:py-20">
          <Container>
            <SectionHead eyebrow={t('landing.hlEyebrow')} title={t('highlights.title')} />
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {d.highlights.map((h, i) => (
                <li key={h.id} className={`ls-card overflow-hidden rounded-theme ${i === 0 ? 'lg:col-span-2 lg:row-span-2' : ''}`}>
                  <div className="ls-tile relative flex h-full min-h-[220px] flex-col justify-end p-6" data-tone={String((i + 2) % 4)}>
                    {h.media[0] ? (
                      <>
                        <img src={h.media[0]} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                        <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" aria-hidden />
                      </>
                    ) : <Motif className="-right-12 -top-12" size={240} />}
                    <div className="relative">
                      <p className="text-xs font-bold uppercase tracking-wider text-white/85">{fmt(h.publishedAt)}</p>
                      <h3 className={`mt-1 text-white ${i === 0 ? 'text-2xl sm:text-3xl' : 'text-xl'}`}>{h.title}</h3>
                      {h.summary ? <p className="mt-1 line-clamp-2 text-sm text-white/90">{h.summary}</p> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}

      {/* ---------------- TRUSTS ---------------- */}
      <section id="trusts" className="scroll-mt-20 py-14 sm:py-20">
        <Container>
          <SectionHead eyebrow={t('landing.trustsEyebrow')} title={t('trusts.title')} action={<MoreLink to="/trusts-info">{t('trusts.all')}</MoreLink>} />
          <ul className="grid gap-4 md:grid-cols-3">
            {d.trusts.map((x) => (
              <li key={x.id} className="ls-card flex flex-col rounded-theme border border-line bg-surface p-6">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent"><Landmark size={22} aria-hidden /></span>
                <h3 className="mt-4 text-lg">{x.name}</h3>
                {x.description ? <p className="mt-2 line-clamp-4 text-sm text-muted">{x.description}</p> : null}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* ---------------- ADVERTISE BAND ---------------- */}
      <section className="px-4 sm:px-6">
        <div className="ls-band mx-auto max-w-6xl rounded-theme px-6 py-10 sm:px-12 sm:py-14">
          <Motif className="-right-20 -top-28" size={360} />
          <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-white/80">{t('landing.adEyebrow')}</p>
              <h2 className="mt-2 text-2xl text-white sm:text-4xl">{t('advertise.title')}</h2>
              <p className="mt-3 text-white/90">{t('advertise.body')}</p>
            </div>
            <Link to="/advertise" className="inline-flex min-h-[52px] shrink-0 items-center gap-2 rounded-theme bg-white px-6 font-semibold text-accent shadow-lg transition hover:bg-white/90"><Megaphone size={18} aria-hidden />{t('advertise.cta')}</Link>
          </div>
        </div>
      </section>

      {/* ---------------- APP ---------------- */}
      <section className="overflow-hidden py-14 sm:py-20">
        <Container className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="ls-eyebrow">{t('app.soon')}</p>
            <h2 className="mt-2 text-2xl sm:text-4xl">{t('app.title')}</h2>
            <p className="mt-3 max-w-lg text-muted sm:text-lg">{t('landing.appBody')}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              {(['google', 'apple'] as const).map((k) => (
                <span key={k} aria-disabled="true" className="inline-flex min-h-[56px] items-center gap-3 rounded-2xl bg-ink px-5 text-left text-bg">
                  <Smartphone size={22} aria-hidden />
                  <span className="leading-tight"><span className="block text-[11px] opacity-75">{t('app.soon')}</span><span className="font-semibold">{t(`app.${k}`)}</span></span>
                </span>
              ))}
            </div>
          </div>
          <div className="flex justify-center">
            <div className="ls-phone" aria-hidden>
              <div className="ls-phone-in">
                <div className="ls-tile flex items-center gap-3 px-4 pb-4 pt-7" data-tone="0">
                  <img src={logo} alt="" className="h-9 w-9 rounded-xl" />
                  <span className="text-sm font-semibold">Namaste!</span>
                </div>
                <div className="grid grid-cols-2 gap-2 p-3">
                  {[Users, Store, CalendarDays, Landmark].map((I, i) => (
                    <div key={i} className={`flex h-20 flex-col justify-between rounded-2xl p-2.5 ${i === 0 ? 'bg-accent text-white' : 'bg-accent-soft text-accent'}`}>
                      <I size={18} />
                      <span className={`h-2 w-12 rounded ${i === 0 ? 'bg-white/60' : 'bg-line'}`} />
                    </div>
                  ))}
                </div>
                <div className="mx-3 h-24 rounded-2xl ls-tile" data-tone="3" />
                <div className="mx-3 mt-2 h-12 rounded-2xl border border-line bg-surface" />
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* ---------------- CONTACT ---------------- */}
      <section id="contact" className="scroll-mt-20 bg-surface py-14 sm:py-20">
        <Container>
          <SectionHead eyebrow={t('landing.contactEyebrow')} title={t('contact.title')} />
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { icon: MapPin, label: t('contact.address'), value: d.sabha.address, href: map || undefined },
              { icon: Phone, label: t('contact.phone'), value: d.sabha.phone, href: d.sabha.phone ? `tel:${d.sabha.phone.replace(/[^\d+]/g, '')}` : undefined },
              { icon: Mail, label: t('contact.email'), value: d.sabha.email, href: d.sabha.email ? `mailto:${d.sabha.email}` : undefined },
            ].map((c) => {
              const inner = (
                <>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-on-primary"><c.icon size={22} aria-hidden /></span>
                  <span className="min-w-0">
                    <span className="block text-sm text-muted">{c.label}</span>
                    <span className="block break-words font-semibold">{c.value || t('contact.notSet')}</span>
                  </span>
                </>
              );
              return c.href && c.value ? (
                <a key={c.label} href={c.href} target={c.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="ls-card flex items-center gap-4 rounded-theme border border-line bg-bg p-5">{inner}</a>
              ) : (
                <div key={c.label} className="flex items-center gap-4 rounded-theme border border-line bg-bg p-5">{inner}</div>
              );
            })}
          </div>
        </Container>
      </section>
    </>
  );
}
