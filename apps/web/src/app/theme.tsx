import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ThemeVariant = 'a' | 'b' | 'c';
export interface PublicConfig {
  appName: string;
  tagline: string;
  theme: ThemeVariant;
  sabha: { name?: string; nameHi?: string; address?: string; phone?: string; email?: string };
  upi: { id: string | null; payeeName: string | null; qrUrl: string | null };
  subscription: { amount: number | null };
  languages: string[];
}

const isVariant = (v: unknown): v is ThemeVariant => v === 'a' || v === 'b' || v === 'c';
function override(): ThemeVariant | null {
  try {
    const q = new URLSearchParams(window.location.search).get('theme');
    if (isVariant(q)) { sessionStorage.setItem('msblr_theme', q); return q; }
    const s = sessionStorage.getItem('msblr_theme');
    if (isVariant(s)) return s;
  } catch { /* ignore */ }
  return null;
}

const Ctx = createContext<{ variant: ThemeVariant; config: PublicConfig | undefined }>({ variant: 'c', config: undefined });

/** Loads /api/public/config and sets <html data-theme>. ?theme=a|b|c overrides for demos. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({ queryKey: ['public-config'], queryFn: () => api.get<PublicConfig>('/api/public/config'), staleTime: 5 * 60_000, retry: 1 });
  const variant: ThemeVariant = override() ?? (isVariant(data?.theme) ? data!.theme : 'c');
  useEffect(() => {
    document.documentElement.dataset.theme = variant;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#C2501E');
  }, [variant]);
  const value = useMemo(() => ({ variant, config: data }), [variant, data]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 'a' | 'b' | 'c' — only for the home hero; everything else is token-driven. */
export const useThemeVariant = () => useContext(Ctx).variant;
export const usePublicConfig = () => useContext(Ctx).config;
/** Logo URL for the active direction (navy for B, orange otherwise). */
export function useLogo() {
  const v = useThemeVariant();
  return v === 'b' ? '/brand/logo-navy.png' : '/brand/logo-orange.png';
}
