import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { useT } from '@/lib/useT';
import { fmtDate } from '@/lib/format';
import { fileSrc, type UploadedFile } from '@/lib/api';
import {
  Badge, Button, Card, Carousel, ConfirmDialog, EmptyState, ErrorState, FileUpload, IconButton, Input, Modal, PageHeader, RadioCards, Select, Skeleton, Toggle, type CarouselItem,
} from '@/components/ui';
import { fromLocalInput, toLocalInput, useAdminBanners, useBannerAds, useDeleteBanner, useReorderBanners, useSaveBanner, type BannerItem, type BannerKind } from '../api';

const toSlide = (b: Pick<BannerItem, 'id' | 'kind' | 'title' | 'subtitle' | 'url' | 'durationMs'>): CarouselItem => ({
  id: b.id, kind: b.kind === 'VIDEO' ? 'video' : b.url ? 'image' : 'gradient', src: b.url, title: b.title ?? undefined, subtitle: b.subtitle ?? undefined, durationMs: b.durationMs, ad: b.kind === 'AD',
});

function BannerForm({ initial, onClose }: { initial?: BannerItem; onClose: () => void }) {
  const { t } = useT('events');
  const ads = useBannerAds();
  const save = useSaveBanner(initial ? t('admin.saved') : t('admin.created'));
  const [kind, setKind] = useState<BannerKind>(initial?.kind ?? 'BANNER');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? '');
  const [link, setLink] = useState(initial?.linkUrl ?? '');
  const [adId, setAdId] = useState(initial?.adId ? String(initial.adId) : '');
  const [secs, setSecs] = useState(String((initial?.durationMs ?? 6000) / 1000));
  const [from, setFrom] = useState(toLocalInput(initial?.activeFrom));
  const [to, setTo] = useState(toLocalInput(initial?.activeTo));
  const [active, setActive] = useState(initial?.active ?? true);
  const [file, setFile] = useState<UploadedFile | null>(initial?.fileId && initial.kind !== 'AD' ? { id: initial.fileId, url: initial.url ?? '', mime: initial.mime ?? undefined } : null);
  const [tried, setTried] = useState(false);
  const s = Number(secs);
  const linkOk = !link.trim() || /^(https?:\/\/\S+|\/[\w\-./?=&%#]*)$/i.test(link.trim());
  const errs = {
    ad: kind === 'AD' && !adId ? t('admin.errAd') : '',
    secs: !(s >= 2 && s <= 120) ? t('admin.errSecs') : '',
    link: linkOk ? '' : t('admin.errLink'),
    to: from && to && new Date(to) < new Date(from) ? t('admin.errEnd') : '',
  };
  const submit = () => {
    setTried(true);
    if (Object.values(errs).some(Boolean)) return;
    save.mutate({
      id: initial?.id,
      data: {
        kind, title: title.trim() || null, subtitle: subtitle.trim() || null, linkUrl: link.trim() || null, adId: kind === 'AD' ? Number(adId) : null,
        fileId: kind === 'AD' ? null : file?.id ?? null, durationMs: Math.round(s * 1000), activeFrom: fromLocalInput(from), activeTo: fromLocalInput(to), active,
      },
    }, { onSuccess: onClose });
  };
  const e = (k: keyof typeof errs) => (tried ? errs[k] : '') || undefined;
  const preview = toSlide({ id: 0, kind, title: title || (kind === 'AD' ? t('admin.adSlide') : t('admin.previewTitle')), subtitle: subtitle || null, url: file?.url ?? null, durationMs: s * 1000 });
  return (
    <div className="grid gap-4">
      <RadioCards name="banner-kind" label={t('admin.slideType')} columns={3} value={kind} onChange={setKind}
        options={(['BANNER', 'AD', 'VIDEO'] as const).map((k) => ({ value: k, label: t(`bannerKinds.${k}`) }))} />
      <Input label={t('admin.bTitle')} value={title} onChange={(ev) => setTitle(ev.target.value)} />
      <Input label={t('admin.bSubtitle')} value={subtitle} onChange={(ev) => setSubtitle(ev.target.value)} />
      {kind === 'AD' ? (
        <Select label={t('admin.chooseAd')} required value={adId} onChange={(ev) => setAdId(ev.target.value)} error={e('ad')} placeholder={t('admin.selectAd')} hint={ads.data?.length === 0 ? t('admin.noLiveAds') : undefined}
          options={(ads.data ?? []).map((a) => ({ value: a.id, label: `${a.title} · ${a.advertiser}` }))} />
      ) : (
        <FileUpload kind="banner" visibility="PUBLIC" accept={kind === 'VIDEO' ? 'video/mp4' : 'image/jpeg,image/png,image/webp'} maxMb={kind === 'VIDEO' ? 20 : 5}
          label={kind === 'VIDEO' ? t('admin.uploadVideo') : t('admin.uploadImage')} hint={t('admin.uploadHint')} value={file} onChange={setFile} />
      )}
      <Input label={t('admin.linkUrl')} value={link} onChange={(ev) => setLink(ev.target.value)} error={e('link')} hint={t('admin.linkHint')} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Input label={t('admin.duration')} type="number" min={2} max={120} step={1} value={secs} onChange={(ev) => setSecs(ev.target.value)} error={e('secs')} />
        <Input label={t('admin.showFrom')} type="datetime-local" value={from} onChange={(ev) => setFrom(ev.target.value)} />
        <Input label={t('admin.showUntil')} type="datetime-local" value={to} onChange={(ev) => setTo(ev.target.value)} error={e('to')} />
      </div>
      <Toggle checked={active} onChange={setActive} label={t('admin.active')} description={t('admin.activeHint')} />
      <div>
        <div className="mb-1.5 text-sm font-semibold text-ink/80">{t('admin.preview')}</div>
        <Carousel items={[preview]} height={170} autoPlay={false} label={t('admin.preview')} />
      </div>
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>{t('admin.cancel')}</Button><Button loading={save.isPending} onClick={submit}>{t('admin.save')}</Button></div>
    </div>
  );
}

export default function AdminBanners() {
  const { t } = useT('events');
  const q = useAdminBanners();
  const reorder = useReorderBanners();
  const toggle = useSaveBanner();
  const remove = useDeleteBanner(t('admin.deleted'));
  const [edit, setEdit] = useState<BannerItem | 'new' | null>(null);
  const [del, setDel] = useState<BannerItem | null>(null);
  const [previewAll, setPreviewAll] = useState(false);
  const move = (i: number, d: -1 | 1) => {
    const ids = q.data!.map((b) => b.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    reorder.mutate(ids);
  };
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t('admin.bannersTitle')} subtitle={t('admin.bannersSub')} actions={<>
        <Button variant="outline" icon={Eye} onClick={() => setPreviewAll(true)} disabled={!q.data?.some((b) => b.showing)}>{t('admin.previewAll')}</Button>
        <Button icon={Plus} onClick={() => setEdit('new')}>{t('admin.addBanner')}</Button>
      </>} />
      {q.isLoading ? <Skeleton className="h-40" /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : q.data!.length === 0 ? <EmptyState title={t('admin.noBanners')} description={t('admin.noBannersBody')} /> : (
        <ol className="grid gap-3">
          {q.data!.map((b, i) => (
            <li key={b.id}>
              <Card className="flex flex-wrap items-center gap-3">
                <div className="flex flex-col">
                  <IconButton icon={ArrowUp} label={t('admin.moveUp')} size="sm" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)} />
                  <IconButton icon={ArrowDown} label={t('admin.moveDown')} size="sm" disabled={i === q.data!.length - 1 || reorder.isPending} onClick={() => move(i, 1)} />
                </div>
                <div className="h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-primary via-primary-2 to-accent">
                  {b.url && b.mime?.startsWith('image/') ? <img src={fileSrc(b.url)} alt="" className="h-full w-full object-cover" /> : null}
                  {b.url && b.mime?.startsWith('video/') ? <video src={fileSrc(b.url)} className="h-full w-full object-cover" muted /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="info">{t(`bannerKinds.${b.kind}`)}</Badge>
                    <Badge tone={b.showing ? 'success' : 'neutral'}>{b.showing ? t('admin.showing') : b.active ? t('admin.scheduled') : t('admin.off')}</Badge>
                  </div>
                  <div className="mt-1 truncate font-semibold">{b.title ?? '—'}</div>
                  <div className="text-xs text-muted">{t('admin.durationN', { s: b.durationMs / 1000 })}{b.activeFrom || b.activeTo ? ` · ${b.activeFrom ? fmtDate(b.activeFrom) : '…'} → ${b.activeTo ? fmtDate(b.activeTo) : '…'}` : ''}</div>
                </div>
                <Toggle checked={b.active} onChange={(v) => toggle.mutate({ id: b.id, data: { active: v } })} label={t('admin.active')} />
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" icon={Pencil} onClick={() => setEdit(b)} aria-label={`${t('admin.edit')} ${b.title ?? ''}`}>{t('admin.edit')}</Button>
                  <IconButton icon={Trash2} label={`${t('admin.delete')} ${b.title ?? ''}`} className="text-danger" onClick={() => setDel(b)} />
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} size="lg" dismissible={false} title={edit === 'new' ? t('admin.addBanner') : t('admin.edit')}>
        {edit ? <BannerForm key={edit === 'new' ? 'new' : edit.id} initial={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} /> : null}
      </Modal>
      <Modal open={previewAll} onClose={() => setPreviewAll(false)} size="lg" title={t('admin.previewAll')}>
        <Carousel items={(q.data ?? []).filter((b) => b.showing).map(toSlide)} height={260} label={t('admin.previewAll')} />
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger loading={remove.isPending} title={t('admin.deleteTitle')} message={t('admin.deleteBody', { name: del?.title ?? '' })} confirmLabel={t('admin.delete')} onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })} />
    </div>
  );
}
