import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface StaffRole { userRoleId: number; roleId: number; name: string; label: string; zoneId: number | null; zoneName: string | null }
export interface StaffUser { userId: number; name: string; mobile: string; membershipNo: string | null; status: string; lastLoginAt: string | null; roles: StaffRole[] }
export interface RoleRow { id: number; name: string; label: string; isStaff: boolean; userCount: number; permissions: string[] }
export interface PickUser { id: number; name: string; mobile: string; membershipNo: string | null }
export interface ZoneRow { id: number; name: string; sort: number; families: number; events: number; staff: number }

export const useStaff = () => useQuery({ queryKey: ['roles', 'staff'], queryFn: () => api.get<StaffUser[]>('/api/roles/staff') });
export const useRoles = () =>
  useQuery({
    queryKey: ['roles', 'roles'],
    queryFn: async () => {
      const r = await api.list<RoleRow>('/api/roles/roles');
      return { roles: r.data, allPermissions: (r as unknown as { allPermissions: string[] }).allPermissions };
    },
  });
export const useZones = () => useQuery({ queryKey: ['settings', 'zones'], queryFn: () => api.get<ZoneRow[]>('/api/settings/zones') });
