import { Link } from 'react-router-dom';
import { Building2, CalendarDays, Megaphone, Smartphone, Store, Users } from 'lucide-react';
import { Button, ErrorState, Skeleton } from '@/components/ui';
import { useLogo } from '@/app/theme';
import { useT } from '@/lib/useT';
import { useHashScroll, usePublicSite } from '../api';
import { CommitteeGrid, Container, ContactSection, EventsList, HighlightsList, SectionBlock, TextLink, TrustsList } from '../components/sections';

export default function Landing() {
  const { t, lang } = useT('site');
  const logo = useLogo();
  const q = usePublicSite();
  useHashScroll(!!q.data);
  const d = q.data;
  const name = lang === 'hi' && d?.sabha.nameHi ? d.sabha.nameHi : d?.sabha.name || (lang === 'hi' ? 'माहेश्वरी सभा, बेंगलुरु' : 'Maheshwari Sabha, Bengaluru');
  const other = lang === 'hi' ? d?.sabha.name : d?.sabha.nameHi;
  const about = d ? (lang === 'hi' && d.about.hi ? d.about.hi : d.about.en || d.about.hi) : '';
  const stats = d ? [
    { icon: Users, label: t('stats.families'), value: d.stats.activeFamilies },
    { icon: Store, label: t('stats.businesses'), value: d.stats.businesses },
    { icon: CalendarDays, label: t('stats.events'), value: d.stats.upcomingEvents },
  ] : [];

  return (
    <div>
      <section className="bg-accent-soft">
        <Container className="grid items-center gap-8 py-10 sm:py-16 lg:grid-cols-[1fr_auto]">
          <div className="order-2 lg:order-1">
            <h1 className="text-3xl leading-tight sm:text-5xl">{name}</h1>
            {other ? <p className="mt-1 text-lg text-muted sm:text-xl" lang={lang === 'hi' ? 'en' : 'hi'}>{other}</p> : null}
            <p className="mt-3 font-head text-lg font-semibold text-primary">{t('hero.tagline')}</p>
            <p className="mt-3 max-w-xl text-base text-muted sm:text-lg">{t('hero.intro')}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/login"><Button size="lg">{t('memberLogin')}</Button></Link>
              <Link to="/register"><Button size="lg" variant="outline">{t('registerFamily')}</Button></Link>
              <Link to="/advertise"><Button size="lg" variant="ghost" icon={Megaphone}>{t('hero.advertise')}</Button></Link>
            </div>
          </div>
          <div className="order-1 flex justify-center lg:order-2">
            <img src={logo} alt="" className="h-32 w-32 rounded-[22%] shadow-pop sm:h-48 sm:w-48 lg:h-60 lg:w-60" />
          </div>
        </Container>
      </section>

      {q.isLoading ? (
        <Container className="space-y-4 py-10"><Skeleton className="h-24" /><Skeleton className="h-48" /></Container>
      ) : q.isError || !d ? (
        <Container className="py-10"><ErrorState title={t('loadError')} onRetry={() => void q.refetch()} /></Container>
      ) : (
        <>
          <section aria-label={t('stats.families')} className="border-b border-line bg-surface">
            <Container className="grid grid-cols-3 gap-2 py-6 text-center">
              {stats.map((s) => (
                <div key={s.label} className="flex flex-col items-center gap-1">
                  <s.icon size={22} className="text-primary" aria-hidden />
                  <span className="font-head text-2xl sm:text-4xl" style={{ fontWeight: 'var(--hw)' }}>{s.value}</span>
                  <span className="text-xs text-muted sm:text-sm">{s.label}</span>
                </div>
              ))}
            </Container>
          </section>

          <SectionBlock id="about" title={t('about.title')} action={<TextLink to="/about">{t('about.more')}</TextLink>}>
            {about ? <p className="line-clamp-6 max-w-3xl whitespace-pre-line text-base text-muted sm:text-lg">{about}</p> : <p className="text-muted">{t('about.empty')}</p>}
          </SectionBlock>

          <SectionBlock title={t('about.committee')} tone="soft"><CommitteeGrid items={d.committee} /></SectionBlock>

          <SectionBlock id="events" title={t('events.title')} action={<TextLink to="/public-events">{t('events.all')}</TextLink>}>
            <EventsList items={d.upcomingEvents} />
          </SectionBlock>

          <SectionBlock title={t('highlights.title')} tone="soft"><HighlightsList items={d.highlights} /></SectionBlock>

          <SectionBlock id="trusts" title={t('trusts.title')} action={<TextLink to="/trusts-info">{t('trusts.all')}</TextLink>}>
            <TrustsList items={d.trusts} />
          </SectionBlock>

          <section className="bg-primary text-on-primary">
            <Container className="flex flex-col items-start gap-4 py-10 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-2xl">
                <h2 className="flex items-center gap-2 text-2xl text-on-primary sm:text-3xl"><Building2 size={26} aria-hidden />{t('advertise.title')}</h2>
                <p className="mt-2 opacity-90">{t('advertise.body')}</p>
              </div>
              <Link to="/advertise"><Button variant="outline" size="lg" className="border-white bg-white text-primary hover:bg-white/90">{t('advertise.cta')}</Button></Link>
            </Container>
          </section>

          <section className="py-10">
            <Container className="flex flex-col items-center gap-4 text-center">
              <h2 className="flex items-center gap-2 text-2xl"><Smartphone size={24} aria-hidden />{t('app.title')}</h2>
              <p className="text-muted">{t('app.body')}</p>
              <div className="flex flex-wrap justify-center gap-3">
                {(['google', 'apple'] as const).map((k) => (
                  <span key={k} aria-disabled="true" className="inline-flex min-h-[52px] items-center gap-3 rounded-theme border border-line bg-surface px-5 text-left opacity-80">
                    <Smartphone size={22} className="text-muted" aria-hidden />
                    <span className="leading-tight"><span className="block text-xs text-muted">{t('app.soon')}</span><span className="font-semibold">{t(`app.${k}`)}</span></span>
                  </span>
                ))}
              </div>
            </Container>
          </section>

          <ContactSection site={d} />
        </>
      )}
    </div>
  );
}
