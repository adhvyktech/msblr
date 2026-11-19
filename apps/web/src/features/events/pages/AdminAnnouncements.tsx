import { useState } from 'react';
import { Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import { useT } from '@/lib/useT';
import { fmtDate } from '@/lib/format';
import { Badge, Button, ConfirmDialog, ErrorState, Input, Modal, PageHeader, Table, Textarea, Toggle, type Column } from '@/components/ui';
import { useAnnouncements, useDeleteAnnouncement, useSaveAnnouncement, type Announcement } from '../api';

export default function AdminAnnouncements() {
  const { t } = useT('events');
  const q = useAnnouncements();
  const save = useSaveAnnouncement(t('admin.saved'));
  const remove = useDeleteAnnouncement(t('admin.deleted'));
  const [edit, setEdit] = useState<Announcement | 'new' | null>(null);
  const [del, setDel] = useState<Announcement | null>(null);
  const [f, setF] = useState({ title: '', body: '', pinned: false, expires: '' });
  const open = (a: Announcement | 'new') => {
    setEdit(a);
    setF(a === 'new' ? { title: '', body: '', pinned: false, expires: '' } : { title: a.title, body: a.body ?? '', pinned: a.pinned, expires: a.expiresAt ? a.expiresAt.slice(0, 10) : '' });
  };
  const cols: Column<Announcement>[] = [
    { key: 't', header: t('admin.fTitle'), render: (a) => <div><div className="flex items-center gap-1.5 font-semibold">{a.pinned ? <Pin size={14} className="text-primary" aria-label={t('admin.pinned')} /> : null}{a.title}</div>{a.body ? <div className="line-clamp-1 text-xs text-muted">{a.body}</div> : null}</div> },
    { key: 'e', header: t('admin.expires'), hideOnMobile: true, render: (a) => (a.expiresAt ? fmtDate(a.expiresAt) : t('admin.never')) },
    { key: 's', header: t('admin.status'), render: (a) => <Badge tone={a.expired ? 'danger' : 'success'}>{a.expired ? t('admin.expired') : t('admin.showing')}</Badge> },
    {
      key: 'a', header: '', align: 'right',
      render: (a) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="outline" icon={Pencil} onClick={() => open(a)} aria-label={`${t('admin.edit')} ${a.title}`}>{t('admin.edit')}</Button>
          <Button size="sm" variant="ghost" icon={Trash2} className="text-danger" onClick={() => setDel(a)} aria-label={`${t('admin.delete')} ${a.title}`}>{t('admin.delete')}</Button>
        </div>
      ),
    },
  ];
  return (
    <div>
      <PageHeader title={t('admin.annTitle')} subtitle={t('admin.annSub')} actions={<Button icon={Plus} onClick={() => open('new')}>{t('admin.addAnn')}</Button>} />
      {q.isError ? <ErrorState onRetry={() => q.refetch()} /> : <Table columns={cols} rows={q.data ?? []} rowKey={(a) => a.id} loading={q.isLoading} emptyText={t('admin.noAnn')} caption={t('admin.annTitle')} />}
      <Modal
        open={!!edit} onClose={() => setEdit(null)} title={edit === 'new' ? t('admin.addAnn') : t('admin.edit')}
        footer={<>
          <Button variant="ghost" onClick={() => setEdit(null)}>{t('admin.cancel')}</Button>
          <Button disabled={f.title.trim().length < 3} loading={save.isPending}
            onClick={() => save.mutate({ id: edit && edit !== 'new' ? edit.id : undefined, data: { title: f.title.trim(), body: f.body.trim() || null, pinned: f.pinned, expiresAt: f.expires ? new Date(`${f.expires}T23:59:59`).toISOString() : null } }, { onSuccess: () => setEdit(null) })}>{t('admin.save')}</Button>
        </>}
      >
        <div className="grid gap-4">
          <Input label={t('admin.fTitle')} required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <Textarea label={t('admin.details')} rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          <Input label={t('admin.expires')} type="date" value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} hint={t('admin.expiresHint')} />
          <Toggle checked={f.pinned} onChange={(v) => setF({ ...f, pinned: v })} label={t('admin.pin')} description={t('admin.pinHint')} />
        </div>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger loading={remove.isPending} title={t('admin.deleteTitle')} message={t('admin.deleteBody', { name: del?.title ?? '' })} confirmLabel={t('admin.delete')} onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })} />
    </div>
  );
}
