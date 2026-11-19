import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useInvalidatingMutation } from '@/features/home/mutate';

export type EventKind = 'AGM' | 'EC' | 'SOCIAL' | 'RELIGIOUS' | 'CULTURAL' | 'SPORTS' | 'OTHER';
export const EVENT_KINDS: EventKind[] = ['AGM', 'EC', 'SOCIAL', 'RELIGIOUS', 'CULTURAL', 'SPORTS', 'OTHER'];

export interface Zone { id: number; name: string }
export interface MediaItem { id: number; url: string; mime: string }
export interface EventItem {
  id: number; title: string; body: string | null; kind: EventKind; zone: Zone | null; zoneId: number | null;
  startsAt: string; endsAt: string | null; venue: string | null; registrationUrl: string | null;
  noticeFileId: number | null; noticeUrl: string | null; status: 'DRAFT' | 'PUBLISHED'; canEdit: boolean;
}
export interface HighlightItem {
  id: number; title: string; summary: string | null; event: { id: number; title: string } | null; eventId: number | null;
  media: MediaItem[]; coverUrl: string | null; status: 'DRAFT' | 'PUBLISHED'; authorId: number | null; authorName: string | null; publishedAt: string;
}
export type EventDetail = EventItem & { highlights: HighlightItem[] };

export type BannerKind = 'BANNER' | 'AD' | 'VIDEO';
export interface BannerItem {
  id: number; kind: BannerKind; title: string | null; subtitle: string | null; fileId: number | null; url: string | null; mime: string | null;
  linkUrl: string | null; adId: number | null; ad: { id: number; clickType: 'CALL' | 'WHATSAPP' | 'WEB' | 'NONE'; clickValue: string | null; live: boolean } | null;
  sort: number; durationMs: number; activeFrom: string | null; activeTo: string | null; active: boolean; showing: boolean;
}
export interface Announcement { id: number; title: string; body: string | null; pinned: boolean; expiresAt: string | null; createdAt: string; expired?: boolean }

export const useZones = () => useQuery({ queryKey: ['events', 'zones'], queryFn: () => api.get<Zone[]>('/api/events/zones'), staleTime: 10 * 60_000 });

export const useEvents = (p: { when?: 'upcoming' | 'past'; zoneId?: number | ''; kind?: string; page?: number; pageSize?: number; admin?: boolean }) =>
  useQuery({
    queryKey: ['events', 'list', p],
    queryFn: () => api.list<EventItem>('/api/events', { when: p.when, zoneId: p.zoneId || undefined, kind: p.kind || undefined, page: p.page ?? 1, pageSize: p.pageSize ?? 20, admin: p.admin ? 1 : undefined }),
    placeholderData: keepPreviousData,
  });
export const useEvent = (id?: string) => useQuery({ queryKey: ['events', 'one', id], queryFn: () => api.get<EventDetail>(`/api/events/${id}`), enabled: !!id });

export type EventInput = Partial<Pick<EventItem, 'title' | 'body' | 'kind' | 'zoneId' | 'venue' | 'registrationUrl' | 'noticeFileId' | 'status'>> & { startsAt?: string; endsAt?: string | null };
export const useSaveEvent = (msg: string) =>
  useInvalidatingMutation((v: { id?: number; data: EventInput }) => (v.id ? api.patch(`/api/events/${v.id}`, v.data) : api.post('/api/events', v.data)), [['events']], msg);
export const useDeleteEvent = (msg: string) => useInvalidatingMutation((id: number) => api.delete(`/api/events/${id}`), [['events']], msg);

export const useHighlights = (p: { page?: number; pageSize?: number; admin?: boolean }) =>
  useQuery({
    queryKey: ['highlights', 'list', p],
    queryFn: () => api.list<HighlightItem>('/api/highlights', { page: p.page ?? 1, pageSize: p.pageSize ?? 12, admin: p.admin ? 1 : undefined }),
    placeholderData: keepPreviousData,
  });
export const useHighlight = (id?: string) => useQuery({ queryKey: ['highlights', 'one', id], queryFn: () => api.get<HighlightItem>(`/api/highlights/${id}`), enabled: !!id });
export type HighlightInput = { title?: string; summary?: string | null; mediaFileIds?: number[]; eventId?: number | null; status?: 'DRAFT' | 'PUBLISHED' };
export const useSaveHighlight = (msg: string) =>
  useInvalidatingMutation((v: { id?: number; data: HighlightInput }) => (v.id ? api.patch(`/api/highlights/${v.id}`, v.data) : api.post('/api/highlights', v.data)), [['highlights'], ['events']], msg);
export const useDeleteHighlight = (msg: string) => useInvalidatingMutation((id: number) => api.delete(`/api/highlights/${id}`), [['highlights'], ['events']], msg);

export const useAdminBanners = () => useQuery({ queryKey: ['banners', 'admin'], queryFn: () => api.get<BannerItem[]>('/api/banners/admin') });
export const useBannerAds = () => useQuery({ queryKey: ['banners', 'ads'], queryFn: () => api.get<{ id: number; title: string; advertiser: string }[]>('/api/banners/admin/ads') });
export type BannerInput = {
  kind?: BannerKind; title?: string | null; subtitle?: string | null; fileId?: number | null; linkUrl?: string | null; adId?: number | null;
  durationMs?: number; activeFrom?: string | null; activeTo?: string | null; active?: boolean;
};
export const useSaveBanner = (msg?: string) =>
  useInvalidatingMutation((v: { id?: number; data: BannerInput }) => (v.id ? api.patch(`/api/banners/${v.id}`, v.data) : api.post('/api/banners', v.data)), [['banners']], msg);
export const useDeleteBanner = (msg: string) => useInvalidatingMutation((id: number) => api.delete(`/api/banners/${id}`), [['banners']], msg);
export const useReorderBanners = () => useInvalidatingMutation((ids: number[]) => api.put('/api/banners/order', { ids }), [['banners']]);

export const useAnnouncements = () => useQuery({ queryKey: ['announcements'], queryFn: () => api.get<Announcement[]>('/api/home/announcements') });
export type AnnouncementInput = { title?: string; body?: string | null; pinned?: boolean; expiresAt?: string | null };
export const useSaveAnnouncement = (msg: string) =>
  useInvalidatingMutation((v: { id?: number; data: AnnouncementInput }) => (v.id ? api.patch(`/api/home/announcements/${v.id}`, v.data) : api.post('/api/home/announcements', v.data)), [['announcements']], msg);
export const useDeleteAnnouncement = (msg: string) => useInvalidatingMutation((id: number) => api.delete(`/api/home/announcements/${id}`), [['announcements']], msg);

/** <input type="datetime-local"> value <-> ISO */
export const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
