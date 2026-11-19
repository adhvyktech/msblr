import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Pencil, UserX } from 'lucide-react';
import {
  Avatar, Badge, Button, Card, ConfirmDialog, ErrorState, IconButton, Input, Modal, PageHeader, Select, Skeleton, StatusBadge, Table, useToast, type Column,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fmtDate, formatMobile } from '@/lib/format';
import { PersonFormModal, personPayload, relationKey, type PersonValues } from '@/features/family/PersonForm';
import { useAdminFamily, useMembersMutations, useZones, type AdminFamily as Fam, type AdminPerson } from '../api';

const toValues = (p: AdminPerson): PersonValues => ({
  name: p.name, relation: p.relation, gender: p.gender ?? '', dob: p.dob ?? '', anniversary: p.anniversary ?? '', mobile: p.mobile ?? '',
  email: p.email ?? '', education: p.education ?? '', occupation: p.occupation ?? '', photo: null,
});

export default function AdminFamily() {
  const { t } = useTranslation('members');
  const { t: tf } = useTranslation('family');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const { can } = useAuth();
  const id = Number(useParams().familyId);
  const q = useAdminFamily(id);
  const m = useMembersMutations();
  const [editFamily, setEditFamily] = useState(false);
  const [editPerson, setEditPerson] = useState<AdminPerson | null>(null);
  const [withdraw, setWithdraw] = useState<AdminPerson | null>(null);
  const canEdit = can('members.edit');
  const initial = useMemo(() => (editPerson ? toValues(editPerson) : toValues({ name: '', relation: '' } as AdminPerson)), [editPerson]);

  if (q.isLoading) return <div className="space-y-3"><Skeleton className="h-10 w-64" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  if (q.isError || !q.data) return <ErrorState onRetry={() => void q.refetch()} />;
  const f = q.data;

  const columns: Column<AdminPerson>[] = [
    { key: 'name', header: t('admin.person'), render: (p) => <div className="flex items-center gap-3"><Avatar name={p.name} src={p.photoUrl} size={38} /><div><p className="font-semibold">{p.name}{p.isHead ? <Badge tone="accent" className="ml-2">{t('profile.head')}</Badge> : null}</p><p className="text-sm text-muted">{p.isHead ? tf('relations.SELF') : tf(relationKey(p.relation))}</p></div></div> },
    { key: 'dob', header: t('admin.dob'), hideOnMobile: true, render: (p) => fmtDate(p.dob) },
    { key: 'contact', header: t('admin.contact'), render: (p) => <div><p>{formatMobile(p.mobile) || '—'}</p><p className="text-sm text-muted">{p.email ?? ''}</p></div> },
    {
      key: 'login', header: t('admin.login'), hideOnMobile: true,
      render: (p) => p.loginStatus === 'ACTIVE' ? <Badge tone="success">{tf('status.active')}</Badge> : p.loginStatus === 'REQUESTED' ? <Badge tone="warning">{tf('status.requested')}</Badge> : <Badge>{tf('status.none')}</Badge>,
    },
    {
      key: 'actions', header: '', align: 'right',
      render: (p) => (
        <div className="flex justify-end gap-1">
          {canEdit ? <IconButton icon={Pencil} label={t('admin.editPerson', { name: p.name })} onClick={() => setEditPerson(p)} /> : null}
          {can('logins.approve') && !p.isHead && p.loginStatus === 'ACTIVE' ? <IconButton icon={UserX} label={t('admin.withdrawLogin', { name: p.name })} className="text-danger" onClick={() => setWithdraw(p)} /> : null}
        </div>
      ),
    },
  ];

  return (
    <div>
      <Link to="/admin/members" className="mb-2 inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-primary"><ArrowLeft size={18} aria-hidden />{t('admin.back')}</Link>
      <PageHeader
        title={`${f.membershipNo ?? t('admin.noNumber')} · ${f.head ?? ''}`}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2"><StatusBadge status={f.status} /><StatusBadge status={f.subscriptionStatus} label={`${t('admin.subscription')}: ${tc(`status.${f.subscriptionStatus}`)}`} /></span>}
        actions={canEdit ? <Button variant="outline" icon={Pencil} onClick={() => setEditFamily(true)}>{t('admin.editFamily')}</Button> : null}
      />
      <Card className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Info label={t('admin.zone')} value={f.zone} />
        <Info label={t('form.area')} value={f.area} />
        <Info label={t('form.address')} value={[f.addressLine, f.city, f.pincode].filter(Boolean).join(', ')} />
        <Info label={t('admin.validUntil')} value={f.subscriptionValidUntil ? fmtDate(f.subscriptionValidUntil) : null} />
      </Card>
      <Table columns={columns} rows={f.persons} rowKey={(p) => p.id} caption={t('admin.members')} />

      {editFamily ? <EditFamilyModal fam={f} onClose={() => setEditFamily(false)} /> : null}
      <PersonFormModal
        open={!!editPerson} onClose={() => setEditPerson(null)} initial={initial} title={t('admin.editPersonTitle')} isHead={editPerson?.isHead} dobRequired={false}
        onSubmit={async (v) => {
          if (!editPerson) return;
          const { photoFileId: _omit, ...body } = personPayload(v, { isHead: editPerson.isHead });
          void _omit;
          await m.patchPerson.mutateAsync({ id: editPerson.id, body });
          toast.success(t('admin.saved'));
          setEditPerson(null);
        }}
      />
      <ConfirmDialog
        open={!!withdraw} onClose={() => setWithdraw(null)} danger loading={m.withdrawLogin.isPending}
        title={tf('confirm.withdrawTitle')} message={withdraw ? tf('confirm.withdrawBody', { name: withdraw.name }) : null} confirmLabel={tf('confirm.withdrawYes')}
        onConfirm={async () => {
          if (!withdraw) return;
          try { await m.withdrawLogin.mutateAsync(withdraw.id); toast.success(tf('toast.withdrawn')); } catch (e) { toast.error((e as Error).message); }
          setWithdraw(null);
        }}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return <div className="min-w-0"><p className="text-xs text-muted">{label}</p><p className="break-words font-medium">{value || '—'}</p></div>;
}

function EditFamilyModal({ fam, onClose }: { fam: Fam; onClose: () => void }) {
  const { t } = useTranslation('members');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const zones = useZones();
  const { patchFamily } = useMembersMutations();
  const schema = z.object({
    membershipNo: z.string().refine((v) => v === '' || /^MSB-\d{4,6}$/i.test(v), t('form.errMembershipNo')),
    status: z.string(),
    zoneId: z.string(),
    addressLine: z.string(),
    area: z.string(),
    city: z.string(),
    pincode: z.string().refine((v) => v === '' || /^\d{6}$/.test(v), t('form.errPincode')),
  });
  type V = z.infer<typeof schema>;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: { membershipNo: fam.membershipNo ?? '', status: fam.status, zoneId: fam.zoneId ? String(fam.zoneId) : '', addressLine: fam.addressLine ?? '', area: fam.area ?? '', city: fam.city, pincode: fam.pincode ?? '' },
  });
  const submit = handleSubmit(async (v) => {
    try {
      await patchFamily.mutateAsync({
        id: fam.id,
        body: { membershipNo: v.membershipNo ? v.membershipNo.toUpperCase() : null, status: v.status, zoneId: v.zoneId ? Number(v.zoneId) : null, addressLine: v.addressLine, area: v.area, city: v.city || undefined, pincode: v.pincode },
      });
      toast.success(t('admin.saved'));
      onClose();
    } catch (e) { toast.error((e as Error).message); }
  });
  return (
    <Modal
      open onClose={onClose} title={t('admin.editFamily')} dismissible={!isSubmitting}
      footer={<><Button variant="ghost" onClick={onClose} disabled={isSubmitting}>{tc('actions.cancel')}</Button><Button loading={isSubmitting} onClick={submit}>{tc('actions.save')}</Button></>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={t('form.membershipNo')} placeholder="MSB-0001" error={errors.membershipNo?.message} {...register('membershipNo')} />
          <Select label={t('admin.status')} options={['ACTIVE', 'PENDING', 'INACTIVE', 'REJECTED'].map((s) => ({ value: s, label: tc(`status.${s}`) }))} {...register('status')} />
        </div>
        <Select label={t('admin.zone')} placeholder={t('form.select')} options={(zones.data ?? []).map((z) => ({ value: z.id, label: z.name }))} {...register('zoneId')} />
        <Input label={t('form.address')} {...register('addressLine')} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label={t('form.area')} {...register('area')} />
          <Input label={t('form.city')} {...register('city')} />
          <Input label={t('form.pincode')} inputMode="numeric" maxLength={6} error={errors.pincode?.message} {...register('pincode')} />
        </div>
      </form>
    </Modal>
  );
}
