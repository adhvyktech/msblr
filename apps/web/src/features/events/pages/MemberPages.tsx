import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Images, MapPin, User } from 'lucide-react';
import { useT } from '@/lib/useT';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, ImageWithFallback, PageHeader, Pagination, Select, Skeleton, Tabs } from '@/components/ui';
import { useEvent, useEvents, useHighlight, useHighlights, useZones } from '../api';
import { EventCard, EventLinks, Gallery, isKey } from '../components/parts';

export function Events() {
  const { t } = useT('events');
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [zoneId, setZoneId] = useState<number | ''>('');
  const [page, setPage] = useState(1);
  const zones = useZones();
  const q = useEvents({ when: tab, zoneId, page });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('title')} />
      <Tabs className="mb-3" label={t('title')} value={tab} onChange={(v) => { setTab(v as 'upcoming' | 'past'); setPage(1); }} items={[{ id: 'upcoming', label: t('upcoming') }, { id: 'past', label: t('past') }]} />
      <Select wrapperClassName="mb-4" aria-label={t('zone')} value={zoneId} onChange={(e) => { setZoneId(e.target.value ? Number(e.target.value) : ''); setPage(1); }} placeholder={t('allZones')} options={(zones.data ?? []).map((z) => ({ value: z.id, label: z.name }))} />
      {q.isLoading ? <div className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        : q.isError ? <ErrorState onRetry={() => q.refetch()} />
        : q.data!.data.length === 0 ? <EmptyState icon={CalendarDays} title={t(tab === 'upcoming' ? 'emptyUpcoming' : 'emptyPast')} description={t('emptyBody')} />
        : (
          <>
            <ul className="grid gap-3">{q.data!.data.map((e) => <li key={e.id}><EventCard e={e} /></li>)}</ul>
            <Pagination className="mt-5" page={q.data!.page} pageSize={q.data!.pageSize} total={q.data!.total} onPage={setPage} />
          </>
        )}
    </div>
  );
}

export function EventDetailPage() {
  const { t } = useT('events');
  const { id } = useParams();
  const q = useEvent(id);
  if (q.isLoading) return <div className="mx-auto max-w-2xl"><Skeleton className="h-48" /></div>;
  if (q.isError || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  const e = q.data;
  return (
    <article className="mx-auto max-w-2xl">
      <Link to="/events" className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 text-primary"><ArrowLeft size={18} aria-hidden />{t('backToEvents')}</Link>
      <Card>
        <div className="flex flex-wrap gap-1.5"><Badge tone={isKey(e.kind) ? 'danger' : 'info'}>{t(`kinds.${e.kind}`)}</Badge>{e.zone ? <Badge>{e.zone.name}</Badge> : null}{e.status === 'DRAFT' ? <Badge tone="warning">{t('draft')}</Badge> : null}</div>
        <h1 className="mt-2 text-2xl">{e.title}</h1>
        <p className="mt-2 flex items-center gap-2 text-ink/80"><CalendarDays size={18} className="text-primary" aria-hidden />{fmtDateTime(e.startsAt)}{e.endsAt ? ` – ${fmtDateTime(e.endsAt)}` : ''}</p>
        {e.venue ? <p className="mt-1 flex items-center gap-2 text-ink/80"><MapPin size={18} className="text-primary" aria-hidden />{e.venue}</p> : null}
        {e.body ? <p className="mt-4 whitespace-pre-line">{e.body}</p> : null}
        <EventLinks e={e} className="mt-4" />
      </Card>
      {e.highlights.length ? (
        <section className="mt-6">
          <h2 className="mb-2 text-lg">{t('highlightsFromEvent')}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">{e.highlights.map((h) => <li key={h.id}><HighlightCard h={h} /></li>)}</ul>
        </section>
      ) : null}
    </article>
  );
}

export function HighlightCard({ h }: { h: { id: number; title: string; summary: string | null; coverUrl: string | null; publishedAt: string } }) {
  return (
    <Link to={`/highlights/${h.id}`} className="block overflow-hidden rounded-theme border border-line bg-surface shadow-card transition-shadow hover:shadow-pop">
      <ImageWithFallback src={h.coverUrl ?? undefined} alt="" className="h-36 w-full object-cover" />
      <div className="p-3"><div className="font-semibold">{h.title}</div><div className="mt-0.5 line-clamp-2 text-sm text-muted">{h.summary ?? fmtDate(h.publishedAt)}</div></div>
    </Link>
  );
}

export function Highlights() {
  const { t } = useT('events');
  const [page, setPage] = useState(1);
  const q = useHighlights({ page, pageSize: 12 });
  return (
    <div>
      <PageHeader title={t('highlights')} subtitle={t('highlightsSub')} />
      {q.isLoading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-52" />)}</div>
        : q.isError ? <ErrorState onRetry={() => q.refetch()} />
        : q.data!.data.length === 0 ? <EmptyState icon={Images} title={t('emptyHighlights')} description={t('emptyBody')} />
        : (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{q.data!.data.map((h) => <li key={h.id}><HighlightCard h={h} /></li>)}</ul>
            <Pagination className="mt-5" page={q.data!.page} pageSize={q.data!.pageSize} total={q.data!.total} onPage={setPage} />
          </>
        )}
    </div>
  );
}

export function HighlightDetailPage() {
  const { t } = useT('events');
  const { id } = useParams();
  const nav = useNavigate();
  const q = useHighlight(id);
  if (q.isLoading) return <div className="mx-auto max-w-2xl"><Skeleton className="h-64" /></div>;
  if (q.isError || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  const h = q.data;
  return (
    <article className="mx-auto max-w-2xl">
      <div className="relative overflow-hidden rounded-theme">
        {h.coverUrl && !h.media[0]?.mime.startsWith('video/') ? <ImageWithFallback src={h.coverUrl ?? undefined} alt="" className="h-64 w-full object-cover" /> : <div className="h-64 w-full bg-gradient-to-br from-primary via-primary-2 to-accent" aria-hidden />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <button type="button" onClick={() => nav(-1)} aria-label={t('close')} className="absolute left-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-black/45 text-white"><ArrowLeft size={22} aria-hidden /></button>
        <div className="absolute inset-x-4 bottom-4 text-white">
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold">{t('highlight')}</span>
          <h1 className="mt-1.5 text-2xl text-white">{h.title}</h1>
          <p className="text-sm opacity-90">{fmtDate(h.publishedAt)}{h.event ? ` · ${h.event.title}` : ''}</p>
        </div>
      </div>
      {h.summary ? <p className="my-4 whitespace-pre-line px-1">{h.summary}</p> : <div className="h-4" />}
      <Gallery media={h.media} />
      <p className="mt-4 flex items-center gap-2 px-1 text-sm text-muted"><User size={14} aria-hidden />{t('postedBy', { name: h.authorName ?? t('sabhaTeam'), date: fmtDate(h.publishedAt) })}</p>
      {h.event ? <Link to={`/events/${h.event.id}`} className="mt-3 inline-block"><Button variant="outline" size="sm">{t('viewEvent')}</Button></Link> : null}
    </article>
  );
}
