import { useState } from 'react';
import { Check, EyeOff, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useT } from '@/lib/useT';
import { fmtDate } from '@/lib/format';
import {
  Badge, Button, ConfirmDialog, ErrorState, Input, Modal, PageHeader, Pagination, SearchInput, Select, Table, Tabs, Textarea, statusTone, type Column,
} from '@/components/ui';
import {
  catName, useAdminBusinesses, useCategories, useDecideBusiness, useDeleteCategory, useSaveCategory, type Business, type BusinessStatus, type Category,
} from '../api';

function BusinessTable({ queue }: { queue: boolean }) {
  const { t, lang } = useT('business');
  const [status, setStatus] = useState<BusinessStatus | ''>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const effective = queue ? 'PENDING' : status;
  const list = useAdminBusinesses({ status: effective, q, page });
  const decide = useDecideBusiness(t('admin.done'));
  const [rejecting, setRejecting] = useState<Business | null>(null);
  const [remarks, setRemarks] = useState('');
  const [hiding, setHiding] = useState<Business | null>(null);

  const cols: Column<Business>[] = [
    { key: 'name', header: t('admin.business'), render: (b) => <div><div className="font-semibold">{b.name}</div><div className="text-xs text-muted">{[catName(b.category, lang), b.area].filter(Boolean).join(' · ')}</div></div> },
    { key: 'owner', header: t('admin.owner'), render: (b) => <div><div>{b.owner.name ?? '—'}</div><div className="text-xs text-muted">{b.owner.membershipNo}</div></div> },
    { key: 'phone', header: t('admin.contact'), hideOnMobile: true, render: (b) => b.phone ?? '—' },
    { key: 'date', header: t('admin.submitted'), hideOnMobile: true, render: (b) => fmtDate(b.createdAt) },
    { key: 'status', header: t('admin.status'), render: (b) => <Badge tone={statusTone(b.status)}>{t(`status.${b.status}`)}</Badge> },
    {
      key: 'actions', header: '', align: 'right',
      render: (b) => (
        <div className="flex justify-end gap-1.5">
          {b.status !== 'APPROVED' ? <Button size="sm" variant="success" icon={Check} loading={decide.isPending && decide.variables?.id === b.id && decide.variables.action === 'approve'} onClick={() => decide.mutate({ id: b.id, action: 'approve' })} aria-label={`${t('admin.approve')} ${b.name}`}>{t('admin.approve')}</Button> : null}
          {b.status !== 'REJECTED' ? <Button size="sm" variant="outline" icon={X} onClick={() => { setRemarks(''); setRejecting(b); }} aria-label={`${t('admin.reject')} ${b.name}`}>{t('admin.reject')}</Button> : null}
          {b.status === 'APPROVED' ? <Button size="sm" variant="ghost" icon={EyeOff} onClick={() => setHiding(b)} aria-label={`${t('admin.hide')} ${b.name}`}>{t('admin.hide')}</Button> : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_200px]">
        <SearchInput onSearch={(v) => { setQ(v); setPage(1); }} placeholder={t('admin.search')} />
        {queue ? null : (
          <Select aria-label={t('admin.status')} value={status} onChange={(e) => { setStatus(e.target.value as BusinessStatus | ''); setPage(1); }} placeholder={t('admin.allStatuses')}
            options={(['PENDING', 'APPROVED', 'HIDDEN', 'REJECTED'] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))} />
        )}
      </div>
      {list.isError ? <ErrorState onRetry={() => list.refetch()} /> : (
        <>
          <Table columns={cols} rows={list.data?.data ?? []} rowKey={(b) => b.id} loading={list.isLoading} emptyText={queue ? t('admin.queueEmpty') : t('admin.empty')} caption={t('admin.title')} />
          {list.data ? <Pagination className="mt-4" page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} /> : null}
        </>
      )}

      <Modal
        open={!!rejecting} onClose={() => setRejecting(null)} title={t('admin.rejectTitle', { name: rejecting?.name ?? '' })} size="sm"
        footer={<>
          <Button variant="ghost" onClick={() => setRejecting(null)}>{t('form.cancel')}</Button>
          <Button variant="danger" disabled={remarks.trim().length < 3} loading={decide.isPending}
            onClick={() => rejecting && decide.mutate({ id: rejecting.id, action: 'reject', remarks: remarks.trim() }, { onSuccess: () => setRejecting(null) })}>{t('admin.reject')}</Button>
        </>}
      >
        <Textarea label={t('admin.remarks')} required value={remarks} onChange={(e) => setRemarks(e.target.value)} hint={t('admin.remarksHint')} rows={3} />
      </Modal>
      <ConfirmDialog
        open={!!hiding} onClose={() => setHiding(null)} loading={decide.isPending} title={t('admin.hideTitle')} message={t('admin.hideBody', { name: hiding?.name ?? '' })} confirmLabel={t('admin.hide')}
        onConfirm={() => hiding && decide.mutate({ id: hiding.id, action: 'hide' }, { onSuccess: () => setHiding(null) })}
      />
    </div>
  );
}

