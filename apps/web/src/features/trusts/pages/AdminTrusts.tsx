import { useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { useT } from '@/lib/useT';
import type { UploadedFile } from '@/lib/api';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, FileUpload, IconButton, Input, Modal, PageHeader, Skeleton, Textarea } from '@/components/ui';
import { useAddAttachment, useDeleteTrust, useRemoveAttachment, useReorderTrusts, useSaveTrust, useTrusts, type Trust } from '../api';

function TrustEditor({ trustId, onClose }: { trustId: number | 'new'; onClose: () => void }) {
  const { t } = useT('trusts');
  const list = useTrusts();
  const [id, setId] = useState<number | 'new'>(trustId);
  const current = id === 'new' ? null : list.data?.find((x) => x.id === id) ?? null;
  const [name, setName] = useState(current?.name ?? '');
  const [desc, setDesc] = useState(current?.description ?? '');
  const save = useSaveTrust(t('admin.saved'));
  const add = useAddAttachment(t('admin.attachmentAdded'));
  const remove = useRemoveAttachment(t('admin.attachmentRemoved'));
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [mode, setMode] = useState<'link' | 'file'>('link');
  const urlOk = /^https?:\/\/\S+$/i.test(url.trim());
  const canAdd = label.trim().length > 0 && (mode === 'link' ? urlOk : !!file);

  return (
    <div className="grid gap-4">
      <Input label={t('admin.name')} required value={name} onChange={(e) => setName(e.target.value)} />
      <Textarea label={t('admin.description')} rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} />
      <div className="flex justify-end">
        <Button
          loading={save.isPending} disabled={name.trim().length < 2}
          onClick={() => save.mutate({ id: id === 'new' ? undefined : id, data: { name: name.trim(), description: desc.trim() || null } }, { onSuccess: (tr) => { if (id === 'new') setId((tr as Trust).id); } })}
        >{id === 'new' ? t('admin.create') : t('admin.save')}</Button>
      </div>

      <div className="border-t border-line pt-4">
        <h3 className="mb-2 text-base">{t('admin.attachments')}</h3>
        {id === 'new' ? <p className="text-sm text-muted">{t('admin.saveFirst')}</p> : (
          <>
            {current?.attachments.length ? (
              <ul className="mb-3 grid gap-2">
                {current.attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-theme-sm bg-bg px-3 py-2">
                    {a.isLink ? <ExternalLink size={16} className="shrink-0 text-accent" aria-hidden /> : <FileText size={16} className="shrink-0 text-accent" aria-hidden />}
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{a.label}</span><span className="block truncate text-xs text-muted">{a.isLink ? a.url : t('admin.uploadedFile')}</span></span>
                    <IconButton icon={Trash2} label={`${t('admin.removeAttachment')} ${a.label}`} size="sm" className="text-danger" onClick={() => remove.mutate({ id: id as number, attId: a.id })} />
                  </li>
                ))}
              </ul>
            ) : <p className="mb-3 text-sm text-muted">{t('admin.noAttachments')}</p>}
            <div className="grid gap-3 rounded-theme-sm border border-line p-3">
              <div role="group" aria-label={t('admin.addAttachment')} className="flex gap-2">
                {(['link', 'file'] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
                    className={`min-h-[40px] rounded-full border px-4 text-sm font-medium ${mode === m ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface'}`}>{t(`admin.mode.${m}`)}</button>
                ))}
              </div>
              <Input label={t('admin.label')} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('admin.labelPlaceholder')} />
              {mode === 'link'
                ? <Input label={t('admin.url')} type="url" inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} error={url && !urlOk ? t('admin.urlError') : undefined} />
                : <FileUpload kind="trust_doc" visibility="MEMBERS" accept="application/pdf,image/jpeg,image/png,image/webp" maxMb={10} label={t('admin.file')} value={file} onChange={setFile} />}
              <div className="flex justify-end">
                <Button
                  size="sm" icon={Plus} variant="outline" disabled={!canAdd} loading={add.isPending}
                  onClick={() => add.mutate(
                    { id: id as number, label: label.trim(), ...(mode === 'link' ? { url: url.trim() } : { fileId: file!.id }) },
                    { onSuccess: () => { setLabel(''); setUrl(''); setFile(null); } },
                  )}
                >{t('admin.addAttachment')}</Button>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="flex justify-end"><Button variant="ghost" onClick={onClose}>{t('admin.close')}</Button></div>
    </div>
  );
}

export default function AdminTrusts() {
  const { t } = useT('trusts');
  const q = useTrusts();
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [del, setDel] = useState<Trust | null>(null);
  const remove = useDeleteTrust(t('admin.deleted'));
  const reorder = useReorderTrusts();
  const move = (i: number, d: -1 | 1) => {
    const ids = q.data!.map((x) => x.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    reorder.mutate(ids);
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('admin.title')} subtitle={t('admin.subtitle')} actions={<Button icon={Plus} onClick={() => setEditing('new')}>{t('admin.add')}</Button>} />
      {q.isLoading ? <Skeleton className="h-40" /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : q.data!.length === 0 ? <EmptyState title={t('emptyTitle')} description={t('emptyBody')} /> : (
        <ul className="grid gap-3">
          {q.data!.map((tr, i) => (
            <li key={tr.id}>
              <Card className="flex items-center gap-3">
                <div className="flex flex-col">
                  <IconButton icon={ArrowUp} label={t('admin.moveUp')} size="sm" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)} />
                  <IconButton icon={ArrowDown} label={t('admin.moveDown')} size="sm" disabled={i === q.data!.length - 1 || reorder.isPending} onClick={() => move(i, 1)} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base">{tr.name}</h2>
                  <p className="text-sm text-muted">{t('admin.attachmentCount', { count: tr.attachments.length })}</p>
                </div>
                <Button size="sm" variant="outline" icon={Pencil} onClick={() => setEditing(tr.id)} aria-label={`${t('admin.edit')} ${tr.name}`}>{t('admin.edit')}</Button>
                <IconButton icon={Trash2} label={`${t('admin.delete')} ${tr.name}`} className="text-danger" onClick={() => setDel(tr)} />
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} size="lg" title={editing === 'new' ? t('admin.add') : t('admin.edit')}>
        {editing !== null ? <TrustEditor key={String(editing)} trustId={editing} onClose={() => setEditing(null)} /> : null}
      </Modal>
      <ConfirmDialog
        open={!!del} onClose={() => setDel(null)} danger loading={remove.isPending} title={t('admin.deleteTitle')} message={t('admin.deleteBody', { name: del?.name ?? '' })}
        confirmLabel={t('admin.delete')} onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })}
      />
    </div>
  );
}
