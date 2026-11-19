import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, Download, FileText, HeartHandshake, XCircle } from 'lucide-react';
import { useT } from '@/lib/useT';
import { downloadFile } from '@/lib/api';
import { fmtDate, fmtINR } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, IconButton, PageHeader, Section, Skeleton, StatusBadge, useToast } from '@/components/ui';
import { errMsg } from '../shared';
import { useSubscription, type HistoryItem } from '../api';

function HistoryRow({ h }: { h: HistoryItem }) {
  const { t } = useT('payments');
  const toast = useToast();
  const nav = useNavigate();
  const Icon = h.status === 'APPROVED' ? FileText : h.status === 'REJECTED' ? XCircle : Clock;
  const sub =
    h.status === 'APPROVED' ? t('sub.receiptNo', { no: h.serialNo ?? '' })
    : h.status === 'REJECTED' ? t('sub.rejected', { reason: h.remarks ?? '' })
    : t('sub.pendingVerification');
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Icon size={20} className={h.status === 'REJECTED' ? 'shrink-0 text-danger' : h.status === 'PENDING' ? 'shrink-0 text-warning' : 'shrink-0 text-primary'} aria-hidden />
      <button type="button" disabled={!h.receiptId} onClick={() => h.receiptId && nav(`/me/receipts/${h.receiptId}`)} className="min-w-0 flex-1 text-left disabled:cursor-default">
        <div className="truncate font-semibold">{h.label} · {fmtINR(h.amount)}</div>
        <div className="truncate text-sm text-muted">{fmtDate(h.date)} · {sub}</div>
      </button>
      {h.receiptId ? (
        <IconButton
          icon={Download} label={t('sub.downloadReceipt')} size="sm"
          onClick={() => downloadFile(`/api/receipts/${h.receiptId}/pdf`, `${(h.serialNo ?? 'receipt').replace(/[^\w-]+/g, '-')}.pdf`).catch((e) => toast.error(errMsg(e, t('common.downloadFailed'))))}
        />
      ) : <StatusBadge status={h.status} />}
    </li>
  );
}

export default function Subscription() {
  const { t } = useT('payments');
  const q = useSubscription();
  if (q.isLoading) return <div className="mx-auto max-w-2xl space-y-4"><Skeleton className="h-44 w-full" /><Skeleton className="h-40 w-full" /></div>;
  if (q.isError || !q.data) {
    const noFamily = (q.error as { code?: string } | null)?.code === 'NO_FAMILY';
    return <div className="mx-auto max-w-2xl">{noFamily ? <EmptyState title={t('sub.noFamilyTitle')} description={t('sub.noFamilyBody')} /> : <ErrorState onRetry={() => void q.refetch()} />}</div>;
  }
  const s = q.data;
  const active = s.status === 'ACTIVE';
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t('sub.title')} />
      <Card tone="primary" className="bg-gradient-to-br from-primary to-primary-2">
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm opacity-90">{s.family.headName ? t('sub.family', { name: s.family.headName.split(' ').slice(-1)[0] }) : t('sub.yourFamily')}{s.family.membershipNo ? ` · ${s.family.membershipNo}` : ''}</span>
          <StatusBadge status={s.status} />
        </div>
        <div className="mt-3 font-head text-4xl" style={{ fontWeight: 'var(--hw)' }}>{fmtINR(s.amount)}</div>
        <div className="text-sm opacity-90">
          {active && s.validUntil ? t('sub.validUntil', { date: fmtDate(s.validUntil) }) : t('sub.yearly', { period: s.periodLabel.replace('Subscription ', '') })}
          {!active && s.validUntil ? ` · ${t('sub.lastValid', { date: fmtDate(s.validUntil) })}` : ''}
        </div>
        {s.hasPending ? (
          <p className="mt-4 flex items-center gap-2 rounded-theme-sm bg-white/15 p-3 text-sm"><Clock size={18} aria-hidden />{t('sub.pendingBanner')}</p>
        ) : null}
        {s.canPay ? (
          !active ? (
            <Link to="/me/subscription/pay" className="mt-4 block">
              <Button variant="accent" fullWidth size="lg">{t('sub.payNow')}</Button>
            </Link>
          ) : (
            <p className="mt-4 flex items-center gap-2 text-sm"><CheckCircle2 size={18} aria-hidden />{t('sub.allPaid')}</p>
          )
        ) : (
          <p className="mt-4 text-sm opacity-90">{t('sub.headOnly')}</p>
        )}
      </Card>

      {s.canPay ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {active ? <Link to="/me/subscription/pay"><Button variant="outline" size="sm">{t('sub.payAgain')}</Button></Link> : null}
          <Link to="/me/subscription/pay?kind=donation"><Button variant="ghost" size="sm" icon={HeartHandshake}>{t('sub.donate')}</Button></Link>
          <Link to="/me/payments"><Button variant="ghost" size="sm">{t('sub.myPayments')}</Button></Link>
        </div>
      ) : null}

      <Section title={t('sub.history')} className="mt-6">
        {s.history.length === 0 ? (
          <EmptyState title={t('sub.noHistoryTitle')} description={t('sub.noHistoryBody')} />
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-line">{s.history.map((h) => <HistoryRow key={h.id} h={h} />)}</ul>
          </Card>
        )}
      </Section>
      <p className="text-center text-xs text-muted"><Badge tone="neutral">{s.periodLabel}</Badge></p>
    </div>
  );
}
