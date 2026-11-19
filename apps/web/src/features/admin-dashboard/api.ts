import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ApprovalType = 'registrations' | 'logins' | 'businesses' | 'ads' | 'payments';

export interface WaitingItem {
  type: ApprovalType;
  id: number;
  who: string;
  detail: string | null;
  submittedAt: string;
  path: string;
}
export interface DashboardData {
  kpis: {
    activeFamilies: { count: number; newThisMonth: number };
    pendingApprovals: { registrations: number | null; logins: number | null; businesses: number | null; ads: number | null };
    paymentsToVerify: { count: number; amount: number } | null;
    liveAds: { count: number; expiringIn7d: number } | null;
    appUsersThisWeek: { count: number; percent: number; totalUsers: number } | null;
  };
  subscriptions: { active: number; due: number; expired: number } | null;
  loginsByDay: { date: string; web: number; app: number; total: number }[] | null;
  waiting: WaitingItem[];
  contentAlert: { daysSince: number | null; staleDays: number; stale: boolean; lastHighlightAt: string | null } | null;
}

export const useDashboard = () => useQuery({ queryKey: ['admin', 'dashboard'], queryFn: () => api.get<DashboardData>('/api/dashboard'), refetchInterval: 60_000 });
