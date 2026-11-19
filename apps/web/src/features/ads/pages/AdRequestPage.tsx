import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { AlertTriangle, ArrowLeft, ImageIcon } from 'lucide-react';
import { Badge, Button, Card, ChipGroup, DateInput, ErrorState, FileUpload, Input, PageHeader, Section, Skeleton, StatusBadge, useToast } from '@/components/ui';
import { api, type UploadedFile } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { useT } from '@/lib/useT';
import { AdStatusBadge, PlacementFrame, VARIANT_BY_CODE, allowsVideo, formatList, rupees, sizeLabel, type AdRequestRow, type ClickType } from '../shared';

const EDITABLE = ['REQUESTED', 'RETURNED', 'CONTENT_SUBMITTED'];

export default function AdRequestPage() {
  const { id } = useParams();
  const { t } = useT('ads');
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['ads', 'request', id], queryFn: () => api.get<AdRequestRow>(`/api/ads/requests/${id}`) });
  const r = q.data;

  const [file, setFile] = useState<UploadedFile | null>(null);
  const [title, setTitle] = useState('');
  const [textLine, setTextLine] = useState('');
  const [clickType, setClickType] = useState<ClickType>('CALL');
  const [clickValue, setClickValue] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!r) return;
    const ad = r.ad;
    setFile(ad?.creativeFileId ? { id: ad.creativeFileId, url: ad.creativeUrl ?? `/files/${ad.creativeFileId}`, mime: ad.mime ?? undefined } : null);
    setTitle(ad?.title ?? '');
    setTextLine(ad?.textLine ?? '');
    setClickType(ad?.clickType ?? 'CALL');
    setClickValue(ad?.clickValue ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.id, r?.updatedAt]);

  const submit = useMutation({
    mutationFn: () => api.post<AdRequestRow>(`/api/ads/requests/${id}/creative`, {
      creativeFileId: file?.id, textLine: textLine.trim() || undefined, title: title.trim(), clickType, clickValue: clickType === 'NONE' ? undefined : clickValue.trim(),
    }),
    onSuccess: () => { setFormError(null); toast.success(t('req.submitted')); void qc.invalidateQueries({ queryKey: ['ads'] }); },
    onError: (e: Error) => { setFormError(e.message); toast.error(e.message); },
  });

  if (q.isLoading) return <div className="mx-auto max-w-2xl space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (q.isError || !r) return <div className="mx-auto max-w-2xl"><ErrorState onRetry={() => void q.refetch()} /></div>;

  const p = r.placement;
  const editable = EDITABLE.includes(r.status);
  const isText = p.code === 'APP_LOADING';
  const accept = ['image/jpeg', 'image/png', ...(p.formats.includes('webp') ? ['image/webp'] : []), ...(allowsVideo(p) ? ['video/mp4'] : [])].join(',');
  const previewAd = { creativeUrl: file?.url ?? null, mime: file?.mime ?? null, textLine: isText ? textLine : null, title };
  const needsValue = clickType !== 'NONE';
  const ready = title.trim().length > 0 && (!!file || (isText && textLine.trim().length > 0)) && (!needsValue || clickValue.trim().length > 0);

  return (
    <div className="mx-auto max-w-2xl pb-8">
      <PageHeader
        title={t('req.title')} subtitle={p.name}
        back={<Link to="/advertise/mine" className="mb-2 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary"><ArrowLeft size={16} aria-hidden />{t('mine.title')}</Link>}
        actions={<AdStatusBadge status={r.status} />}
      />

      {r.status === 'RETURNED' && r.remarks ? (
        <Card className="mb-4 flex gap-3 border-warning bg-warning-soft">
          <AlertTriangle className="mt-0.5 shrink-0 text-warning" size={20} aria-hidden />
          <div><p className="font-semibold">{t('req.returnedTitle')}</p><p className="text-sm">{r.remarks}</p></div>
        </Card>
      ) : null}
      {r.status === 'REJECTED' && r.remarks ? (
        <Card className="mb-4 flex gap-3 border-danger bg-danger-soft"><AlertTriangle className="mt-0.5 shrink-0 text-danger" size={20} aria-hidden /><div><p className="font-semibold">{t('req.rejectedTitle')}</p><p className="text-sm">{r.remarks}</p></div></Card>
      ) : null}

      <Card tone="accent-soft" className="mb-5">
        <p className="flex items-center gap-2 font-semibold"><ImageIcon size={18} aria-hidden />{t('req.sizingTitle', { name: p.name })}</p>
        <ul className="mt-2 space-y-1 text-sm leading-relaxed">
          <li>{t('req.sizeLine', { size: sizeLabel(p), formats: formatList(p.formats), kb: p.maxKb })}</li>
          {allowsVideo(p) && p.videoMaxS ? <li>{t('req.videoLine', { s: p.videoMaxS })}</li> : null}
          {isText ? <li>{t('req.textLine')}</li> : null}
          <li>{t('req.safeLine')}</li>
        </ul>
      </Card>

      {editable ? (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (ready) submit.mutate(); }} noValidate>
          <FileUpload
            kind="ad_creative" visibility="PRIVATE" value={file} onChange={setFile} accept={accept} maxMb={allowsVideo(p) ? 20 : 5}
            label={isText ? t('req.fileOptional') : t('req.file')} required={!isText} hint={t('req.fileHint', { size: sizeLabel(p) })}
          />
          <Input label={t('req.adTitle')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required placeholder={t('req.adTitlePh')} />
          {isText ? <Input label={t('req.textLineLabel')} value={textLine} onChange={(e) => setTextLine(e.target.value)} maxLength={120} hint={t('req.textLineHint')} /> : null}

          <Section title={t('req.previewTitle')}>
            <div className="rounded-theme border border-line bg-surface p-3"><PlacementFrame variant={VARIANT_BY_CODE[p.code] ?? 'webHome'} ad={previewAd} label={t('req.previewHint')} /></div>
          </Section>

          <div>
            <p className="mb-2 text-sm font-semibold text-ink/80">{t('req.clickTitle')}</p>
            <ChipGroup
              label={t('req.clickTitle')} value={clickType} onChange={(v) => { setClickType(v); setClickValue(''); }}
              options={(['CALL', 'WHATSAPP', 'WEB', 'NONE'] as ClickType[]).map((c) => ({ value: c, label: t(`click.${c}`) }))}
            />
            {needsValue ? (
              <Input
                wrapperClassName="mt-3" label={clickType === 'WEB' ? t('req.clickWeb') : t('req.clickPhone')} value={clickValue}
                onChange={(e) => setClickValue(e.target.value)} inputMode={clickType === 'WEB' ? 'url' : 'tel'} placeholder={clickType === 'WEB' ? 'www.example.com' : '98450 12345'} required
              />
            ) : null}
          </div>

          {formError ? <p role="alert" className="rounded-theme-sm bg-danger-soft p-3 text-sm text-danger">{formError}</p> : null}
          <Button type="submit" fullWidth size="lg" loading={submit.isPending} disabled={!ready}>{r.status === 'CONTENT_SUBMITTED' ? t('req.resubmit') : t('req.submit')}</Button>
        </form>
      ) : (
        <Card className="mb-5">
          <h2 className="mb-3 text-lg">{t('req.submittedTitle')}</h2>
          <PlacementFrame variant={VARIANT_BY_CODE[p.code] ?? 'webHome'} ad={r.ad} safe={false} />
          {r.ad?.startsAt ? <p className="mt-3 text-sm text-muted">{t('req.runs', { from: fmtDate(r.ad.startsAt), to: fmtDate(r.ad.endsAt) })}</p> : null}
        </Card>
      )}

      {r.status === 'CONTENT_SUBMITTED' ? <p className="mt-3 text-sm text-muted">{t('req.waitReview')}</p> : null}

      {r.plan && ['CONTENT_SUBMITTED', 'APPROVED', 'LIVE', 'PAUSED', 'EXPIRED'].includes(r.status) ? <PaymentBox r={r} /> : null}
    </div>
  );
}

