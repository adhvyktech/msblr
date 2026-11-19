import { useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, fileSrc } from '@/lib/api';
import { cn } from '@/lib/cn';
import { whatsappLink } from '@/lib/format';

/**
 * Contract with the Ads module:
 *   GET  /api/ads/serve?placement=CODE -> { data: ServedAd | ServedAd[] | null }
 *   POST /api/ads/:id/impression       (once per mount)
 *   POST /api/ads/:id/click  { type: 'CALL'|'WHATSAPP'|'WEB'|'NONE' }
 */
export interface ServedAd {
  id: number;
  creativeUrl?: string | null;
  mime?: string | null;
  textLine?: string | null;
  title?: string | null;
  clickType: 'CALL' | 'WHATSAPP' | 'WEB' | 'NONE';
  clickValue?: string | null;
}
export type AdPlacementCode = 'HOME_CAROUSEL' | 'WEB_SIDE' | 'WEB_INLINE' | 'WEB_FOOTER' | 'WEB_BIZ_SPOTLIGHT' | 'APP_CARD' | 'APP_BIZ_CARD' | 'APP_LOADING';

export function adHref(ad: Pick<ServedAd, 'clickType' | 'clickValue'>): string | null {
  const v = ad.clickValue?.trim();
  if (!v) return null;
  if (ad.clickType === 'CALL') return `tel:${v.replace(/[^\d+]/g, '')}`;
  if (ad.clickType === 'WHATSAPP') return whatsappLink(v);
  if (ad.clickType === 'WEB') return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  return null;
}

export function AdSlot({ placement, className, minHeight }: { placement: AdPlacementCode; className?: string; minHeight?: number }) {
  const { t } = useTranslation('common');
  const { data } = useQuery({
    queryKey: ['ad', placement],
    queryFn: async () => {
      const d = await api.get<ServedAd | ServedAd[] | null>('/api/ads/serve', { params: { placement } });
      return Array.isArray(d) ? d[0] ?? null : d;
    },
    staleTime: 60_000, retry: false, refetchOnWindowFocus: false,
  });
  const impression = useMutation({ mutationFn: (id: number) => api.post(`/api/ads/${id}/impression`) });
  const click = useMutation({ mutationFn: (v: { id: number; type: string }) => api.post(`/api/ads/${v.id}/click`, { type: v.type }) });
  const seen = useRef<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data || seen.current === data.id || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting) && seen.current !== data.id) { seen.current = data.id; impression.mutate(data.id, { onError: () => undefined }); io.disconnect(); }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!data) return null;
  const href = adHref(data);
  const inner = data.creativeUrl ? (
    data.mime?.startsWith('video/')
      ? <video src={fileSrc(data.creativeUrl)} className="h-full w-full object-cover" muted autoPlay loop playsInline />
      : <img src={fileSrc(data.creativeUrl)} alt={data.title ?? 'Advertisement'} className="h-full w-full object-cover" loading="lazy" />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-accent-soft p-4 text-center font-semibold">{data.textLine ?? data.title}</div>
  );
  const box = cn('relative block overflow-hidden rounded-theme border border-line bg-surface', className);
  const tag = <span className="absolute right-2 top-2 z-10 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-white">{t('ad')}</span>;
  return (
    <div ref={ref} style={{ minHeight }}>
      {href ? (
        <a href={href} target={data.clickType === 'WEB' || data.clickType === 'WHATSAPP' ? '_blank' : undefined} rel="noopener noreferrer sponsored" className={box} onClick={() => click.mutate({ id: data.id, type: data.clickType })} aria-label={data.title ?? 'Advertisement'}>
          {tag}{inner}
        </a>
      ) : (
        <div className={box}>{tag}{inner}</div>
      )}
    </div>
  );
}
