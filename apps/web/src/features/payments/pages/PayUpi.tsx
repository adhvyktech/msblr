import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Copy, QrCode, Smartphone } from 'lucide-react';
import { useT } from '@/lib/useT';
import { fmtINR } from '@/lib/format';
import { Button, Card, EmptyState, ErrorState, ImageWithFallback, Input, PageHeader, Skeleton, useToast } from '@/components/ui';
import { BackLink, upiLink } from '../shared';
import { useSubscription, useUpi } from '../api';

export default function PayUpi() {
  const { t } = useT('payments');
  const toast = useToast();
  const [sp] = useSearchParams();
  const donation = sp.get('kind') === 'donation';
  const upi = useUpi();
  const sub = useSubscription();
  const [donAmount, setDonAmount] = useState('');
  const [copied, setCopied] = useState(false);

  if (upi.isLoading || sub.isLoading) return <div className="mx-auto max-w-md space-y-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-72 w-full" /></div>;
  if (upi.isError || !upi.data) {
    const notSet = (upi.error as { code?: string } | null)?.code === 'UPI_NOT_CONFIGURED';
    return <div className="mx-auto max-w-md">{notSet ? <EmptyState title={t('pay.notSetTitle')} description={t('pay.notSetBody')} /> : <ErrorState onRetry={() => void upi.refetch()} />}</div>;
  }
  const u = upi.data;
  const amount = donation ? Number(donAmount) || 0 : sub.data?.amount ?? u.amount;
  const proofTo = donation ? '/me/subscription/proof?kind=donation' : '/me/subscription/proof';

  async function copy() {
    try {
      await navigator.clipboard.writeText(u.id);
      setCopied(true);
      toast.success(t('pay.copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('pay.copyFailed', { id: u.id }));
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader back={<BackLink to="/me/subscription" />} title={t('pay.title')} />
      <Card className="text-center">
        <p className="text-muted">{t('pay.payTo', { name: u.payeeName })}</p>
        {donation ? (
          <Input
            label={t('pay.donationAmount')} type="number" inputMode="decimal" min={1} value={donAmount} onChange={(e) => setDonAmount(e.target.value)}
            placeholder="1100" wrapperClassName="mx-auto mt-3 max-w-[220px] text-left"
          />
        ) : (
          <div className="my-2 font-head text-4xl" style={{ fontWeight: 'var(--hw)' }}>{fmtINR(amount)}</div>
        )}
        <div className="mx-auto my-4 grid h-[220px] w-[220px] place-items-center overflow-hidden rounded-theme border border-line bg-white p-2">
          {u.qrUrl ? (
            <ImageWithFallback src={u.qrUrl} alt={t('pay.qrAlt')} className="h-full w-full object-contain" />
          ) : (
            <div className="px-4 text-sm text-muted"><QrCode className="mx-auto mb-2" size={40} aria-hidden />{t('pay.noQr')}</div>
          )}
        </div>
        <div className="flex items-center gap-3 rounded-theme-sm border border-line bg-bg p-3 text-left">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted">{t('pay.upiId')}</div>
            <div className="truncate font-semibold">{u.id}</div>
          </div>
          <Button size="sm" variant="outline" icon={copied ? Check : Copy} onClick={() => void copy()}>{copied ? t('pay.copiedShort') : t('pay.copy')}</Button>
        </div>
        {donation && amount <= 0 ? (
          <Button fullWidth size="lg" icon={Smartphone} disabled className="mt-3 lg:hidden">{t('pay.openApp')}</Button>
        ) : (
          <a href={upiLink(u, amount)} className="mt-3 block lg:hidden">
            <Button fullWidth size="lg" icon={Smartphone} tabIndex={-1}>{t('pay.openApp')}</Button>
          </a>
        )}
        <p className="mt-3 hidden text-sm text-muted lg:block">{t('pay.scanHint')}</p>
        <p className="mt-3 text-left text-sm text-muted">{t('pay.safeNote')}</p>
        <Link to={proofTo} className="mt-4 block">
          <Button variant="outline" fullWidth size="lg">{t('pay.iHavePaid')}</Button>
        </Link>
      </Card>
    </div>
  );
}
