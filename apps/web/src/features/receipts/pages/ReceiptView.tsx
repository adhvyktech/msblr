import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Download, Share2 } from 'lucide-react';
import { useT } from '@/lib/useT';
import { api, downloadFile } from '@/lib/api';
import { fmtDate, fmtINR } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, useToast } from '@/components/ui';
import { useReceipt } from '../api';

export default function ReceiptView() {
  const { t } = useT('receipts');
  const toast = useToast();
  const id = Number(useParams().id);
  const q = useReceipt(id);

  if (q.isLoading) return <div className="mx-auto max-w-md space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (q.isError || !q.data) {
    const status = (q.error as { status?: number } | null)?.status;
    return (
      <div className="mx-auto max-w-md">
        {status === 403 || status === 404
          ? <EmptyState title={t('view.notFoundTitle')} description={t('view.notFoundBody')} action={<Link to="/me/subscription"><Button variant="outline">{t('view.back')}</Button></Link>} />
          : <ErrorState onRetry={() => void q.refetch()} />}
      </div>
    );
  }
  const r = q.data;
  const fileName = `${r.serialNo.replace(/[^\w-]+/g, '-')}.pdf`;
  const text = t('view.shareText', { no: r.serialNo, amount: fmtINR(r.amount), purpose: r.purpose });

  async function download() {
    try { await downloadFile(`/api/receipts/${r.id}/pdf`, fileName); } catch { toast.error(t('view.downloadFailed')); }
  }
  async function share() {
    try {
      const blob = await api.blob(`/api/receipts/${r.id}/pdf`);
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: r.serialNo, text }); return; }
      if (navigator.share) { await navigator.share({ title: r.serialNo, text }); return; }
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast.error(t('view.shareFailed'));
    }
  }

  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-4 py-2.5"><dt className="text-muted">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>
  );
  return (
    <div className="mx-auto max-w-md">
      <Link to="/me/subscription" className="mb-2 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary"><ArrowLeft size={18} aria-hidden />{t('view.back')}</Link>
      <div className="mb-5 text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-success-soft text-success"><Check size={44} aria-hidden /></div>
        <h1 className="mt-3 text-2xl">{r.legacy ? t('view.titleLegacy') : t('view.title')}</h1>
        <p className="text-muted">{t('view.ready')}</p>
      </div>
      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
          <div>
            <div className="text-xs text-muted">{t('view.receiptNo')}</div>
            <div className="text-lg font-bold">{r.serialNo}</div>
          </div>
          {r.legacy ? <Badge tone="neutral">{t('view.legacy')}</Badge> : null}
        </div>
        <dl className="divide-y divide-line">
          {row(t('view.date'), fmtDate(r.issuedAt))}
          {row(t('view.from'), r.memberName)}
          {r.membershipNo ? row(t('view.membershipNo'), r.membershipNo) : null}
          {row(t('view.towards'), r.purpose)}
          {r.utr ? row('UTR', r.utr) : null}
          {row(t('view.amount'), fmtINR(r.amount))}
        </dl>
      </Card>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button size="lg" icon={Download} onClick={() => void download()}>{t('view.download')}</Button>
        <Button size="lg" variant="outline" icon={Share2} onClick={() => void share()}>{t('view.share')}</Button>
      </div>
    </div>
  );
}
