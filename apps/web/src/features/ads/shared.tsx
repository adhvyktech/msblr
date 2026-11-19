import type { ReactNode } from 'react';
import { Badge, type BadgeTone } from '@/components/ui';
import { fileSrc } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/useT';

export type AdStatus = 'REQUESTED' | 'CONTENT_SUBMITTED' | 'RETURNED' | 'APPROVED' | 'LIVE' | 'PAUSED' | 'EXPIRED' | 'REJECTED';
export type ClickType = 'CALL' | 'WHATSAPP' | 'WEB' | 'NONE';
export type Period = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';
export const PERIODS: Period[] = ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'];
export const AD_STATUSES: AdStatus[] = ['REQUESTED', 'CONTENT_SUBMITTED', 'RETURNED', 'APPROVED', 'LIVE', 'PAUSED', 'EXPIRED', 'REJECTED'];

export interface Plan { id: number; period: Period; price: number; active: boolean; months?: number }
export interface Placement {
  id: number; code: string; name: string; platform: 'WEB' | 'APP' | 'BOTH'; width: number; height: number; maxKb: number; formats: string; videoMaxS: number | null; active: boolean;
  plans?: Plan[];
}
export interface AdInfo {
  id: number; title: string | null; textLine: string | null; clickType: ClickType; clickValue: string | null; creativeFileId: number | null; creativeUrl: string | null;
  mime: string | null; startsAt: string | null; endsAt: string | null; priority: number; shuffle: boolean; paused: boolean;
}
export interface PaymentInfo { id: number; status: 'PENDING' | 'APPROVED' | 'REJECTED'; amount: number; utr: string; paidOn: string; screenshotUrl?: string | null }
export interface AdRequestRow {
  id: number; status: AdStatus; notes: string | null; remarks: string | null; createdAt: string; updatedAt: string;
  advertiser?: { id: number; name: string; contactPerson: string | null; mobile: string; email: string | null };
  placement: Placement; plan: { id: number; period: Period; price: number } | null; ad: AdInfo | null;
  paymentStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'; payments: PaymentInfo[];
  stats: { impressions: number; uniqueViewers: number; clicks: number };
}
export interface AdRequestDetail extends AdRequestRow {
  checks: { creative: { width: number | null; height: number | null; sizeKb: number; mime: string; formatOk: boolean; sizeOk: boolean; dimsOk: boolean } | null; hasText: boolean; clickOk: boolean; paid: boolean };
}

export const statusTone = (s: string): BadgeTone => {
  switch (s) {
    case 'LIVE': case 'APPROVED': return 'success';
    case 'EXPIRED': case 'REJECTED': return 'danger';
    case 'RETURNED': case 'PAUSED': case 'REQUESTED': return 'warning';
    case 'CONTENT_SUBMITTED': return 'info';
    default: return 'neutral';
  }
};
export function AdStatusBadge({ status }: { status: string }) {
  const { t } = useT('ads');
  return <Badge tone={statusTone(status)}>{t(`status.${status}`)}</Badge>;
}

export const formatList = (f: string) => f.split(',').map((x) => x.trim().toUpperCase()).join(' / ');
export const allowsVideo = (p: Pick<Placement, 'formats'>) => p.formats.split(',').map((x) => x.trim()).includes('mp4');
export const sizeLabel = (p: Pick<Placement, 'width' | 'height'>) => `${p.width} × ${p.height} px`;
export const rupees = (n: number) => `₹${new Intl.NumberFormat('en-IN').format(n)}`;

/** The creative itself: image, video, or a text line. Fills its (relatively positioned) parent. */
export function AdCreative({ ad, className }: { ad: { creativeUrl?: string | null; mime?: string | null; textLine?: string | null; title?: string | null } | null; className?: string }) {
  const { t } = useT('ads');
  if (ad?.creativeUrl) {
    return ad.mime?.startsWith('video/')
      ? <video src={fileSrc(ad.creativeUrl)} className={cn('h-full w-full object-cover', className)} muted autoPlay loop playsInline />
      : <img src={fileSrc(ad.creativeUrl)} alt={ad.title ?? t('frame.adAlt')} className={cn('h-full w-full object-cover', className)} />;
  }
  return (
    <div className={cn('grid h-full w-full place-items-center bg-accent p-3 text-center text-sm font-semibold text-on-primary', className)}>
      {ad?.textLine || ad?.title || t('frame.noCreative')}
    </div>
  );
}

