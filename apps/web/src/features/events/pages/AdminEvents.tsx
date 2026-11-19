import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useT } from '@/lib/useT';
import { useAuth } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import type { UploadedFile } from '@/lib/api';
import { Badge, Button, ConfirmDialog, ErrorState, FileUpload, Input, Modal, PageHeader, Pagination, Select, Table, Textarea, statusTone, type Column } from '@/components/ui';
import { EVENT_KINDS, fromLocalInput, toLocalInput, useDeleteEvent, useEvents, useSaveEvent, useZones, type EventItem, type EventKind } from '../api';

function EventForm({ initial, onClose }: { initial?: EventItem; onClose: () => void }) {
  const { t } = useT('events');
  const { me } = useAuth();
  const zones = useZones();
  const scoped = !!me && me.zoneIds.length > 0 && !me.roles.some((r) => r === 'super_admin' || r === 'admin');
  const zoneOptions = (zones.data ?? []).filter((z) => !scoped || me!.zoneIds.includes(z.id));
  const save = useSaveEvent(initial ? t('admin.updated') : t('admin.created'));
  const [f, setF] = useState({
    title: initial?.title ?? '', kind: (initial?.kind ?? 'SOCIAL') as EventKind, zoneId: initial?.zoneId ? String(initial.zoneId) : scoped ? String(me!.zoneIds[0]) : '',
    startsAt: toLocalInput(initial?.startsAt), endsAt: toLocalInput(initial?.endsAt), venue: initial?.venue ?? '', body: initial?.body ?? '',
    registrationUrl: initial?.registrationUrl ?? '', status: initial?.status ?? 'PUBLISHED',
  });
  const [notice, setNotice] = useState<UploadedFile | null>(initial?.noticeFileId ? { id: initial.noticeFileId, url: initial.noticeUrl ?? '', mime: 'application/pdf' } : null);
  const [tried, setTried] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const errs = {
    title: f.title.trim().length < 3 ? t('admin.errTitle') : '',
    startsAt: !f.startsAt ? t('admin.errStart') : '',
    endsAt: f.endsAt && f.startsAt && new Date(f.endsAt) < new Date(f.startsAt) ? t('admin.errEnd') : '',
    url: f.registrationUrl.trim() && !/^https?:\/\/\S+$/i.test(f.registrationUrl.trim()) ? t('admin.errUrl') : '',
    zone: scoped && !f.zoneId ? t('admin.errZone') : '',
  };
  const bad = Object.values(errs).some(Boolean);
  const submit = () => {
    setTried(true);
    if (bad) return;
    save.mutate({
      id: initial?.id,
      data: {
        title: f.title.trim(), kind: f.kind, zoneId: f.zoneId ? Number(f.zoneId) : null, startsAt: fromLocalInput(f.startsAt)!, endsAt: fromLocalInput(f.endsAt),
        venue: f.venue.trim() || null, body: f.body.trim() || null, registrationUrl: f.registrationUrl.trim() || null, noticeFileId: notice?.id ?? null, status: f.status,
      },
    }, { onSuccess: onClose });
  };
  const e = (k: keyof typeof errs) => (tried ? errs[k] : '') || undefined;
  return (
    <div className="grid gap-4">
      <Input label={t('admin.fTitle')} required value={f.title} onChange={(ev) => set('title', ev.target.value)} error={e('title')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label={t('admin.kind')} value={f.kind} onChange={(ev) => set('kind', ev.target.value as EventKind)} options={EVENT_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))} />
        <Select label={t('zone')} required={scoped} value={f.zoneId} onChange={(ev) => set('zoneId', ev.target.value)} error={e('zone')} placeholder={scoped ? t('admin.chooseZone') : t('admin.allSabha')} options={zoneOptions.map((z) => ({ value: z.id, label: z.name }))} />
        <Input label={t('admin.starts')} required type="datetime-local" value={f.startsAt} onChange={(ev) => set('startsAt', ev.target.value)} error={e('startsAt')} />
        <Input label={t('admin.ends')} type="datetime-local" value={f.endsAt} onChange={(ev) => set('endsAt', ev.target.value)} error={e('endsAt')} />
      </div>
      <Input label={t('admin.venue')} value={f.venue} onChange={(ev) => set('venue', ev.target.value)} />
      <Textarea label={t('admin.details')} rows={4} value={f.body} onChange={(ev) => set('body', ev.target.value)} />
      <Input label={t('admin.regUrl')} type="url" inputMode="url" placeholder="https://" value={f.registrationUrl} onChange={(ev) => set('registrationUrl', ev.target.value)} error={e('url')} />
      <FileUpload kind="document" visibility="MEMBERS" accept="application/pdf,image/jpeg,image/png,image/webp" maxMb={10} label={t('admin.noticePdf')} value={notice} onChange={setNotice} />
      <Select label={t('admin.status')} value={f.status} onChange={(ev) => set('status', ev.target.value as 'DRAFT' | 'PUBLISHED')} hint={t('admin.statusHint')} options={[{ value: 'PUBLISHED', label: t('admin.published') }, { value: 'DRAFT', label: t('admin.draft') }]} />
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>{t('admin.cancel')}</Button><Button loading={save.isPending} onClick={submit}>{t('admin.save')}</Button></div>
    </div>
  );
}

