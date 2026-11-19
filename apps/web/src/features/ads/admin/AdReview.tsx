import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { ArrowLeft, CheckCircle2, ExternalLink, XCircle } from 'lucide-react';
import {
  Button, Card, Checkbox, DateInput, ErrorState, FileUpload, Modal, PageHeader, Section, Select, Skeleton, StatusBadge, Tabs, Textarea, Toggle, useToast,
} from '@/components/ui';
import { api, fileSrc, type UploadedFile } from '@/lib/api';
import { fmtDate, fmtDateTime, formatMobile } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/useT';
import { AdStatusBadge, PlacementFrame, formatList, rupees, sizeLabel, type AdRequestDetail, type FrameVariant } from '../shared';

const PREVIEWS: { id: FrameVariant; key: string }[] = [
  { id: 'webHome', key: 'webHome' }, { id: 'appHome', key: 'appHome' }, { id: 'side', key: 'side' }, { id: 'loading', key: 'loading' },
];
const toDate = (d: string | null | undefined, fallback = '') => (d ? dayjs(d).format('YYYY-MM-DD') : fallback);

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[15px]">
      {ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" aria-label="OK" /> : <XCircle size={18} className="mt-0.5 shrink-0 text-danger" aria-label="Problem" />}
      <span>{children}</span>
    </li>
  );
}

