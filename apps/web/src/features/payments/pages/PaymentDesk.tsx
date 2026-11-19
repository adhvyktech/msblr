import { useEffect, useState } from 'react';
import { CheckCircle2, Check, Download, ImageOff, Search, X, ZoomIn } from 'lucide-react';
import { useT } from '@/lib/useT';
import { downloadFile } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtINR } from '@/lib/format';
import {
  Avatar, Button, Card, Checkbox, ConfirmDialog, Drawer, EmptyState, ErrorState, ImageWithFallback, Modal, PageHeader, Pagination,
  SearchInput, Select, StatusBadge, Table, Tabs, Textarea, useToast, type Column,
} from '@/components/ui';
import { errMsg, useMediaQuery } from '../shared';
import { useDecide, useDeskList, usePaymentDetail, type PayStatus, type PaymentItem } from '../api';

function Detail({ id, onDone }: { id: number; onDone: () => void }) {
  const { t } = useT('payments');
  const toast = useToast();
  const q = usePaymentDetail(id);
  const { approve, reject } = useDecide();
  const [checks, setChecks] = useState({ amount: false, date: false, credited: false });
  const [remarks, setRemarks] = useState('');
  const [remarkErr, setRemarkErr] = useState('');
  const [zoom, setZoom] = useState(false);
  const [big, setBig] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { setChecks({ amount: false, date: false, credited: false }); setRemarks(''); setRemarkErr(''); }, [id]);

  if (q.isLoading) return <Card><p className="text-muted">{t('common.loading')}</p></Card>;
  if (q.isError || !q.data) return <ErrorState onRetry={() => void q.refetch()} />;
  const p = q.data;
  const pending = p.status === 'PENDING';
  const unchecked = !checks.amount || !checks.date || !checks.credited;

  async function doApprove() {
    try {
      const r = await approve.mutateAsync({ id: p.id, remarks: remarks.trim() });
      toast.success(t('desk.approved', { no: (r as PaymentItem).receipt?.serialNo ?? '' }));
      setConfirm(false);
      onDone();
    } catch (e) { setConfirm(false); toast.error(errMsg(e, t('common.error'))); }
  }
  async function doReject() {
    if (remarks.trim().length < 3) { setRemarkErr(t('desk.remarksRequired')); return; }
    try {
      await reject.mutateAsync({ id: p.id, remarks: remarks.trim() });
      toast.success(t('desk.rejected'));
      onDone();
    } catch (e) { toast.error(errMsg(e, t('common.error'))); }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg">{p.payerName ?? '—'}{p.membershipNo ? ` · ${p.membershipNo}` : ''}</h2>
          <p className="text-sm text-muted">{p.purpose ?? t(`kind.${p.kind}`)} · {t('desk.submitted', { date: fmtDateTime(p.createdAt) })}</p>
        </div>
        <StatusBadge status={p.status} />
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="shrink-0">
          {p.screenshotUrl ? (
            <button type="button" onClick={() => setBig(true)} className="group relative block overflow-hidden rounded-theme-sm border border-line bg-white" aria-label={t('desk.zoom')}>
              <ImageWithFallback src={p.screenshotUrl} alt={t('desk.screenshotAlt')} className="h-56 w-40 object-cover object-top" />
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-1.5 text-xs font-semibold text-white"><ZoomIn size={14} aria-hidden />{t('desk.zoom')}</span>
            </button>
          ) : (
            <div className="grid h-56 w-40 place-items-center rounded-theme-sm border border-dashed border-line text-center text-sm text-muted"><div><ImageOff className="mx-auto mb-1" size={24} aria-hidden />{t('desk.noScreenshot')}</div></div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">{t('desk.amount')}</dt><dd className="font-semibold">{fmtINR(p.amount)}</dd>
            <dt className="text-muted">UTR</dt><dd className="break-all font-semibold">{p.utr}</dd>
            <dt className="text-muted">{t('desk.paidOn')}</dt><dd>{fmtDate(p.paidOn)}</dd>
            {p.ad ? <><dt className="text-muted">{t('desk.advert')}</dt><dd>{p.ad.advertiser} · {p.ad.placement}</dd></> : null}
          </dl>
          {pending ? (
            <>
              <div className="mb-1 text-sm font-semibold">{t('desk.checklist')}</div>
              <Checkbox checked onChange={() => undefined} disabled label={t("desk.chkUtr")} />
              <Checkbox
                checked={checks.amount} onChange={(e) => setChecks({ ...checks, amount: e.target.checked })}
                label={p.expectedAmount ? t('desk.chkAmountExp', { amount: fmtINR(p.expectedAmount) }) : t('desk.chkAmount')}
              />
              <Checkbox checked={checks.date} onChange={(e) => setChecks({ ...checks, date: e.target.checked })} label={t('desk.chkDate')} />
              <Checkbox checked={checks.credited} onChange={(e) => setChecks({ ...checks, credited: e.target.checked })} label={t('desk.chkCredited')} />
            </>
          ) : null}
        </div>
      </div>

      {pending ? (
        <>
          <Textarea
            label={t('desk.remarks')} rows={2} value={remarks} placeholder={t('desk.remarksPlaceholder')} error={remarkErr}
            onChange={(e) => { setRemarks(e.target.value); setRemarkErr(''); }}
          />
          <div className="flex gap-3">
            <Button variant="danger" className="flex-1" icon={X} loading={reject.isPending} disabled={approve.isPending} onClick={() => void doReject()}>{t('desk.reject')}</Button>
            <Button variant="success" className="flex-[2]" icon={Check} loading={approve.isPending} disabled={reject.isPending} onClick={() => setConfirm(true)}>{t('desk.approve')}</Button>
          </div>
          <p className="text-xs text-muted">{t('desk.approveNote')}</p>
        </>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-muted">{t('desk.decidedOn', { date: fmtDateTime(p.verifiedAt) })}</p>
          {p.remarks ? <p className="rounded-theme-sm bg-ink/5 p-3"><span className="font-semibold">{t('desk.remarksLabel')}</span> {p.remarks}</p> : null}
          {p.receipt ? (
            <Button
              variant="outline" size="sm" icon={Download}
              onClick={() => downloadFile(`/api/receipts/${p.receipt!.id}/pdf`, `${p.receipt!.serialNo.replace(/[^\w-]+/g, '-')}.pdf`).catch((e) => toast.error(errMsg(e, t('common.downloadFailed'))))}
            >
              {t('desk.receiptBtn', { no: p.receipt.serialNo })}
            </Button>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={confirm} onClose={() => setConfirm(false)} onConfirm={() => void doApprove()} loading={approve.isPending}
        title={t('desk.confirmTitle')} confirmLabel={t('desk.approve')}
        message={<><p>{t('desk.confirmBody', { amount: fmtINR(p.amount), name: p.payerName ?? '' })}</p>{unchecked ? <p className="mt-2 flex items-center gap-1.5 font-semibold text-warning">{t('desk.confirmUnchecked')}</p> : null}</>}
      />
      <Modal open={big} onClose={() => { setBig(false); setZoom(false); }} title={t('desk.screenshotAlt')} size="lg" footer={<Button variant="outline" onClick={() => setZoom(!zoom)} icon={Search}>{zoom ? t('desk.fit') : t('desk.zoom')}</Button>}>
        <div className="max-h-[70vh] overflow-auto rounded-theme-sm bg-ink/5">
          <ImageWithFallback src={p.screenshotUrl ?? undefined} alt={t("desk.screenshotAlt")} className={zoom ? 'max-w-none' : 'mx-auto max-h-[68vh] w-auto'} style={zoom ? { width: '180%' } : undefined} />
        </div>
      </Modal>
    </Card>
  );
}

export default function PaymentDesk() {
  const { t } = useT('payments');
  const wide = useMediaQuery('(min-width: 1024px)');
  const [status, setStatus] = useState<PayStatus>('PENDING');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<number | null>(null);
  const list = useDeskList({ status, kind, q, page });
  const rows = list.data?.data ?? [];

  // keep the right panel filled on desktop
  useEffect(() => {
    if (wide && sel === null && rows.length) setSel(rows[0]!.id);
    if (sel !== null && list.data && !rows.some((r) => r.id === sel)) setSel(wide && rows.length ? rows[0]!.id : null);
  }, [wide, rows, sel, list.data]);

  const cols: Column<PaymentItem>[] = [
    {
      key: 'member', header: t('desk.colMember'),
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r.payerName ?? '?'} size={32} />
          <div className="min-w-0"><div className="truncate font-semibold">{r.payerName ?? '—'}</div><div className="text-xs text-muted">{r.membershipNo ?? t('desk.advertiser')}</div></div>
        </div>
      ),
    },
    { key: 'for', header: t('desk.colFor'), render: (r) => t(`kind.${r.kind}`), hideOnMobile: true },
    { key: 'amount', header: t('desk.colAmount'), render: (r) => <span className="font-semibold">{fmtINR(r.amount)}</span> },
    { key: 'utr', header: 'UTR', render: (r) => <span className="text-muted">{r.utr}</span>, hideOnMobile: true },
    { key: 'paid', header: t('desk.colPaid'), render: (r) => <span className="text-muted">{fmtDate(r.paidOn, 'D MMM')}</span> },
  ];
  const c = list.data?.counts;
  const tabs = [
    { id: 'PENDING', label: t('desk.tabPending'), count: c?.PENDING },
    { id: 'APPROVED', label: t('desk.tabApproved'), count: c?.APPROVED },
    { id: 'REJECTED', label: t('desk.tabRejected'), count: c?.REJECTED },
  ];
  const detail = sel !== null ? <Detail id={sel} onDone={() => setSel(null)} /> : null;

  return (
    <div>
      <PageHeader title={t('desk.title')} subtitle={t('desk.subtitle')} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_460px]">
        <div className="min-w-0 space-y-3">
          <Tabs items={tabs} value={status} onChange={(v) => { setStatus(v as PayStatus); setPage(1); setSel(null); }} label={t('desk.title')} />
          <div className="flex flex-wrap gap-2">
            <SearchInput className="min-w-[200px] flex-1" placeholder={t('desk.search')} onSearch={(v) => { setQ(v); setPage(1); }} />
            <Select
              aria-label={t('desk.colFor')} value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} wrapperClassName="w-44"
              options={[{ value: '', label: t('desk.allKinds') }, { value: 'SUBSCRIPTION', label: t('kind.SUBSCRIPTION') }, { value: 'DONATION', label: t('kind.DONATION') }, { value: 'AD', label: t('kind.AD') }]}
            />
          </div>
          {list.isError ? <ErrorState onRetry={() => void list.refetch()} /> : (
            <>
              <Table
                columns={cols} rows={rows} rowKey={(r) => r.id} loading={list.isLoading} onRowClick={(r) => setSel(r.id)}
                emptyText={<EmptyState icon={CheckCircle2} title={status === 'PENDING' ? t('desk.emptyPendingTitle') : t('desk.emptyTitle')} description={status === 'PENDING' ? t('desk.emptyPendingBody') : t('desk.emptyBody')} className="border-0" />}
                caption={t('desk.title')}
              />
              <Pagination page={list.data?.page ?? 1} pageSize={list.data?.pageSize ?? 15} total={list.data?.total ?? 0} onPage={setPage} />
            </>
          )}
        </div>
        {wide ? <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">{detail ?? (rows.length ? null : null)}</div> : null}
      </div>
      {!wide ? (
        <Drawer open={sel !== null} onClose={() => setSel(null)} side="right" width={480} title={t('desk.detailTitle')}>
          <div className="p-3">{detail}</div>
        </Drawer>
      ) : null}
    </div>
  );
}
