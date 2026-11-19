import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, FileUp, Plus } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Button, DateInput, ErrorState, Input, Modal, PageHeader, Pagination, PhoneInput, SearchInput, Select, StatusBadge, Table, useToast, type Column,
} from '@/components/ui';
import { downloadFile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatMobile } from '@/lib/format';
import { useAdminFamilies, useMembersMutations, useZones, type AdminFamily } from '../api';

const STATUSES = ['ACTIVE', 'PENDING', 'INACTIVE', 'REJECTED'];
const SUBS = ['ACTIVE', 'DUE', 'EXPIRED'];

export default function AdminMembers() {
  const { t } = useTranslation('members');
  const { t: tc } = useTranslation('common');
  const { can } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [f, setF] = useState({ q: '', status: '', subscriptionStatus: '', zoneId: '' });
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const zones = useZones();
  const q = useAdminFamilies({ ...f, page, pageSize: 20 });
  const canEdit = can('members.edit');
  const set = (patch: Partial<typeof f>) => { setF((o) => ({ ...o, ...patch })); setPage(1); };

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
      await downloadFile(`/api/members/admin/export${qs ? `?${qs}` : ''}`, 'msblr-members.xlsx');
    } catch (e) { toast.error((e as Error).message); } finally { setExporting(false); }
  };

  const columns: Column<AdminFamily>[] = [
    { key: 'no', header: t('admin.membershipNo'), render: (r) => <span className="font-semibold">{r.membershipNo ?? '—'}</span> },
    { key: 'head', header: t('admin.head'), render: (r) => <div><p className="font-medium">{r.head ?? '—'}</p><p className="text-sm text-muted">{formatMobile(r.headMobile)}</p></div> },
    { key: 'zone', header: t('admin.zone'), hideOnMobile: true, render: (r) => <div><p>{r.zone ?? '—'}</p><p className="text-sm text-muted">{r.area ?? ''}</p></div> },
    { key: 'count', header: t('admin.members'), hideOnMobile: true, align: 'center', render: (r) => r.memberCount },
    { key: 'status', header: t('admin.status'), render: (r) => <StatusBadge status={r.status} /> },
    { key: 'sub', header: t('admin.subscription'), hideOnMobile: true, render: (r) => <StatusBadge status={r.subscriptionStatus} /> },
    { key: 'view', header: '', align: 'right', render: (r) => <Link to={`/admin/members/${r.id}`} className="font-semibold text-primary underline" onClick={(e) => e.stopPropagation()}>{canEdit ? tc('actions.edit') : tc('actions.view')}</Link> },
  ];

  return (
    <div>
      <PageHeader
        title={t('admin.title')} subtitle={t('admin.subtitle')}
        actions={<>
          <Button variant="outline" icon={Download} loading={exporting} onClick={() => void exportXlsx()}>{t('admin.export')}</Button>
          {canEdit ? <Link to="/admin/members/import"><Button variant="outline" icon={FileUp}>{t('admin.import')}</Button></Link> : null}
          {canEdit ? <Button icon={Plus} onClick={() => setAdding(true)}>{t('admin.addFamily')}</Button> : null}
        </>}
      />
      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_180px_180px_220px]">
        <SearchInput value={f.q} onSearch={(v) => set({ q: v })} placeholder={t('admin.searchPlaceholder')} />
        <Select aria-label={t('admin.status')} value={f.status} onChange={(e) => set({ status: e.target.value })} placeholder={t('admin.allStatuses')} options={STATUSES.map((s) => ({ value: s, label: tc(`status.${s}`) }))} />
        <Select aria-label={t('admin.subscription')} value={f.subscriptionStatus} onChange={(e) => set({ subscriptionStatus: e.target.value })} placeholder={t('admin.allSubscriptions')} options={SUBS.map((s) => ({ value: s, label: tc(`status.${s}`) }))} />
        <Select aria-label={t('admin.zone')} value={f.zoneId} onChange={(e) => set({ zoneId: e.target.value })} placeholder={t('filters.allZones')} options={(zones.data ?? []).map((z) => ({ value: z.id, label: z.name }))} />
      </div>
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : (
        <>
          <Table columns={columns} rows={q.data?.data ?? []} rowKey={(r) => r.id} loading={q.isLoading} onRowClick={(r) => nav(`/admin/members/${r.id}`)} caption={t('admin.title')} />
          <Pagination className="mt-4" page={page} pageSize={q.data?.pageSize ?? 20} total={q.data?.total ?? 0} onPage={setPage} />
        </>
      )}
      <AddFamilyModal open={adding} onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); nav(`/admin/members/${id}`); }} />
    </div>
  );
}

function AddFamilyModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const { t } = useTranslation('members');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const zones = useZones();
  const { createFamily } = useMembersMutations();
  const schema = z.object({
    name: z.string().trim().min(2, t('form.errName')),
    dob: z.string().min(1, t('form.errDob')),
    mobile: z.string().regex(/^[6-9]\d{9}$/, t('form.errMobile')),
    email: z.string().refine((v) => v === '' || /^\S+@\S+\.\S+$/.test(v), t('form.errEmail')),
    addressLine: z.string().trim().min(3, t('form.errAddress')),
    area: z.string().trim().min(2, t('form.errArea')),
    pincode: z.string().regex(/^\d{6}$/, t('form.errPincode')),
    zoneId: z.string().min(1, t('form.errZone')),
    membershipNo: z.string().refine((v) => v === '' || /^MSB-\d{4,6}$/i.test(v), t('form.errMembershipNo')),
  });
  type V = z.infer<typeof schema>;
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', dob: '', mobile: '', email: '', addressLine: '', area: '', pincode: '', zoneId: '', membershipNo: '' },
  });
  const submit = handleSubmit(async (v) => {
    try {
      const r = await createFamily.mutateAsync({
        head: { name: v.name, dob: v.dob, mobile: v.mobile, email: v.email || null },
        address: { addressLine: v.addressLine, area: v.area, pincode: v.pincode, zoneId: Number(v.zoneId) },
        membershipNo: v.membershipNo ? v.membershipNo.toUpperCase() : null,
      });
      toast.success(t('admin.created', { no: r.membershipNo ?? '' }));
      reset();
      onCreated(r.id);
    } catch (e) { toast.error((e as Error).message); }
  });
  return (
    <Modal
      open={open} onClose={onClose} title={t('admin.addFamily')} dismissible={!isSubmitting}
      footer={<><Button variant="ghost" onClick={onClose} disabled={isSubmitting}>{tc('actions.cancel')}</Button><Button loading={isSubmitting} onClick={submit}>{t('form.create')}</Button></>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-muted">{t('admin.addFamilyHint')}</p>
        <Input label={t('form.headName')} required error={errors.name?.message} {...register('name')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <DateInput label={t('form.dob')} required error={errors.dob?.message} {...register('dob')} />
          <PhoneInput label={t('form.mobile')} required error={errors.mobile?.message} {...register('mobile')} />
        </div>
        <Input label={t('form.email')} type="email" error={errors.email?.message} {...register('email')} />
        <Input label={t('form.address')} required error={errors.addressLine?.message} {...register('addressLine')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={t('form.area')} required error={errors.area?.message} {...register('area')} />
          <Input label={t('form.pincode')} required inputMode="numeric" maxLength={6} error={errors.pincode?.message} {...register('pincode')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label={t('form.zone')} required placeholder={t('form.select')} error={errors.zoneId?.message} options={(zones.data ?? []).map((z) => ({ value: z.id, label: z.name }))} {...register('zoneId')} />
          <Input label={t('form.membershipNo')} hint={t('form.membershipNoHint')} placeholder="MSB-0001" error={errors.membershipNo?.message} {...register('membershipNo')} />
        </div>
      </form>
    </Modal>
  );
}
