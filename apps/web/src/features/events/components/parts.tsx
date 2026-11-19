import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileText, MapPin, X } from 'lucide-react';
import dayjs from 'dayjs';
import { useT } from '@/lib/useT';
import { fileSrc } from '@/lib/api';
import { fmtTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge, Card } from '@/components/ui';
import type { EventItem, MediaItem } from '../api';

export const isKey = (k: string) => k === 'AGM' || k === 'EC';

export function DateBox({ iso, hot }: { iso: string; hot?: boolean }) {
  const d = dayjs(iso);
  return (
    <div className={cn('w-14 shrink-0 rounded-xl py-1.5 text-center', hot ? 'bg-primary text-on-primary' : 'bg-accent-soft text-primary')}>
      <div className="font-head text-2xl leading-none" style={{ fontWeight: 'var(--hw)' }}>{d.format('D')}</div>
      <div className="text-[11px] font-bold uppercase">{d.format('MMM')}</div>
    </div>
  );
}

export function EventCard({ e }: { e: EventItem }) {
  const { t } = useT('events');
  const hot = isKey(e.kind);
  return (
    <Card className="flex items-start gap-3">
      <DateBox iso={e.startsAt} hot={hot} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={hot ? 'danger' : 'info'}>{t(`kinds.${e.kind}`)}</Badge>
          {e.zone ? <Badge tone="neutral">{e.zone.name}</Badge> : null}
        </div>
        <Link to={`/events/${e.id}`} className="mt-1 block font-semibold hover:text-primary">{e.title}</Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted">
          <span>{fmtTime(e.startsAt)}</span>
          {e.venue ? <span className="inline-flex items-center gap-1"><MapPin size={13} aria-hidden />{e.venue}</span> : null}
        </p>
        <EventLinks e={e} />
      </div>
    </Card>
  );
}

export function EventLinks({ e, className }: { e: EventItem; className?: string }) {
  const { t } = useT('events');
  if (!e.registrationUrl && !e.noticeUrl) return null;
  const b = 'inline-flex min-h-[40px] items-center gap-1.5 rounded-theme-sm border-[1.5px] px-3 text-sm font-semibold';
  return (
    <div className={cn('mt-2 flex flex-wrap gap-2', className)}>
      {e.registrationUrl ? <a href={e.registrationUrl} target="_blank" rel="noopener noreferrer" className={cn(b, 'border-primary bg-primary text-on-primary hover:bg-primary-2')}>{t('register')}</a> : null}
      {e.noticeUrl ? <a href={fileSrc(e.noticeUrl)} target="_blank" rel="noopener noreferrer" className={cn(b, 'border-primary text-primary hover:bg-primary/10')}><FileText size={15} aria-hidden />{t('notice')}</a> : null}
    </div>
  );
}

export function Gallery({ media }: { media: MediaItem[] }) {
  const { t } = useT('events');
  const [open, setOpen] = useState<number | null>(null);
  const n = media.length;
  useEffect(() => {
    if (open === null) return;
    const k = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpen(null);
      if (ev.key === 'ArrowRight') setOpen((i) => (i === null ? i : (i + 1) % n));
      if (ev.key === 'ArrowLeft') setOpen((i) => (i === null ? i : (i - 1 + n) % n));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, n]);
  if (!n) return null;
  const cur = open === null ? null : media[open]!;
  return (
    <>
      <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {media.map((m, i) => (
          <li key={m.id}>
            <button type="button" onClick={() => setOpen(i)} aria-label={t('photoN', { n: i + 1 })} className="block aspect-square w-full overflow-hidden rounded-lg bg-accent-soft">
              {m.mime.startsWith('video/') ? <video src={fileSrc(m.url)} className="h-full w-full object-cover" muted /> : <img src={fileSrc(m.url)} alt="" loading="lazy" className="h-full w-full object-cover" />}
            </button>
          </li>
        ))}
      </ul>
      {cur ? (
        <div role="dialog" aria-modal="true" aria-label={t('gallery')} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90" onClick={() => setOpen(null)}>
          <button type="button" aria-label={t('close')} onClick={() => setOpen(null)} className="absolute right-3 top-3 grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white"><X size={24} aria-hidden /></button>
          {n > 1 ? <button type="button" aria-label={t('prev')} onClick={(ev) => { ev.stopPropagation(); setOpen((open! - 1 + n) % n); }} className="absolute left-2 grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white"><ChevronLeft size={26} aria-hidden /></button> : null}
          <div className="max-h-full max-w-full p-12" onClick={(ev) => ev.stopPropagation()}>
            {cur.mime.startsWith('video/') ? <video src={fileSrc(cur.url)} controls autoPlay className="max-h-[80vh] max-w-full" /> : <img src={fileSrc(cur.url)} alt="" className="max-h-[80vh] max-w-full object-contain" />}
            <p className="mt-2 text-center text-sm text-white/80">{open! + 1} / {n}</p>
          </div>
          {n > 1 ? <button type="button" aria-label={t('next')} onClick={(ev) => { ev.stopPropagation(); setOpen((open! + 1) % n); }} className="absolute right-2 grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white"><ChevronRight size={26} aria-hidden /></button> : null}
        </div>
      ) : null}
    </>
  );
}