export default function AdReview() {
  const { requestId } = useParams();
  const { t } = useT('ads');
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['ads', 'admin', 'request', requestId], queryFn: () => api.get<AdRequestDetail>(`/api/ads/admin/requests/${requestId}`) });
  const r = q.data;

  const [preview, setPreview] = useState<FrameVariant>('webHome');
  const [startsAt, setStartsAt] = useState(dayjs().format('YYYY-MM-DD'));
  const [endsAt, setEndsAt] = useState('');
  const [priority, setPriority] = useState('1');
  const [shuffle, setShuffle] = useState(true);
  const [markPaid, setMarkPaid] = useState(false);
  const [modal, setModal] = useState<null | 'return' | 'reject' | 'renew' | 'replace'>(null);
  const [remarks, setRemarks] = useState('');
  const [renewDate, setRenewDate] = useState('');
  const [newFile, setNewFile] = useState<UploadedFile | null>(null);

  useEffect(() => {
    if (!r) return;
    setPreview(r.placement.code === 'APP_LOADING' ? 'loading' : r.placement.code === 'WEB_SIDE' ? 'side' : r.placement.platform === 'APP' ? 'appHome' : 'webHome');
    setStartsAt(toDate(r.ad?.startsAt, dayjs().format('YYYY-MM-DD')));
    setEndsAt(toDate(r.ad?.endsAt));
    setPriority(String(r.ad?.priority ?? 1));
    setShuffle(r.ad?.shuffle ?? true);
    setMarkPaid(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.id, r?.updatedAt]);

  const done = (msg: string) => () => { toast.success(msg); setModal(null); setRemarks(''); setNewFile(null); void qc.invalidateQueries({ queryKey: ['ads'] }); };
  const fail = (e: Error) => toast.error(e.message);
  const approve = useMutation({
    mutationFn: () => api.post(`/api/ads/admin/requests/${requestId}/approve`, { startsAt, endsAt: endsAt || undefined, priority: Number(priority), shuffle, markPaid }),
    onSuccess: done(t('review.approved')), onError: fail,
  });
  const decide = useMutation({
    mutationFn: (kind: 'return' | 'reject') => api.post(`/api/ads/admin/requests/${requestId}/${kind}`, { remarks: remarks.trim() }),
    onSuccess: done(t('review.decided')), onError: fail,
  });
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/api/ads/admin/ads/${r!.ad!.id}`, body),
    onSuccess: done(t('review.saved')), onError: fail,
  });
  const pause = useMutation({
    mutationFn: (p: boolean) => api.post(`/api/ads/admin/ads/${r!.ad!.id}/${p ? 'pause' : 'resume'}`, {}),
    onSuccess: done(t('review.saved')), onError: fail,
  });
  const renew = useMutation({
    mutationFn: () => api.post(`/api/ads/admin/requests/${requestId}/renew`, { endsAt: renewDate }),
    onSuccess: done(t('review.renewed')), onError: fail,
  });

  if (q.isLoading) return <div className="space-y-3"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-96 w-full" /></div>;
  if (q.isError || !r) return <ErrorState onRetry={() => void q.refetch()} />;

  const p = r.placement;
  const ad = r.ad;
  const pending = r.status === 'CONTENT_SUBMITTED';
  const scheduled = ['APPROVED', 'LIVE', 'PAUSED', 'EXPIRED'].includes(r.status);
  const manage = can('ads.manage');
  const c = r.checks.creative;
  const autoEnd = r.plan ? dayjs(startsAt).add({ MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6, YEARLY: 12 }[r.plan.period], 'month').subtract(1, 'day').format('YYYY-MM-DD') : '';
  const endOk = !endsAt || endsAt > startsAt;

  const scheduleFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <DateInput label={t('review.startsAt')} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
      <DateInput label={t('review.endsAt')} value={endsAt} min={startsAt} onChange={(e) => setEndsAt(e.target.value)} hint={pending && !endsAt ? t('review.endAuto', { date: fmtDate(autoEnd) }) : undefined} error={endOk ? undefined : t('review.endError')} />
      <Select label={t('review.priority')} value={priority} onChange={(e) => setPriority(e.target.value)} options={[{ value: '1', label: t('review.p1') }, { value: '2', label: t('review.p2') }, { value: '3', label: t('review.p3') }]} />
      <div className="self-end"><Toggle checked={shuffle} onChange={setShuffle} label={t('review.shuffle')} description={t('review.shuffleHint')} /></div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title={`${r.advertiser?.name ?? ''} · ${p.name}`} subtitle={r.plan ? `${t(`period.${r.plan.period}`)} · ${rupees(r.plan.price)}` : undefined}
        back={<Link to="/admin/ads" className="mb-2 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary"><ArrowLeft size={16} aria-hidden />{t('admin.title')}</Link>}
        actions={<AdStatusBadge status={r.status} />}
      />

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-5">
          <Card>
            <Tabs label={t('review.previewTitle')} value={preview} onChange={(v) => setPreview(v as FrameVariant)} items={PREVIEWS.map((x) => ({ id: x.id, label: t(`review.tab.${x.key}`) }))} className="mb-4" />
            <div className="mx-auto max-w-lg"><PlacementFrame variant={preview} ad={ad} label={t('review.safeNote')} /></div>
            {ad ? (
              <p className="mt-3 text-center text-sm text-muted">{ad.title}{ad.textLine ? ` · "${ad.textLine}"` : ''}</p>
            ) : <p className="mt-3 text-center text-sm text-muted">{t('review.noContent')}</p>}
          </Card>

          {r.notes ? <Card><p className="text-sm font-semibold text-muted">{t('review.notes')}</p><p className="mt-1">{r.notes}</p></Card> : null}
          {r.remarks ? <Card className="border-warning bg-warning-soft"><p className="text-sm font-semibold">{t('review.lastRemarks')}</p><p className="mt-1">{r.remarks}</p></Card> : null}
        </div>

        <div className="space-y-5">
          <Card>
            <h2 className="mb-3 text-lg">{t('review.advertiser')}</h2>
            <p className="font-semibold">{r.advertiser?.name}</p>
            <p className="text-sm text-muted">{r.advertiser?.contactPerson} · {formatMobile(r.advertiser?.mobile)}</p>
            {r.advertiser?.email ? <p className="text-sm text-muted">{r.advertiser.email}</p> : null}
          </Card>

          <Card>
            <h2 className="mb-3 text-lg">{t('review.checks')}</h2>
            <ul className="space-y-2">
              {c ? (
                <>
                  <Check ok={c.dimsOk}>{t('review.chkDims', { got: `${c.width} × ${c.height}`, want: sizeLabel(p) })}</Check>
                  <Check ok={c.sizeOk}>{t('review.chkSize', { got: c.sizeKb, max: p.maxKb })}</Check>
                  <Check ok={c.formatOk}>{t('review.chkFormat', { fmt: c.mime.split('/')[1]?.toUpperCase(), allowed: formatList(p.formats) })}</Check>
                </>
              ) : <Check ok={r.checks.hasText}>{r.checks.hasText ? t('review.chkText') : t('review.chkNoFile')}</Check>}
              <Check ok={r.checks.clickOk}>{ad?.clickType && ad.clickType !== 'NONE' ? t('review.chkClick', { type: t(`click.${ad.clickType}`), value: ad.clickValue ?? '' }) : t('review.chkNoClick')}</Check>
              <Check ok={r.checks.paid}>{r.checks.paid ? t('review.chkPaid') : t('review.chkUnpaid')}</Check>
            </ul>
            {r.payments.length ? (
              <ul className="mt-3 divide-y divide-line rounded-theme-sm border border-line text-sm">
                {r.payments.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span>{rupees(x.amount)} · UTR {x.utr} · {fmtDate(x.paidOn)}</span>
                    <span className="flex items-center gap-2">
                      {x.screenshotUrl ? <a href={fileSrc(x.screenshotUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary" aria-label={t('review.proof')}><ExternalLink size={14} aria-hidden />{t('review.proof')}</a> : null}
                      <StatusBadge status={x.status} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {!r.checks.paid && r.payments.some((x) => x.status === 'PENDING') ? <p className="mt-2 text-sm text-muted">{t('review.verifyHint')}</p> : null}
          </Card>

          {pending ? (
            <Card>
              <h2 className="mb-3 text-lg">{t('review.schedule')}</h2>
              {scheduleFields}
              {!r.checks.paid ? <div className="mt-3"><Checkbox checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} label={t('review.markPaid')} /></div> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button className="flex-1" onClick={() => approve.mutate()} loading={approve.isPending} disabled={!startsAt || !endOk}>{t('review.approve')}</Button>
                <Button variant="outline" onClick={() => setModal('return')}>{t('review.return')}</Button>
                <Button variant="ghost" className="text-danger" onClick={() => setModal('reject')}>{t('review.reject')}</Button>
              </div>
            </Card>
          ) : null}

          {r.status === 'REQUESTED' || r.status === 'RETURNED' ? (
            <Card><p className="text-sm text-muted">{r.status === 'REQUESTED' ? t('review.waitingAdvertiser') : t('review.returnedWaiting')}</p>
              <div className="mt-3"><Button variant="ghost" className="text-danger" onClick={() => setModal('reject')}>{t('review.reject')}</Button></div></Card>
          ) : null}

          {scheduled && ad ? (
            <Card>
              <h2 className="mb-1 text-lg">{t('review.manage')}</h2>
              <p className="mb-3 text-sm text-muted">{fmtDateTime(ad.startsAt)} – {fmtDateTime(ad.endsAt)}</p>
              {manage ? (
                <>
                  {scheduleFields}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button loading={patch.isPending} disabled={!endOk || !startsAt} onClick={() => patch.mutate({ startsAt, endsAt: endsAt || undefined, priority: Number(priority), shuffle })}>{t('review.saveSchedule')}</Button>
                    {r.status === 'PAUSED'
                      ? <Button variant="accent" loading={pause.isPending} onClick={() => pause.mutate(false)}>{t('review.resume')}</Button>
                      : r.status === 'LIVE' || r.status === 'APPROVED' ? <Button variant="outline" loading={pause.isPending} onClick={() => pause.mutate(true)}>{t('review.pause')}</Button> : null}
                    <Button variant="outline" onClick={() => { setRenewDate(dayjs(ad.endsAt ?? undefined).add(1, 'month').format('YYYY-MM-DD')); setModal('renew'); }}>{t('review.renew')}</Button>
                    <Button variant="outline" onClick={() => setModal('replace')}>{t('review.replace')}</Button>
                  </div>
                </>
              ) : <p className="text-sm text-muted">{t('review.manageOnly')}</p>}
            </Card>
          ) : null}

          {ad && scheduled ? (
            <Section title={t('review.results')} className="mb-0">
              <div className="grid grid-cols-3 gap-2 text-center">
                {([['impressions', r.stats.impressions], ['viewers', r.stats.uniqueViewers], ['clicks', r.stats.clicks]] as const).map(([k, v]) => (
                  <Card key={k} className="!p-3"><p className="font-head text-2xl leading-none">{v}</p><p className="mt-1 text-xs text-muted">{t(`mine.${k}`)}</p></Card>
                ))}
              </div>
            </Section>
          ) : null}
        </div>
      </div>

      <Modal
        open={modal === 'return' || modal === 'reject'} onClose={() => setModal(null)} title={modal === 'reject' ? t('review.rejectTitle') : t('review.returnTitle')}
        footer={<>
          <Button variant="ghost" onClick={() => setModal(null)}>{t('review.cancel')}</Button>
          <Button variant={modal === 'reject' ? 'danger' : 'primary'} loading={decide.isPending} disabled={remarks.trim().length < 3} onClick={() => decide.mutate(modal === 'reject' ? 'reject' : 'return')}>{modal === 'reject' ? t('review.reject') : t('review.return')}</Button>
        </>}
      >
        <Textarea label={t('review.remarks')} required value={remarks} onChange={(e) => setRemarks(e.target.value)} hint={t('review.remarksHint')} maxLength={1000} data-autofocus />
      </Modal>

      <Modal
        open={modal === 'renew'} onClose={() => setModal(null)} title={t('review.renewTitle')}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>{t('review.cancel')}</Button><Button loading={renew.isPending} disabled={!renewDate} onClick={() => renew.mutate()}>{t('review.renew')}</Button></>}
      >
        <DateInput label={t('review.newEnd')} value={renewDate} onChange={(e) => setRenewDate(e.target.value)} hint={t('review.renewHint', { date: fmtDate(ad?.endsAt) })} required />
      </Modal>

      <Modal
        open={modal === 'replace'} onClose={() => setModal(null)} title={t('review.replaceTitle')}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>{t('review.cancel')}</Button><Button loading={patch.isPending} disabled={!newFile} onClick={() => patch.mutate({ creativeFileId: newFile!.id })}>{t('review.replace')}</Button></>}
      >
        <FileUpload kind="ad_creative" value={newFile} onChange={setNewFile} accept={p.formats.includes('mp4') ? 'image/jpeg,image/png,video/mp4' : 'image/jpeg,image/png'} maxMb={p.formats.includes('mp4') ? 20 : 5} hint={t('req.fileHint', { size: sizeLabel(p) })} />
      </Modal>
    </div>
  );
}
