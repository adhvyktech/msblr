import { Link, useSearchParams } from 'react-router-dom';
import { Briefcase, MapPin, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/useT';
import { AdSlot, Button, ChipGroup, EmptyState, ErrorState, Pagination, SearchInput, Select, Skeleton } from '@/components/ui';
import { catName, useAreas, useBusinesses, useCategories } from '../api';
import { BusinessCard } from '../components/BusinessCard';

export default function BusinessList() {
  const { t, lang } = useT('business');
  const { isHead } = useAuth();
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? '';
  const area = sp.get('area') ?? '';
  const categoryId = Number(sp.get('category') ?? 0) || 0;
  const page = Number(sp.get('page') ?? 1) || 1;
  const set = (patch: Record<string, string | number | null>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) (v === null || v === '' || v === 0) ? n.delete(k) : n.set(k, String(v));
    if (!('page' in patch)) n.delete('page');
    setSp(n, { replace: true });
  };
  const cats = useCategories();
  const areas = useAreas();
  const list = useBusinesses({ q, area, categoryId: categoryId || '', page });

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl">{t('list.title')}</h1>
          <p className="mt-1 text-muted">{list.data ? t('list.subtitle', { count: list.data.total }) : t('list.subtitleLoading')}</p>
        </div>
        {isHead ? <Link to="/me/business"><Button icon={Plus}>{t('list.listMine')}</Button></Link> : null}
      </header>

      <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_220px]">
        <SearchInput value={q} onSearch={(v) => set({ q: v })} placeholder={t('list.searchPlaceholder')} />
        <Select aria-label={t('list.area')} value={area} onChange={(e) => set({ area: e.target.value })} placeholder={t('list.allAreas')} options={(areas.data ?? []).map((a) => ({ value: a, label: a }))} />
      </div>
      <div className="-mx-4 mb-4 overflow-x-auto px-4 scrollbar-none">
        <ChipGroup
          label={t('list.categories')} className="flex-nowrap sm:flex-wrap" value={categoryId}
          onChange={(v) => set({ category: v })}
          options={[{ value: 0, label: t('list.all') }, ...(cats.data ?? []).map((c) => ({ value: c.id, label: catName(c, lang) }))]}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div>
          {list.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-60" />)}</div>
          ) : list.isError ? (
            <ErrorState onRetry={() => list.refetch()} />
          ) : list.data!.data.length === 0 ? (
            <EmptyState
              icon={area ? MapPin : Briefcase} title={t('list.emptyTitle')} description={t('list.emptyBody')}
              action={q || area || categoryId ? <Button variant="outline" onClick={() => setSp({}, { replace: true })}>{t('list.clear')}</Button> : undefined}
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{list.data!.data.map((b) => <BusinessCard key={b.id} b={b} />)}</div>
              <Pagination className="mt-5" page={list.data!.page} pageSize={list.data!.pageSize} total={list.data!.total} onPage={(p) => set({ page: p })} />
            </>
          )}
        </div>
        <aside className="hidden lg:block" aria-label={t('list.sponsored')}>
          <div className="sticky top-24"><AdSlot placement="WEB_SIDE" minHeight={120} /></div>
        </aside>
      </div>
    </div>
  );
}