export type FrameVariant = 'webHome' | 'appHome' | 'side' | 'loading' | 'inline' | 'footer' | 'spotlight' | 'appBiz';
export const VARIANT_BY_CODE: Record<string, FrameVariant> = {
  HOME_CAROUSEL: 'webHome', WEB_SIDE: 'side', WEB_INLINE: 'inline', WEB_FOOTER: 'footer', WEB_BIZ_SPOTLIGHT: 'spotlight',
  APP_CARD: 'appHome', APP_BIZ_CARD: 'appBiz', APP_LOADING: 'loading',
};

const stub = (cls: string) => <div className={cn('rounded-theme-xs bg-line', cls)} />;

/** A mock screen with the ad placed in its slot. The dashed box is the safe area: keep logos and text inside it. */
export function PlacementFrame({ variant, ad, safe = true, label }: {
  variant: FrameVariant; ad: { creativeUrl?: string | null; mime?: string | null; textLine?: string | null; title?: string | null } | null; safe?: boolean; label?: ReactNode;
}) {
  const { t } = useT('ads');
  const slot = (ratio: string, className?: string) => (
    <div className={cn('relative w-full overflow-hidden rounded-theme-xs bg-ink/10', className)} style={{ aspectRatio: ratio }}>
      <AdCreative ad={ad} />
      <span className="absolute right-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-white">{t('frame.adTag')}</span>
      {safe ? <div className="pointer-events-none absolute inset-[8%] rounded border-[1.5px] border-dashed border-white/85" aria-hidden /> : null}
    </div>
  );
  const phone = (children: ReactNode) => (
    <div className="mx-auto w-[240px] overflow-hidden rounded-[26px] border-[5px] border-ink/80 bg-bg">{children}</div>
  );
  const bar = (
    <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
      <span className="h-4 w-4 rounded-full bg-primary" aria-hidden />
      <span className="text-[11px] font-semibold text-ink/80">{t('frame.appName')}</span>
    </div>
  );
  let body: ReactNode;
  switch (variant) {
    case 'webHome':
      body = (<div className="rounded-theme border border-line bg-bg p-3">{bar}<div className="mt-3">{slot('8 / 3')}</div><div className="mt-3 grid grid-cols-4 gap-2">{[0, 1, 2, 3].map((i) => <div key={i}>{stub('h-12')}</div>)}</div><div className="mt-3 space-y-2">{stub('h-3 w-2/3')}{stub('h-3 w-1/2')}</div></div>);
      break;
    case 'appHome':
      body = phone(<>{bar}<div className="space-y-2 p-2.5">{stub('h-16')}{slot('2 / 1')}{stub('h-3 w-2/3')}{stub('h-10')}</div></>);
      break;
    case 'side':
      body = (<div className="rounded-theme border border-line bg-bg p-3">{bar}<div className="mt-3 grid grid-cols-[1fr_96px] gap-3"><div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i}>{stub('h-14')}</div>)}</div><div>{slot('1 / 2')}</div></div></div>);
      break;
    case 'loading':
      body = phone(<div className="flex min-h-[380px] flex-col items-center justify-between bg-primary p-4 text-on-primary"><div className="mt-10 text-center"><div className="mx-auto mb-3 h-16 w-16 rounded-full bg-white/25" aria-hidden /><p className="font-head text-lg">{t('frame.appName')}</p><p className="text-xs opacity-80">{t('frame.tagline')}</p></div><div className="w-full">{slot('18 / 5')}</div></div>);
      break;
    case 'appBiz':
      body = phone(<>{bar}<div className="space-y-2 p-2.5">{stub('h-12')}{stub('h-12')}{slot('27 / 10')}{stub('h-12')}</div></>);
      break;
    case 'spotlight':
      body = (<div className="rounded-theme border border-line bg-bg p-3">{bar}<div className="mt-3 grid grid-cols-2 gap-3">{slot('3 / 2')}<div className="space-y-2">{stub('h-3 w-full')}{stub('h-3 w-2/3')}{stub('h-10')}</div></div></div>);
      break;
    case 'inline':
      body = (<div className="rounded-theme border border-line bg-bg p-3">{bar}<div className="mt-3 space-y-2">{stub('h-14')}{slot('6 / 1')}{stub('h-14')}</div></div>);
      break;
    default:
      body = (<div className="rounded-theme border border-line bg-bg p-3">{bar}<div className="mt-3 space-y-2">{stub('h-20')}{stub('h-3 w-1/2')}</div><div className="mt-3">{slot('10 / 1')}</div></div>);
  }
  return (
    <figure>
      {body}
      {label ? <figcaption className="mt-2 text-center text-xs text-muted">{label}</figcaption> : null}
    </figure>
  );
}
