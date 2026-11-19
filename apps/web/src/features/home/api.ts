import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Announcement, EventItem, HighlightItem } from '@/features/events/api';
import type { Trust } from '@/features/trusts/api';

export interface HomeBanner {
  id: number; kind: 'BANNER' | 'AD' | 'VIDEO'; title: string | null; subtitle: string | null; url: string | null; mime: string | null;
  linkUrl: string | null; adId: number | null; ad: { id: number; clickType: 'CALL' | 'WHATSAPP' | 'WEB' | 'NONE'; clickValue: string | null } | null; durationMs: number;
}
export interface HomeBirthday { id: number; name: string; photoUrl: string | null }
export interface HomeData {
  greetingName: string;
  banners: HomeBanner[];
  highlights: HighlightItem[];
  trusts: (Trust & { attachmentCount: number })[];
  announcements: Announcement[];
  upcomingEvents: EventItem[];
  upcomingEventCount: number;
  stats: { activeFamilies: number; members: number; businesses: number };
  todaysBirthdays: HomeBirthday[];
}

export const useHome = () => useQuery({ queryKey: ['home'], queryFn: () => api.get<HomeData>('/api/home'), staleTime: 60_000, refetchOnWindowFocus: false });

/** Same query key/function as <AdSlot/>, so it shares the cache; lets a tile know whether an ad exists. */
export function useAdAvailable(placement: string) {
  const { data } = useQuery({
    queryKey: ['ad', placement],
    queryFn: async () => {
      const d = await api.get<unknown>('/api/ads/serve', { params: { placement } });
      return (Array.isArray(d) ? d[0] ?? null : d) as { id: number } | null;
    },
    staleTime: 60_000, retry: false, refetchOnWindowFocus: false,
  });
  return !!data;
}