export default function AdminEvents() {
  const { t } = useT('events');
  const [page, setPage] = useState(1);
  const q = useEvents({ page, pageSize: 20, admin: true });
  const [edit, setEdit] = useState<EventItem | 'new' | null>(null);
  const [del, setDel] = useState<EventItem | null>(null);
  const remove = useDeleteEvent(t('admin.deleted'));
  const cols: Column<EventItem>[] = [
    { key: 'title', header: t('admin.fTitle'), render: (e) => <div><div className="font-semibold">{e.title}</div><div className="text-xs text-muted">{e.venue}</div></div> },
    { key: 'kind', header: t('admin.kind'), render: (e) => t(`kinds.${e.kind}`) },
    { key: 'zone', header: t('zone'), hideOnMobile: true, render: (e) => e.zone?.name ?? t('admin.allSabha') },
    { key: 'when', header: t('admin.starts'), render: (e) => fmtDateTime(e.startsAt) },
    { key: 'status', header: t('admin.status'), render: (e) => <Badge tone={statusTone(e.status)}>{e.status === 'DRAFT' ? t('admin.draft') : t('admin.published')}</Badge> },
    {
      key: 'a', header: '', align: 'right',
      render: (e) => e.canEdit ? (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="outline" icon={Pencil} onClick={() => setEdit(e)} aria-label={`${t('admin.edit')} ${e.title}`}>{t('admin.edit')}</Button>
          <Button size="sm" variant="ghost" icon={Trash2} className="text-danger" onClick={() => setDel(e)} aria-label={`${t('admin.delete')} ${e.title}`}>{t('admin.delete')}</Button>
        </div>
      ) : <span className="text-xs text-muted">{t('admin.otherZone')}</span>,
    },
  ];
  return (
    <div>
      <PageHeader title={t('admin.eventsTitle')} subtitle={t('admin.eventsSub')} actions={<Button icon={Plus} onClick={() => setEdit('new')}>{t('admin.addEvent')}</Button>} />
      {q.isError ? <ErrorState onRetry={() => q.refetch()} /> : (
        <>
          <Table columns={cols} rows={q.data?.data ?? []} rowKey={(e) => e.id} loading={q.isLoading} emptyText={t('admin.noEvents')} caption={t('admin.eventsTitle')} />
          {q.data ? <Pagination className="mt-4" page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} /> : null}
        </>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} size="lg" dismissible={false} title={edit === 'new' ? t('admin.addEvent') : t('admin.edit')}>
        {edit ? <EventForm key={edit === 'new' ? 'new' : edit.id} initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} /> : null}
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger loading={remove.isPending} title={t('admin.deleteTitle')} message={t('admin.deleteBody', { name: del?.title ?? '' })} confirmLabel={t('admin.delete')} onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })} />
    </div>
  );
}
