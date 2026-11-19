import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/useT';

export interface PublicSite {
  sabha: { name: string; nameHi: string; address: string; phone: string; email: string };
  about: { en: string; hi: string };
  mapsUrl: string;
  committee: { name: string; role: string; roleHi: string; photoUrl: string | null }[];
  stats: { activeFamilies: number; businesses: number; upcomingEvents: number };
  upcomingEvents: { id: number; title: string; kind: string; startsAt: string; endsAt: string | null; venue: string | null; noticeUrl: string | null }[];
  highlights: { id: number; title: string; summary: string | null; publishedAt: string; media: string[] }[];
  trusts: { id: number; name: string; description: string | null; attachments: { id: number; label: string; url: string }[] }[];
}

export const usePublicSite = () =>
  useQuery({ queryKey: ['public-site'], queryFn: () => api.get<PublicSite>('/api/public/site'), staleTime: 60_000, retry: 1 });

/** Set to false to remove the "Draft" banner from the Privacy policy and Terms pages. */
export const SHOW_LEGAL_DRAFT_NOTE = true;

export function useFormatDate() {
  const { lang } = useT('site');
  return (iso: string, withTime = false) =>
    new Date(iso).toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    });
}

export const mapsLink = (site: Pick<PublicSite, 'mapsUrl' | 'sabha'>) =>
  site.mapsUrl || (site.sabha.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.sabha.address)}` : '');

/** Scrolls to #hash once content is ready (SPA navigation does not do it natively). */
export function useHashScroll(ready: boolean) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [ready, hash]);
}
