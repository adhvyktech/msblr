import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, KeyRound, X } from 'lucide-react';
import { Button, ConfirmDialog, ErrorState, Modal, PageHeader, Pagination, StatusBadge, Table, Tabs, Textarea, useToast, type Column } from '@/components/ui';
import { fmtDate, formatMobile } from '@/lib/format';
import { relationKey } from './PersonForm';
import { useLoginDecision, useLoginRequests, type LoginRequest } from './api';

export default function LoginRequests() {
  const { t } = useTranslation('family');
  const toast = useToast();
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [page, setPage] = useState(1);
  const q = useLoginRequests(status, page);
  const d = useLoginDecision();
  const [approve, setApprove] = useState<LoginRequest | null>(null);
  const [reject, setReject] = useState<LoginRequest | null>(null);
  const [withdraw, setWithdraw] = useState<LoginRequest | null>(null);
  const [remarks, setRemarks] = useState('');
  const [remarksErr, setRemarksErr] = useState('');

  const run = async (fn: () => Promise<unknown>, ok: string, close: () => void) => {
    try { await fn(); toast.success(ok); close(); } catch (e) { toast.error((e as Error).message); close(); }
  };

  const columns: Column<LoginRequest>[] = [
    { key: 'person', header: t('admin.person'), render: (r) => <div><p className="font-semibold">{r.person.name}</p><p className="text-sm text-muted">{t(relationKey(r.person.relation))} · {formatMobile(r.person.mobile)}</p></div> },
    { key: 'family', header: t('admin.family'), hideOnMobile: true, render: (r) => <div><p>{r.family.membershipNo ?? '—'} · {r.family.headName ?? '—'}</p><p className="text-sm text-muted">{r.family.zone ?? ''}</p></div> },
    { key: 'date', header: t('admin.requested'), hideOnMobile: true, render: (r) => <span>{fmtDate(r.createdAt)}</span> },
    { key: 'status', header: t('admin.status'), render: (r) => <div><StatusBadge status={r.status} />{r.status === 'REJECTED' && r.remarks ? <p className="mt-1 max-w-[220px] text-xs text-muted">{r.remarks}</p> : null}</div> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => r.status === 'PENDING'
        ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="success" icon={Check} onClick={() => setApprove(r)}>{t('admin.approve')}</Button>
            <Button size="sm" variant="outline" icon={X} onClick={() => { setRemarks(''); setRemarksErr(''); setReject(r); }}>{t('admin.reject')}</Button>
          </div>
        )
        : r.status === 'APPROVED' ? <Button size="sm" variant="ghost" className="!text-danger" onClick={() => setWithdraw(r)}>{t('admin.withdraw')}</Button> : null,
    },
  ];

  return (
    <div>
      <PageHeader title={t('admin.title')} subtitle={t('admin.subtitle')} />
      <Tabs
        className="mb-4" label={t('admin.title')} value={status} onChange={(v) => { setStatus(v as typeof status); setPage(1); }}
        items={[{ id: 'PENDING', label: t('admin.tabPending') }, { id: 'APPROVED', label: t('admin.tabApproved') }, { id: 'REJECTED', label: t('admin.tabRejected') }]}
      />
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : (
        <>
          <Table
            columns={columns} rows={q.data?.data ?? []} rowKey={(r) => r.id} loading={q.isLoading} caption={t('admin.title')}
            emptyText={<span className="inline-flex items-center gap-2"><KeyRound size={18} aria-hidden />{t('admin.empty')}</span>}
          />
          <Pagination className="mt-4" page={page} pageSize={q.data?.pageSize ?? 20} total={q.data?.total ?? 0} onPage={setPage} />
        </>
      )}

      <ConfirmDialog
        open={!!approve} onClose={() => setApprove(null)} loading={d.approve.isPending}
        title={t('admin.approveTitle')} message={approve ? t('admin.approveBody', { name: approve.person.name, mobile: formatMobile(approve.person.mobile) }) : null}
        confirmLabel={t('admin.approve')}
        onConfirm={() => approve && void run(() => d.approve.mutateAsync(approve.id), t('admin.approved'), () => setApprove(null))}
      />
      <ConfirmDialog
        open={!!withdraw} onClose={() => setWithdraw(null)} loading={d.withdraw.isPending} danger
        title={t('confirm.withdrawTitle')} message={withdraw ? t('confirm.withdrawBody', { name: withdraw.person.name }) : null}
        confirmLabel={t('confirm.withdrawYes')}
        onConfirm={() => withdraw && void run(() => d.withdraw.mutateAsync(withdraw.person.id), t('toast.withdrawn'), () => setWithdraw(null))}
      />
      <Modal
        open={!!reject} onClose={() => setReject(null)} title={t('admin.rejectTitle')} size="sm"
        footer={<>
          <Button variant="ghost" onClick={() => setReject(null)}>{t('form.cancel')}</Button>
          <Button variant="danger" loading={d.reject.isPending} onClick={() => {
            if (remarks.trim().length < 2) { setRemarksErr(t('admin.remarksRequired')); return; }
            if (reject) void run(() => d.reject.mutateAsync({ id: reject.id, remarks: remarks.trim() }), t('admin.rejected'), () => setReject(null));
          }}>{t('admin.reject')}</Button>
        </>}
      >
        <p className="mb-3 text-muted">{reject ? t('admin.rejectBody', { name: reject.person.name }) : null}</p>
        <Textarea label={t('admin.remarks')} required rows={3} value={remarks} onChange={(e) => { setRemarks(e.target.value); setRemarksErr(''); }} error={remarksErr} data-autofocus />
      </Modal>
    </div>
  );
}
