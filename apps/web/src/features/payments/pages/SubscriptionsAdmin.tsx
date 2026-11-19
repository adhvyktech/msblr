import { useState } from 'react';
import { CalendarClock, CheckCircle2, Hourglass, Pencil, TimerOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useT } from '@/lib/useT';
import { fmtDate, fmtNumber } from '@/lib/format';
import {
  Button, ChipGroup, DateInput, ErrorState, Modal, PageHeader, Pagination, SearchInput, Select, StatCard, StatusBadge, Table, Textarea, useToast, type Column,
} from '@/components/ui';
import { errMsg } from '../shared';
import { useOverride, useSubFamilies, useSubSummary, type FamilySub, type SubStatus } from '../api';

function OverrideModal({ family, onClose }: { family: FamilySub | null; onClose: () => void }) {
  const { t, tc } = useT('payments');
  const toast = useToast();
  const mut = useOverride();
  const [status, setStatus] = useState<SubStatus>('ACTIVE');
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [lastId, setLastId] = useState<number | null>(null);
  if (family && family.id !== lastId) {
    setLastId(family.id);
    setStatus(family.status);
    setUntil(family.validUntil ? family.validUntil.slice(0, 10) : '');
    setReason('');
    setErr('');
  }
  async function save() {
    if (reason.trim().length < 3) { setErr(t('subs.reasonRequired')); return; }
    try {
      await mut.mutateAsync({ familyId: family!.id, status, validUntil: until || null, reason: reason.trim() });
      toast.success(t('subs.saved'));
      onClose();
    } catch (e) { toast.error(errMsg(e, t('common.error'))); }
  }
  return (
    <Modal
      open={!!family} onClose={onClose} title={t('subs.overrideTitle', { name: family?.headName ?? '', no: family?.membershipNo ?? '' })}
      footer={<><Button variant="ghost" onClick={onClose}>{tc('actions.cancel')}</Button><Button loading={mut.isPending} onClick={() => void save()}>{tc('actions.save')}</Button></>}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">{t('subs.overrideHint')}</p>
        <Select
          label={t('subs.status')} value={status} onChange={(e) => setStatus(e.target.value as SubStatus)}
          options={(['ACTIVE', 'DUE', 'EXPIRED'] as const).map((s) => ({ value: s, label: tc(`status.${s}`) }))}
        />
        <DateInput label={t('subs.validUntil')} value={until} onChange={(e) => setUntil(e.target.value)} hint={t('subs.validUntilHint')} />
        <Textarea label={t('subs.reason')} required rows={2} value={reason} error={err} onChange={(e) => { setReason(e.target.value); setErr(''); }} placeholder={t('subs.reasonPlaceholder')} />
      </div>
    </Modal>
  );
}

export default function SubscriptionsAdmin() {
  const { t, tc } = useT('payments');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<FamilySub | null>(null);
  const sum = useSubSummary();
  const list = useSubFamilies({ status, q, page });

  const cols: Column<FamilySub>[] = [
    { key: 'no', header: t('subs.colNo'), render: (r) => <span className="font-semibold">{r.membershipNo ?? '—'}</span> },
    { key: 'head', header: t('subs.colHead'), render: (r) => <div><div className="font-semibold">{r.headName ?? '—'}</div><div className="text-xs text-muted">{r.headMobile ?? ''}</div></div> },
    { key: 'zone', header: t('subs.colZone'), render: (r) => r.zone ?? '—', hideOnMobile: true },
    { key: 'status', header: t('subs.colStatus'), render: (r) => <StatusBadge status={r.status} /> },
    { key: 'until', header: t('subs.colUntil'), render: (r) => fmtDate(r.validUntil), hideOnMobile: true },
    {
      key: 'act', header: '', align: 'right',
      render: (r) => <Button size="sm" variant="outline" icon={Pencil} onClick={(e) => { e.stopPropagation(); setEdit(r); }}>{t('subs.override')}</Button>,
    },
  ];
  const s = sum.data;
  return (
    <div>
      <PageHeader
        title={t('subs.title')} subtitle={t('subs.subtitle')}
        actions={<Link to="/admin/payments"><Button variant="outline" icon={Hourglass}>{t('subs.pendingBtn', { count: s?.pendingPayments ?? 0 })}</Button></Link>}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={tc('status.ACTIVE')} value={fmtNumber(s?.ACTIVE)} icon={CheckCircle2} tone="accent-soft" />
        <StatCard label={tc('status.DUE')} value={fmtNumber(s?.DUE)} icon={CalendarClock} />
        <StatCard label={tc('status.EXPIRED')} value={fmtNumber(s?.EXPIRED)} icon={TimerOff} />
        <StatCard label={t('subs.total')} value={fmtNumber(s?.total)} hint={t('subs.perYear', { amount: fmtNumber(s?.amount) })} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <ChipGroup
          label={t('subs.filter')} value={status} onChange={(v) => { setStatus(v); setPage(1); }}
          options={[{ value: '', label: t('subs.all') }, { value: 'ACTIVE', label: tc('status.ACTIVE') }, { value: 'DUE', label: tc('status.DUE') }, { value: 'EXPIRED', label: tc('status.EXPIRED') }]}
        />
        <SearchInput className="min-w-[220px] flex-1" placeholder={t('subs.search')} onSearch={(v) => { setQ(v); setPage(1); }} />
      </div>
      {list.isError ? <ErrorState onRetry={() => void list.refetch()} /> : (
        <>
          <Table columns={cols} rows={list.data?.data ?? []} rowKey={(r) => r.id} loading={list.isLoading} caption={t('subs.title')} />
          <Pagination className="mt-4" page={list.data?.page ?? 1} pageSize={list.data?.pageSize ?? 20} total={list.data?.total ?? 0} onPage={setPage} />
        </>
      )}
      <OverrideModal family={edit} onClose={() => setEdit(null)} />
    </div>
  );
}
