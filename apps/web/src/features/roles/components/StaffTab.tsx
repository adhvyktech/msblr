import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { Badge, Button, ConfirmDialog, ErrorState, Modal, Select, Table, useToast, type Column } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/useT';
import { fmtDateTime, formatMobile } from '@/lib/format';
import { useRoles, useStaff, useZones, type PickUser, type StaffRole, type StaffUser } from '../api';
import { UserPicker } from './UserPicker';

export function StaffTab() {
  const { t, tc } = useT('roles');
  const toast = useToast();
  const qc = useQueryClient();
  const staff = useStaff();
  const roles = useRoles();
  const zones = useZones();
  const [assign, setAssign] = useState<{ user: PickUser | null } | null>(null);
  const [roleName, setRoleName] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [remove, setRemove] = useState<{ user: StaffUser; role: StaffRole } | null>(null);

  const refresh = () => { void qc.invalidateQueries({ queryKey: ['roles'] }); void qc.invalidateQueries({ queryKey: ['approvals'] }); };
  const save = useMutation({
    mutationFn: () => api.post('/api/roles/assign', { userId: assign!.user!.id, roleName, zoneId: zoneId ? Number(zoneId) : null }),
    onSuccess: () => { toast.success(t('staff.assigned')); setAssign(null); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: () => api.delete(`/api/roles/assign/${remove!.role.userRoleId}`),
    onSuccess: () => { toast.success(t('staff.removed')); setRemove(null); refresh(); },
    onError: (e: Error) => { toast.error(e.message); setRemove(null); },
  });

  const open = (user: StaffUser | null) => {
    setAssign({ user: user ? { id: user.userId, name: user.name, mobile: user.mobile, membershipNo: user.membershipNo } : null });
    setRoleName('');
    setZoneId('');
  };

  const cols: Column<StaffUser>[] = [
    {
      key: 'name', header: t('staff.person'),
      render: (u) => (<div><div className="font-semibold">{u.name}</div><div className="text-xs text-muted">{formatMobile(u.mobile)}{u.membershipNo ? ` · ${u.membershipNo}` : ''}</div></div>),
    },
    {
      key: 'roles', header: t('staff.roles'),
      render: (u) => (
        <div className="flex flex-wrap gap-1.5">
          {u.roles.map((r) => (
            <Badge key={r.userRoleId} tone="accent" className="pr-1">
              {r.label}{r.zoneName ? ` · ${r.zoneName}` : ''}
              <button type="button" onClick={() => setRemove({ user: u, role: r })} aria-label={t('staff.removeRole', { role: r.label, name: u.name })} className="ml-0.5 grid h-6 w-6 place-items-center rounded-full hover:bg-ink/10"><X size={13} aria-hidden /></button>
            </Badge>
          ))}
        </div>
      ),
    },
    { key: 'last', header: t('staff.lastLogin'), hideOnMobile: true, render: (u) => <span className="whitespace-nowrap text-sm text-muted">{fmtDateTime(u.lastLoginAt)}</span> },
    { key: 'add', header: <span className="sr-only">{t('staff.addRole')}</span>, align: 'right', render: (u) => <Button size="sm" variant="outline" icon={Plus} onClick={() => open(u)}>{t('staff.addRole')}</Button> },
  ];

  if (staff.isError) return <ErrorState onRetry={() => void staff.refetch()} />;
  const staffRoles = (roles.data?.roles ?? []).filter((r) => r.isStaff);
  const needsZone = roleName === 'content';

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">{t('staff.intro')}</p>
        <Button icon={Plus} onClick={() => open(null)}>{t('staff.assign')}</Button>
      </div>
      <Table columns={cols} rows={staff.data ?? []} rowKey={(u) => u.userId} loading={staff.isLoading} caption={t('tabs.staff')} />

      <Modal
        open={!!assign} onClose={() => setAssign(null)} title={t('staff.assign')}
        footer={<><Button variant="ghost" onClick={() => setAssign(null)}>{tc('actions.cancel')}</Button><Button loading={save.isPending} disabled={!assign?.user || !roleName} onClick={() => save.mutate()}>{t('staff.assignBtn')}</Button></>}
      >
        {assign ? (
          <div className="space-y-4">
            <UserPicker label={t('staff.person')} value={assign.user} onChange={(u) => setAssign({ user: u })} />
            <Select label={t('staff.role')} required value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder={t('staff.chooseRole')} options={staffRoles.map((r) => ({ value: r.name, label: r.label }))} />
            {needsZone ? (
              <Select label={t('staff.zone')} hint={t('staff.zoneHint')} value={zoneId} onChange={(e) => setZoneId(e.target.value)} placeholder={t('staff.allZones')} options={(zones.data ?? []).map((z) => ({ value: z.id, label: z.name }))} />
            ) : null}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!remove} onClose={() => setRemove(null)} onConfirm={() => del.mutate()} loading={del.isPending} danger
        title={t('staff.removeTitle')} message={remove ? t('staff.removeMsg', { role: remove.role.label, name: remove.user.name }) : null} confirmLabel={tc('actions.remove')}
      />
    </div>
  );
}
