import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, refreshSession, setAccessToken, setAuthLostHandler } from './api';

export interface PublicPerson {
  id: number; familyId: number; name: string; isHead: boolean; relation: string | null; gender: string | null;
  education: string | null; occupation: string | null; membershipNo: string | null; zone: string | null; area: string | null;
  mobile: string | null; whatsapp: string | null; email: string | null; address: string | null; photoUrl: string | null;
  dob: string | null; anniversary: string | null; bloodGroup: string | null; businessVisible: boolean; hidden: string[];
}
export interface Me {
  user: { id: number; name: string; mobile: string; language: 'en' | 'hi'; advertiserId: number | null };
  roles: string[];
  perms: string[];
  zoneIds: number[];
  person: PublicPerson | null;
  family: {
    id: number; membershipNo: string | null; zone: string | null; status: string; subscriptionStatus: 'ACTIVE' | 'DUE' | 'EXPIRED';
    subscriptionValidUntil: string | null; memberCount: number; headName: string | null;
  } | null;
  isHead: boolean;
  isStaff: boolean;
}

type Status = 'loading' | 'authed' | 'anon';
interface AuthCtx {
  status: Status;
  me: Me | null;
  isStaff: boolean;
  isHead: boolean;
  /** true if the user has ANY of the given permissions */
  can: (...perms: string[]) => boolean;
  requestOtp: (mobile: string) => Promise<{ expiresInSec: number; resendAfterSec: number }>;
  verifyOtp: (mobile: string, code: string, trustDevice: boolean) => Promise<Me>;
  logout: () => Promise<void>;
  reloadMe: () => Promise<void>;
  setLanguage: (l: 'en' | 'hi') => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me | null>(null);

  const loadMe = useCallback(async () => {
    const m = await api.get<Me>('/api/me');
    setMe(m);
    setStatus('authed');
    return m;
  }, []);

  const clear = useCallback(() => {
    setAccessToken(null);
    setMe(null);
    setStatus('anon');
    qc.clear();
  }, [qc]);

  useEffect(() => {
    setAuthLostHandler(clear);
    let alive = true;
    (async () => {
      if (await refreshSession()) {
        try { await loadMe(); return; } catch { /* fall through */ }
      }
      if (alive) { setAccessToken(null); setStatus('anon'); }
    })();
    return () => { alive = false; setAuthLostHandler(null); };
  }, [clear, loadMe]);

  const value = useMemo<AuthCtx>(() => ({
    status,
    me,
    isStaff: !!me?.isStaff,
    isHead: !!me?.isHead,
    can: (...perms) => !!me && perms.some((p) => me.perms.includes(p)),
    requestOtp: (mobile) => api.post('/api/auth/otp/request', { mobile }),
    verifyOtp: async (mobile, code, trustDevice) => {
      const r = await api.post<{ accessToken: string }>('/api/auth/otp/verify', { mobile, code, trustDevice });
      setAccessToken(r.accessToken);
      return loadMe();
    },
    logout: async () => {
      try { await api.post('/api/auth/logout', {}); } catch { /* ignore */ }
      clear();
    },
    reloadMe: async () => { if (status === 'authed') await loadMe(); },
    setLanguage: async (l) => {
      if (status === 'authed') {
        try { await api.patch('/api/me/language', { language: l }); setMe((m) => (m ? { ...m, user: { ...m.user, language: l } } : m)); } catch { /* non-fatal */ }
      }
    },
  }), [status, me, loadMe, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside <AuthProvider>');
  return c;
}
