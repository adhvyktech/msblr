import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, Pencil, Plus, Trash2 } from 'lucide-react';
import { useT } from '@/lib/useT';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, ImageWithFallback, Modal, PageHeader, Skeleton, statusTone } from '@/components/ui';
import { catName, useDeleteBusiness, useMyBusinesses, type Business } from '../api';
import { BusinessForm } from '../components/BusinessForm';

export default function MyBusinesses() {
  const { t, lang } = useT('business');
  const q = useMyBusinesses();
  const [editing, setEditing] = useState<Business | 'new' | null>(null);
  const [removing, setRemoving] = useState<Business | null>(null);
  const del = useDeleteBusiness(t('mine.removed'));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('mine.title')} subtitle={t('mine.subtitle')} actions={<Button icon={Plus} onClick={() => setEditing('new')}>{t('mine.add')}</Button>} />
      {q.isLoading ? <div className="grid gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        : q.isError ? <ErrorState onRetry={() => q.refetch()} />
        : q.data!.length === 0 ? (
          <EmptyState icon={Briefcase} title={t('mine.emptyTitle')} description={t('mine.emptyBody')} action={<Button icon={Plus} onClick={() => setEditing('new')}>{t('mine.add')}</Button>} />
        ) : (
          <ul className="grid gap-3">
            {q.data!.map((b) => (
              <li key={b.id}>
                <Card className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-accent-soft font-head text-2xl text-primary">
                    {b.logoUrl ? <ImageWithFallback src={b.logoUrl} alt="" className="h-full w-full object-cover" /> : b.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg">{b.status === 'APPROVED' ? <Link to={`/business/${b.id}`} className="hover:text-primary">{b.name}</Link> : b.name}</h2>
                      <Badge tone={statusTone(b.status)}>{t(`status.${b.status}`)}</Badge>
                    </div>
                    <p className="text-sm text-muted">{[catName(b.category, lang), b.area].filter(Boolean).join(' · ')}</p>
                    {b.status === 'PENDING' ? <p className="mt-2 text-sm text-warning">{t('mine.pendingNote')}</p> : null}
                    {b.status === 'HIDDEN' ? <p className="mt-2 text-sm text-danger">{t('mine.hiddenNote')}</p> : null}
                    {b.status === 'REJECTED' ? (
                      <p role="status" className="mt-2 rounded-theme-sm bg-danger-soft p-2.5 text-sm text-danger">
                        <b>{t('mine.rejectedNote')}</b>{b.remarks ? ` ${b.remarks}` : ''} {t('mine.rejectedHint')}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" icon={Pencil} onClick={() => setEditing(b)}>{t('mine.edit')}</Button>
                    <Button size="sm" variant="ghost" icon={Trash2} className="text-danger" onClick={() => setRemoving(b)} aria-label={`${t('mine.remove')} ${b.name}`}>{t('mine.remove')}</Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}

      <Modal open={!!editing} onClose={() => setEditing(null)} size="lg" title={editing === 'new' ? t('mine.add') : t('mine.editTitle')} dismissible={false}>
        {editing ? <BusinessForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} /> : null}
      </Modal>
      <ConfirmDialog
        open={!!removing} onClose={() => setRemoving(null)} danger loading={del.isPending}
        title={t('mine.removeTitle')} message={t('mine.removeBody', { name: removing?.name ?? '' })} confirmLabel={t('mine.remove')}
        onConfirm={() => removing && del.mutate(removing.id, { onSuccess: () => setRemoving(null) })}
      />
    </div>
  );
}
