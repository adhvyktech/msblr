import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useT } from '@/lib/useT';
import { fmtDate, fmtINR } from '@/lib/format';
import { Button, Card, EmptyState, ErrorState, PageHeader, Pagination, Skeleton, StatusBadge } from '@/components/ui';
import { BackLink } from '../shared';
import { useMyPayments, type PaymentItem } from '../api';

function Row({ p }: { p: PaymentItem }) {
  const { t } = useT('payments');
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{p.purpose ?? t(`kind.${p.kind}`)} · {fmtINR(p.amount)}</div>
          <div className="text-sm text-muted">{t('my.paidOn', { date: fmtDate(p.paidOn) })} · UTR {p.utr}</div>
        </div>
        <StatusBadge status={p.status} />
      </div>
      {p.status === 'REJECTED' && p.remarks ? (
        <p className="rounded-theme-sm bg-danger-soft p-3 text-sm text-danger"><span className="font-semibold">{t('my.reason')}</span> {p.remarks}</p>
      ) : null}
      {p.status === 'PENDING' ? <p className="text-sm text-muted">{t('sub.pendingVerification')}</p> : null}
      {p.status === 'APPROVED' && p.receipt ? (
        <Link to={`/me/receipts/${p.receipt.id}`} className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-primary">
          <FileText size={18} aria-hidden />{t('my.viewReceipt', { no: p.receipt.serialNo })}
        </Link>
      ) : null}
    </li>
  );
}

export default function MyPayments() {
  const { t } = useT('payments');
  const [page, setPage] = useState(1);
  const q = useMyPayments(page);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back={<BackLink to="/me/subscription" />} title={t('my.title')} subtitle={t('my.subtitle')} />
      {q.isLoading ? <Skeleton className="h-48 w-full" />
        : q.isError || !q.data ? <ErrorState onRetry={() => void q.refetch()} />
        : q.data.data.length === 0 ? (
          <EmptyState title={t('my.emptyTitle')} description={t('my.emptyBody')} action={<Link to="/me/subscription/pay"><Button>{t('sub.payNow')}</Button></Link>} />
        ) : (
          <>
            <Card padded={false}><ul className="divide-y divide-line">{q.data.data.map((p) => <Row key={p.id} p={p} />)}</ul></Card>
            <Pagination className="mt-4" page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
          </>
        )}
    </div>
  );
}
