import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, FileText, Mail, MapPin, Phone, ExternalLink } from 'lucide-react';
import { Avatar, Badge, Card, EmptyState } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/useT';
import { mapsLink, useFormatDate, type PublicSite } from '../api';

/** Consistent page-width container for public sections. */
export const Container = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6', className)}>{children}</div>
);

export function SectionBlock({ id, title, action, children, tone = 'plain' }: { id?: string; title: string; action?: ReactNode; children: ReactNode; tone?: 'plain' | 'soft' }) {
  return (
    <section id={id} className={cn('scroll-mt-20 py-10 sm:py-14', tone === 'soft' && 'bg-accent-soft')}>
      <Container>
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="text-2xl sm:text-3xl">{title}</h2>
          {action}
        </div>
        {children}
      </Container>
    </section>
  );
}

export function CommitteeGrid({ items }: { items: PublicSite['committee'] }) {
  const { t, lang } = useT('site');
  if (!items.length) return <p className="text-muted">{t('about.committeeEmpty')}</p>;
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((c, i) => (
        <li key={`${c.name}-${i}`}>
          <Card className="flex h-full flex-col items-center text-center">
            <Avatar name={c.name} src={c.photoUrl} size={88} />
            <p className="mt-3 font-semibold">{c.name}</p>
            <p className="text-sm text-muted">{lang === 'hi' && c.roleHi ? c.roleHi : c.role}</p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function EventsList({ items }: { items: PublicSite['upcomingEvents'] }) {
  const { t } = useT('site');
  const fmt = useFormatDate();
  if (!items.length) return <EmptyState icon={CalendarDays} title={t('events.empty')} />;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((e) => (
        <li key={e.id}>
          <Card className="flex h-full flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Badge tone="info">{t(`events.kind.${e.kind}`)}</Badge>
              <span className="text-sm text-muted">{fmt(e.startsAt, true)}</span>
            </div>
            <h3 className="text-lg">{e.title}</h3>
            {e.venue ? <p className="flex items-start gap-2 text-sm text-muted"><MapPin size={16} className="mt-0.5 shrink-0" aria-hidden />{e.venue}</p> : null}
            {e.noticeUrl ? (
              <a href={e.noticeUrl} target="_blank" rel="noreferrer" className="mt-auto inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-primary">
                <FileText size={16} aria-hidden />{t('events.notice')}
              </a>
            ) : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function HighlightsList({ items }: { items: PublicSite['highlights'] }) {
  const { t } = useT('site');
  const fmt = useFormatDate();
  if (!items.length) return <p className="text-muted">{t('highlights.empty')}</p>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((h) => (
        <li key={h.id}>
          <Card padded={false} className="flex h-full flex-col overflow-hidden">
            {h.media[0] ? <img src={h.media[0]} alt={h.title} loading="lazy" className="aspect-video w-full object-cover" /> : null}
            <div className="p-4">
              <p className="text-sm text-muted">{fmt(h.publishedAt)}</p>
              <h3 className="mt-1 text-lg">{h.title}</h3>
              {h.summary ? <p className="mt-1 line-clamp-3 text-sm text-muted">{h.summary}</p> : null}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function TrustsList({ items }: { items: PublicSite['trusts'] }) {
  const { t } = useT('site');
  if (!items.length) return <p className="text-muted">{t('trusts.empty')}</p>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {items.map((x) => (
        <li key={x.id}>
          <Card className="h-full">
            <h3 className="text-lg">{x.name}</h3>
            {x.description ? <p className="mt-2 whitespace-pre-line text-muted">{x.description}</p> : null}
            {x.attachments.length ? (
              <ul className="mt-3 space-y-1">
                {x.attachments.map((a) => (
                  <li key={a.id}>
                    <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center gap-2 font-semibold text-primary">
                      <ExternalLink size={16} aria-hidden />{a.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function ContactSection({ site }: { site: PublicSite }) {
  const { t } = useT('site');
  const s = site.sabha;
  const map = mapsLink(site);
  const row = 'flex items-start gap-3';
  return (
    <SectionBlock id="contact" title={t('contact.title')} tone="soft">
      <Card className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-4">
          <p className={row}><MapPin className="mt-1 shrink-0 text-primary" size={20} aria-hidden /><span><span className="block text-sm text-muted">{t('contact.address')}</span>{s.address || t('contact.notSet')}</span></p>
          <p className={row}><Phone className="mt-1 shrink-0 text-primary" size={20} aria-hidden /><span><span className="block text-sm text-muted">{t('contact.phone')}</span>
            {s.phone ? <a className="font-semibold text-primary" href={`tel:${s.phone.replace(/[^\d+]/g, '')}`}>{s.phone}</a> : t('contact.notSet')}</span></p>
          <p className={row}><Mail className="mt-1 shrink-0 text-primary" size={20} aria-hidden /><span><span className="block text-sm text-muted">{t('contact.email')}</span>
            {s.email ? <a className="break-all font-semibold text-primary" href={`mailto:${s.email}`}>{s.email}</a> : t('contact.notSet')}</span></p>
        </div>
        <div className="flex items-center sm:justify-end">
          {map ? (
            <a href={map} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center gap-2 rounded-theme border border-primary px-4 font-semibold text-primary hover:bg-primary/10">
              <MapPin size={18} aria-hidden />{t('contact.map')}
            </a>
          ) : null}
        </div>
      </Card>
    </SectionBlock>
  );
}

export const TextLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline">{children}</Link>
);
