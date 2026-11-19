import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Send, Trash2 } from 'lucide-react';
import { useT } from '@/lib/useT';
import { fmtDate } from '@/lib/format';
import type { UploadedFile } from '@/lib/api';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, ImageWithFallback, Input, Modal, Pagination, Select, Skeleton, Textarea, statusTone } from '@/components/ui';
import { MultiUpload } from '@/features/business/components/MultiUpload';
import { useDeleteHighlight, useEvents, useHighlights, useSaveHighlight, type HighlightItem } from '../api';

function HighlightForm({ initial, onDone }: { initial?: HighlightItem; onDone?: () => void }) {
  const { t } = useT('events');
  const events = useEvents({ page: 1, pageSize: 100, admin: true });
  const save = useSaveHighlight(initial ? t('admin.hlUpdated') : t('admin.hlPosted'));
  const [title, setTitle] = useState(initial?.title ?? '');
  const [summary, setSummary] = useState(initial?.summary ?? '');
  const [eventId, setEventId] = useState(initial?.eventId ? String(initial.eventId) : '');
  const [media, setMedia] = useState<UploadedFile[]>((initial?.media ?? []).map((m) => ({ id: m.id, url: m.url, mime: m.mime })));
  const [tried, setTried] = useState(false);
  const bad = title.trim().length < 3;
  const options = (events.data?.data ?? []).filter((e) => e.canEdit || e.id === initial?.eventId).map((e) => ({ value: e.id, label: `${e.title} · ${fmtDate(e.startsAt)}` }));
  const submit = () => {
    setTried(true);
    if (bad) return;
    save.mutate(
      { id: initial?.id, data: { title: title.trim(), summary: summary.trim() || null, mediaFileIds: media.map((m) => m.id), eventId: eventId ? Number(eventId) : null, status: 'PUBLISHED' } },
      { onSuccess: () => { if (!initial) { setTitle(''); setSummary(''); setEventId(''); setMedia([]); setTried(false); } onDone?.(); } },
    );
  };
  return (
    <div className="grid gap-4">
      <Input label={t('admin.hlTitle')} required value={title} onChange={(e) => setTitle(e.target.value)} error={tried && bad ? t('admin.errTitle') : undefined} placeholder={t('admin.hlTitlePh')} />
      <Textarea label={t('admin.hlSummary')} rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
      <MultiUpload kind="highlight" visibility="MEMBERS" max={12} label={t('admin.hlPhotos')} hint={t('admin.hlPhotosHint')} value={media} onChange={setMedia} accept="image/jpeg,image/png,image/webp,video/mp4" maxMb={20} />
      <Select label={t('admin.hlEvent')} value={eventId} onChange={(e) => setEventId(e.target.value)} placeholder={t('admin.hlNoEvent')} options={options} />
      <Button size="lg" fullWidth icon={Send} loading={save.isPending} onClick={submit}>{initial ? t('admin.save') : t('admin.hlPost')}</Button>
    </div>
  );
}

export default function AdminHighlights() {
  const { t } = useT('events');
  const [page, setPage] = useState(1);
  const q = useHighlights({ page, pageSize: 10, admin: true });
  const [edit, setEdit] = useState<HighlightItem | null>(null);
  const [del, setDel] = useState<HighlightItem | null>(null);
  const remove = useDeleteHighlight(t('admin.deleted'));
  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[420px_1fr]">
      <section aria-labelledby="qp">
        <h1 id="qp" className="mb-1 text-2xl">{t('admin.hlTitleH')}</h1>
        <p className="mb-4 text-muted">{t('admin.hlSub')}</p>
        <Card><HighlightForm /></Card>
      </section>
      <section aria-labelledby="posted">
        <h2 id="posted" className="mb-3 text-lg">{t('admin.hlPostedList')}</h2>
        {q.isLoading ? <Skeleton className="h-40" /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : q.data!.data.length === 0 ? <EmptyState title={t('emptyHighlights')} description={t('admin.hlEmptyBody')} /> : (
          <>
            <ul className="grid gap-3">
              {q.data!.data.map((h) => (
                <li key={h.id}>
                  <Card className="flex gap-3">
                    <ImageWithFallback src={h.coverUrl ?? undefined} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <Link to={`/highlights/${h.id}`} className="block truncate font-semibold hover:text-primary">{h.title}</Link>
                      <p className="text-sm text-muted">{fmtDate(h.publishedAt)} · {h.authorName ?? t('sabhaTeam')} · {t('admin.photosN', { count: h.media.length })}</p>
                      {h.status === 'DRAFT' ? <Badge tone={statusTone('DRAFT')}>{t('admin.draft')}</Badge> : null}
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="outline" icon={Pencil} onClick={() => setEdit(h)} aria-label={`${t('admin.edit')} ${h.title}`}>{t('admin.edit')}</Button>
                        <Button size="sm" variant="ghost" icon={Trash2} className="text-danger" onClick={() => setDel(h)} aria-label={`${t('admin.delete')} ${h.title}`}>{t('admin.delete')}</Button>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
            <Pagination className="mt-4" page={q.data!.page} pageSize={q.data!.pageSize} total={q.data!.total} onPage={setPage} />
          </>
        )}
      </section>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={t('admin.edit')} size="md" dismissible={false}>
        {edit ? <HighlightForm key={edit.id} initial={edit} onDone={() => setEdit(null)} /> : null}
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger loading={remove.isPending} title={t('admin.deleteTitle')} message={t('admin.deleteBody', { name: del?.title ?? '' })} confirmLabel={t('admin.delete')} onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })} />
    </div>
  );
}
