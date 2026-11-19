import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Cake, Megaphone, Receipt, UserCheck, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button, EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDateTime } from '@/lib/format';
import { useT } from '@/lib/useT';

interface Item {
  id: number; title: string; body: string; titleHi: string | null; bodyHi: string | null; kind: string; createdAt: string; readAt: string | null;
}
const ICONS: Record<string, LucideIcon> = { wish: Cake, payment: Wallet, registration: UserCheck, ad: Megaphone, reminder: Receipt };

export default function Inbox() {
  const { t, lang } = useT('notifications');
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['notifications', 'list', page], queryFn: () => api.list<Item>('/api/notifications', { page, pageSize: 20 }) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['notifications'] }); };
  const read = useMutation({ mutationFn: (id: number) => api.post(`/api/notifications/${id}/read`, {}), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: () => api.post('/api/notifications/read-all', {}), onSuccess: refresh });
  const rows = q.data?.data ?? [];
  const unread = rows.some((r) => !r.readAt);
  const pick = (r: Item) => ({ title: lang === 'hi' && r.titleHi ? r.titleHi : r.title, body: lang === 'hi' && r.bodyHi ? r.bodyHi : r.body });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('title')} actions={unread ? <Button size="sm" variant="outline" icon={CheckCheck} loading={readAll.isPending} onClick={() => readAll.mutate()}>{t('markAll')}</Button> : null} />
      {q.isLoading ? <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div> : q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : !rows.length ? (
        <EmptyState icon={Bell} title={t('emptyTitle')} description={t('emptyBody')} />
      ) : (
        <>
          <ul className="space-y-3">
            {rows.map((r) => {
              const { title, body } = pick(r);
              const Icon = ICONS[r.kind] ?? Bell;
              const wish = r.kind === 'wish';
              return (
                <li key={r.id}>
                  <button
                    type="button" onClick={() => { if (!r.readAt) read.mutate(r.id); }} aria-label={`${title}${r.readAt ? '' : ` (${t('unread')})`}`}
                    className={cn('flex w-full items-start gap-3 rounded-theme border p-4 text-left transition-colors',
                      wish ? 'border-gold bg-accent-soft' : r.readAt ? 'border-line bg-surface' : 'border-primary/40 bg-surface shadow-card')}
                  >
                    <span className={cn('grid shrink-0 place-items-center rounded-full', wish ? 'h-14 w-14 bg-gold text-on-primary' : 'h-11 w-11 bg-accent-soft text-accent')}><Icon size={wish ? 28 : 22} aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className={cn('block', wish ? 'font-head text-lg' : 'font-semibold')}>{title}</span>
                        {!r.readAt ? <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-hidden /> : null}
                      </span>
                      <span className={cn('mt-1 block text-[15px]', wish ? 'text-ink' : 'text-ink/80')}>{body}</span>
                      <span className="mt-1.5 block text-xs text-muted">{fmtDateTime(r.createdAt)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Pagination className="mt-4" page={page} pageSize={20} total={q.data?.total ?? 0} onPage={setPage} />
        </>
      )}
    </div>
  );
}