function PaymentBox({ r }: { r: AdRequestRow }) {
  const { t } = useT('ads');
  const toast = useToast();
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ['public-config'], queryFn: () => api.get<{ upi: { id: string | null; payeeName: string | null; qrUrl: string | null } }>('/api/public/config'), staleTime: 300_000 });
  const price = r.plan?.price ?? 0;
  const [amount, setAmount] = useState(String(price));
  const [utr, setUtr] = useState('');
  const [paidOn, setPaidOn] = useState(dayjs().format('YYYY-MM-DD'));
  const [shot, setShot] = useState<UploadedFile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const hasApproved = r.payments.some((x) => x.status === 'APPROVED');
  const hasPending = r.payments.some((x) => x.status === 'PENDING');

  const pay = useMutation({
    mutationFn: () => api.post('/api/payments', {
      kind: 'AD', adRequestId: r.id, amount: Number(amount), utr: utr.trim(), paidOn, purpose: `${t('pay.purpose')}: ${r.placement.name} (${t(`period.${r.plan!.period}`)})`, screenshotFileId: shot?.id,
    }),
    onSuccess: () => { setErr(null); setUtr(''); setShot(null); toast.success(t('pay.sent')); void qc.invalidateQueries({ queryKey: ['ads'] }); },
    onError: (e: Error) => { setErr(e.message); toast.error(e.message); },
  });
  const valid = Number(amount) > 0 && utr.trim().length >= 6 && !!paidOn && !!shot;
  const upi = cfg.data?.upi;

  return (
    <Section title={t('pay.title')} className="mt-8">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>{t('pay.due', { period: t(`period.${r.plan!.period}`) })} <b>{rupees(price)}</b></p>
          <Badge tone={hasApproved ? 'success' : hasPending ? 'warning' : 'neutral'}>{t(`payStatus.${hasApproved ? 'APPROVED' : hasPending ? 'PENDING' : r.paymentStatus === 'REJECTED' ? 'REJECTED' : 'NONE'}`)}</Badge>
        </div>
        {r.payments.length ? (
          <ul className="divide-y divide-line rounded-theme-sm border border-line">
            {r.payments.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>{rupees(x.amount)} · UTR {x.utr} · {fmtDate(x.paidOn)}</span><StatusBadge status={x.status} />
              </li>
            ))}
          </ul>
        ) : null}
        {!hasApproved ? (
          <>
            <div className="flex flex-col items-center gap-3 rounded-theme-sm bg-accent-soft p-4 text-center sm:flex-row sm:text-left">
              {upi?.qrUrl ? <img src={upi.qrUrl} alt={t('pay.qrAlt')} className="h-32 w-32 rounded-lg bg-surface object-contain p-1" /> : null}
              <div>
                <p className="text-sm text-muted">{t('pay.upiHelp')}</p>
                <p className="mt-1 break-all font-head text-lg">{upi?.id ?? t('pay.upiMissing')}</p>
                {upi?.payeeName ? <p className="text-sm">{upi.payeeName}</p> : null}
              </div>
            </div>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (valid) pay.mutate(); }} noValidate>
              <Input label={t('pay.amount')} type="number" inputMode="decimal" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} required />
              <DateInput label={t('pay.paidOn')} value={paidOn} max={dayjs().format('YYYY-MM-DD')} onChange={(e) => setPaidOn(e.target.value)} required />
              <Input wrapperClassName="sm:col-span-2" label={t('pay.utr')} value={utr} onChange={(e) => setUtr(e.target.value)} hint={t('pay.utrHint')} required maxLength={40} />
              <FileUpload className="sm:col-span-2" kind="payment_proof" value={shot} onChange={setShot} label={t('pay.screenshot')} required maxMb={5} accept="image/jpeg,image/png,image/webp" />
              {err ? <p role="alert" className="text-sm text-danger sm:col-span-2">{err}</p> : null}
              <Button type="submit" className="sm:col-span-2" loading={pay.isPending} disabled={!valid}>{t('pay.submit')}</Button>
            </form>
          </>
        ) : <p className="text-sm text-success">{t('pay.verified')}</p>}
      </Card>
    </Section>
  );
}