function Categories() {
  const { t } = useT('business');
  const cats = useCategories();
  const [edit, setEdit] = useState<Category | 'new' | null>(null);
  const [en, setEn] = useState('');
  const [hi, setHi] = useState('');
  const [del, setDel] = useState<Category | null>(null);
  const save = useSaveCategory(t('admin.categorySaved'));
  const remove = useDeleteCategory(t('admin.categoryDeleted'));
  const open = (c: Category | 'new') => { setEdit(c); setEn(c === 'new' ? '' : c.nameEn); setHi(c === 'new' ? '' : c.nameHi ?? ''); };
  const cols: Column<Category>[] = [
    { key: 'en', header: t('admin.nameEn'), render: (c) => <span className="font-semibold">{c.nameEn}</span> },
    { key: 'hi', header: t('admin.nameHi'), render: (c) => c.nameHi ?? '—' },
    { key: 'count', header: t('admin.listings'), align: 'right', render: (c) => c.count },
    {
      key: 'a', header: '', align: 'right',
      render: (c) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="outline" icon={Pencil} onClick={() => open(c)} aria-label={`${t('mine.edit')} ${c.nameEn}`}>{t('mine.edit')}</Button>
          <Button size="sm" variant="ghost" icon={Trash2} className="text-danger" onClick={() => setDel(c)} aria-label={`${t('mine.remove')} ${c.nameEn}`}>{t('mine.remove')}</Button>
        </div>
      ),
    },
  ];
  return (
    <div>
      <div className="mb-3 flex justify-end"><Button icon={Plus} onClick={() => open('new')}>{t('admin.addCategory')}</Button></div>
      {cats.isError ? <ErrorState onRetry={() => cats.refetch()} /> : <Table columns={cols} rows={cats.data ?? []} rowKey={(c) => c.id} loading={cats.isLoading} emptyText={t('admin.empty')} caption={t('admin.categories')} />}
      <Modal
        open={!!edit} onClose={() => setEdit(null)} size="sm" title={edit === 'new' ? t('admin.addCategory') : t('admin.editCategory')}
        footer={<>
          <Button variant="ghost" onClick={() => setEdit(null)}>{t('form.cancel')}</Button>
          <Button disabled={en.trim().length < 2} loading={save.isPending}
            onClick={() => save.mutate({ id: edit && edit !== 'new' ? edit.id : undefined, data: { nameEn: en.trim(), nameHi: hi.trim() || null } }, { onSuccess: () => setEdit(null) })}>{t('admin.save')}</Button>
        </>}
      >
        <div className="grid gap-4">
          <Input label={t('admin.nameEn')} required value={en} onChange={(e) => setEn(e.target.value)} />
          <Input label={t('admin.nameHi')} value={hi} onChange={(e) => setHi(e.target.value)} lang="hi" />
        </div>
      </Modal>
      <ConfirmDialog
        open={!!del} onClose={() => setDel(null)} danger loading={remove.isPending} title={t('admin.deleteCategoryTitle')}
        message={t('admin.deleteCategoryBody', { name: del?.nameEn ?? '' })} confirmLabel={t('mine.remove')}
        onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })}
      />
    </div>
  );
}

export default function AdminBusinesses() {
  const { t } = useT('business');
  const [tab, setTab] = useState('queue');
  const pending = useAdminBusinesses({ status: 'PENDING', page: 1 });
  return (
    <div>
      <PageHeader title={t('admin.title')} subtitle={t('admin.subtitle')} />
      <Tabs
        className="mb-4" label={t('admin.title')} value={tab} onChange={setTab}
        items={[{ id: 'queue', label: t('admin.tabQueue'), count: pending.data?.total }, { id: 'all', label: t('admin.tabAll') }, { id: 'categories', label: t('admin.categories') }]}
      />
      {tab === 'queue' ? <BusinessTable key="q" queue /> : tab === 'all' ? <BusinessTable key="a" queue={false} /> : <Categories />}
    </div>
  );
}
