import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Briefcase, LayoutGrid, List, MessageCircle, Phone, SlidersHorizontal, Users } from 'lucide-react';
import {
  Avatar, Button, Card, EmptyState, ErrorState, IconButton, Input, LockedField, PageHeader, Pagination, SearchInput, Select, Skeleton, Toggle,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatMobile, whatsappLink } from '@/lib/format';
import { ActionLink } from '../ActionLink';
import { useDirectory, useZones, type DirectoryFamily } from '../api';

const PAGE_SIZE = 12;

function FamilyCard({ f, list }: { f: DirectoryFamily; list: boolean }) {
  const { t } = useTranslation('members');
  const head = f.head;
  const phoneHidden = !!head?.hidden.includes('mobile');
  const wa = head?.whatsapp ?? null;
  return (
    <Card className={cn('flex !p-4', list ? 'flex-col gap-3 sm:flex-row sm:items-center' : 'flex-col')}>
      <Link to={`/members/${f.id}`} className={cn('flex min-w-0 gap-3 rounded-theme-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary', list ? 'items-center sm:w-72 sm:shrink-0' : 'items-start')}>
        <Avatar name={head?.name} src={head?.photoUrl} size={50} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{head?.name ?? '—'}</p>
          <p className="truncate text-sm text-muted">{f.membershipNo} · {f.zone ?? f.area ?? ''}</p>
        </div>
      </Link>
      <div className={cn('grid gap-1.5 text-sm', list ? 'flex-1 sm:grid-cols-3' : 'mt-3')}>
        <div className="flex items-center gap-2"><Phone size={15} className="shrink-0 text-muted" aria-hidden />{head?.mobile ? formatMobile(head.mobile) : phoneHidden ? <LockedField /> : '—'}</div>
        <div className="flex min-w-0 items-center gap-2"><Briefcase size={15} className="shrink-0 text-muted" aria-hidden /><span className="truncate">{f.businesses[0]?.name ?? t('card.noBusiness')}</span></div>
        <div className="flex items-center gap-2"><Users size={15} className="shrink-0 text-muted" aria-hidden />{t('card.members', { count: f.memberCount })}</div>
      </div>
      <div className={cn('flex gap-2', list ? 'sm:w-64 sm:shrink-0' : 'mt-4')}>
        {head?.mobile ? <ActionLink href={`tel:+91${head.mobile}`} icon={Phone}>{t('call')}</ActionLink> : null}
        {wa ? <ActionLink href={whatsappLink(wa)} target="_blank" rel="noreferrer" icon={MessageCircle} variant="outline">{t('whatsapp')}</ActionLink> : null}
        {!head?.mobile && !wa ? <Link to={`/members/${f.id}`} className="flex-1"><Button size="sm" variant="outline" fullWidth>{t('viewProfile')}</Button></Link> : null}
      </div>
    </Card>
  );
}

export default function Directory() {
  const { t } = useTranslation('members');
  const [sp, setSp] = useSearchParams();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const q = sp.get('q') ?? '';
  const zoneId = sp.get('zone') ?? '';
  const area = sp.get('area') ?? '';
  const biz = sp.get('biz') === '1';
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1);
  const zones = useZones();
  const res = useDirectory({ q, zoneId, area, hasBusiness: biz, page, pageSize: PAGE_SIZE });

  const set = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
    if (!('page' in patch)) n.delete('page');
    setSp(n, { replace: true });
  };
  const activeFilters = [zoneId, area, biz ? '1' : ''].filter(Boolean).length;

  const filters = (
    <div className="space-y-4">
      <Select
        label={t('filters.zone')} value={zoneId} onChange={(e) => set({ zone: e.target.value })} placeholder={t('filters.allZones')}
        options={(zones.data ?? []).map((z) => ({ value: z.id, label: z.name }))}
      />
      <Input label={t('filters.area')} value={area} placeholder={t('filters.areaHint')} onChange={(e) => set({ area: e.target.value })} />
      <Toggle checked={biz} onChange={(v) => set({ biz: v ? '1' : null })} label={t('filters.business')} />
      {activeFilters ? <Button variant="ghost" size="sm" onClick={() => set({ zone: null, area: null, biz: null })}>{t('filters.clear')}</Button> : null}
    </div>
  );

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
        <aside className="hidden lg:block"><Card>{filters}</Card></aside>
        <div className="min-w-0">
          <div className="flex gap-2">
            <SearchInput value={q} onSearch={(v) => set({ q: v || null })} placeholder={t('searchPlaceholder')} className="flex-1" />
            <IconButton icon={SlidersHorizontal} label={t('filters.title')} variant="outline" badge={activeFilters || undefined} className="lg:hidden" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} />
          </div>
          {showFilters ? <Card className="mt-3 lg:hidden">{filters}</Card> : null}
          <div className="my-3 flex items-center justify-between gap-3 text-sm text-muted">
            <span aria-live="polite">{res.data ? t('showing', { shown: res.data.data.length, total: res.data.total }) : ' '}</span>
            <div className="flex gap-1" role="group" aria-label={t('view')}>
              <IconButton icon={LayoutGrid} label={t('grid')} size="sm" variant={view === 'grid' ? 'solid' : 'outline'} onClick={() => setView('grid')} aria-pressed={view === 'grid'} />
              <IconButton icon={List} label={t('list')} size="sm" variant={view === 'list' ? 'solid' : 'outline'} onClick={() => setView('list')} aria-pressed={view === 'list'} />
            </div>
          </div>
          {res.isError ? <ErrorState onRetry={() => void res.refetch()} /> : res.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44" />)}</div>
          ) : res.data && res.data.data.length === 0 ? (
            <EmptyState icon={Users} title={t('empty.title')} description={t('empty.body')} action={q || activeFilters ? <Button variant="outline" onClick={() => setSp({}, { replace: true })}>{t('filters.clearAll')}</Button> : undefined} />
          ) : (
            <>
              <div className={cn('grid gap-4', view === 'grid' ? 'sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1')}>
                {res.data?.data.map((f) => <FamilyCard key={f.id} f={f} list={view === 'list'} />)}
              </div>
              <Pagination className="mt-6" page={res.data?.page ?? 1} pageSize={PAGE_SIZE} total={res.data?.total ?? 0} onPage={(p) => set({ page: String(p) })} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
