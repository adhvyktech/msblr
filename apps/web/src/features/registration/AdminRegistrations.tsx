import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ExternalLink, FileText, X } from 'lucide-react';
import {
  Avatar, Button, Card, ConfirmDialog, Drawer, ErrorState, ImageWithFallback, Modal, PageHeader, Pagination, StatusBadge, Table, Tabs, Textarea, useToast, type Column,
} from '@/components/ui';
import { fileSrc } from '@/lib/api';
import { fmtDate, fmtDateTime, formatMobile } from '@/lib/format';
import { relationKey } from '@/features/family/PersonForm';
import { useRegistrationDecision, useRegistrations, type Registration } from './api';

export default function AdminRegistrations() {
  const { t } = useTranslation('registration');
  const { t: tf } = useTranslation('family');
  const toast = useToast();
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [page, setPage] = useState(1);
  const q = useRegistrations(status, page);
  const d = useRegistrationDecision();
  const [open, setOpen] = useState<Registration | null>(null);
  const [approve, setApprove] = useState<Registration | null>(null);
  const [reject, setReject] = useState<Registration | null>(null);
  const [remarks, setRemarks] = useState('');
  const [remarksErr, setRemarksErr] = useState('');
  const counts = q.data?.counts ?? {};

  const doApprove = async () => {
    if (!approve) return;
    try {
      const r = await d.approve.mutateAsync(approve.id);
      toast.success(t('admin.approved', { no: r.membershipNo }));
      setOpen(null);
    } catch (e) { toast.error((e as Error).message); }
    setApprove(null);
  };
  const doReject = async () => {
    if (!reject) return;
    if (remarks.trim().length < 2) { setRemarksErr(t('admin.remarksRequired')); return; }
    try {
      await d.reject.mutateAsync({ id: reject.id, remarks: remarks.trim() });
      toast.success(t('admin.rejected'));
      setOpen(null);
    } catch (e) { toast.error((e as Error).message); }
    setReject(null);
  };

  const head = (r: Registration) => r.family.persons.find((p) => p.isHead);
  const columns: Column<Registration>[] = [
    { key: 'id', header: '#', render: (r) => r.id },
    { key: 'head', header: t('admin.applicant'), render: (r) => <div><p className="font-semibold">{r.headName}</p><p className="text-sm text-muted">{formatMobile(head(r)?.mobile)}</p></div> },
    { key: 'zone', header: t('admin.zone'), hideOnMobile: true, render: (r) => <div><p>{r.family.zone ?? '—'}</p><p className="text-sm text-muted">{r.family.area ?? ''}</p></div> },
    { key: 'members', header: t('admin.members'), hideOnMobile: true, align: 'center', render: (r) => r.family.persons.length },
    { key: 'date', header: t('admin.submitted'), hideOnMobile: true, render: (r) => fmtDate(r.submittedAt) },
    { key: 'status', header: t('admin.status'), render: (r) => <StatusBadge status={r.status} /> },
    { key: 'view', header: '', align: 'right', render: (r) => <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setOpen(r); }}>{t('admin.review')}</Button> },
  ];
  const cur = open ? (q.data?.data.find((r) => r.id === open.id) ?? open) : null;

  return (
    <div>
      <PageHeader title={t('admin.title')} subtitle={t('admin.subtitle')} />
      <Tabs
        className="mb-4" label={t('admin.title')} value={status} onChange={(v) => { setStatus(v as typeof status); setPage(1); }}
        items={[
          { id: 'PENDING', label: t('admin.tabPending'), count: counts.PENDING },
          { id: 'APPROVED', label: t('admin.tabApproved'), count: counts.APPROVED },
          { id: 'REJECTED', label: t('admin.tabRejected'), count: counts.REJECTED },
        ]}
      />
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : (
        <>
          <Table columns={columns} rows={q.data?.data ?? []} rowKey={(r) => r.id} loading={q.isLoading} onRowClick={setOpen} emptyText={t('admin.empty')} caption={t('admin.title')} />
          <Pagination className="mt-4" page={page} pageSize={q.data?.pageSize ?? 20} total={q.data?.total ?? 0} onPage={setPage} />
        </>
      )}

      <Drawer open={!!cur} onClose={() => setOpen(null)} side="right" width={560} title={cur ? `${t('admin.registration')} #${cur.id}` : ''}>
        {cur ? (
          <div className="space-y-5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-lg font-semibold">{cur.headName}</p><p className="text-sm text-muted">{t('admin.submittedOn', { date: fmtDateTime(cur.submittedAt) })}</p></div>
              <StatusBadge status={cur.status} />
            </div>
            {cur.status !== 'PENDING' ? (
              <Card tone="accent-soft" className="!p-3 text-sm">
                {cur.status === 'APPROVED' ? <p>{t('admin.approvedAs', { no: cur.family.membershipNo ?? '' })}</p> : <p><b>{t('admin.remarks')}:</b> {cur.remarks}</p>}
                <p className="text-muted">{fmtDateTime(cur.decidedAt)}</p>
              </Card>
            ) : null}
            <section>
              <h3 className="mb-2 text-base">{t('admin.address')}</h3>
              <p>{[cur.family.addressLine, cur.family.area, cur.family.city, cur.family.pincode].filter(Boolean).join(', ')}</p>
              <p className="text-sm text-muted">{cur.family.zone}</p>
            </section>
            <section>
              <h3 className="mb-2 text-base">{t('admin.persons')}</h3>
              <ul className="space-y-2">
                {cur.family.persons.map((p) => (
                  <li key={p.id} className="flex items-start gap-3 rounded-theme-sm border border-line p-3">
                    <Avatar name={p.name} src={p.photoUrl} size={44} />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="text-base font-semibold">{p.name}</p>
                      <p className="text-muted">{p.isHead ? t('admin.head') : tf(relationKey(p.relation))}{p.dob ? ` · ${fmtDate(p.dob)}` : ''}{p.anniversary ? ` · ${t('admin.anniv')} ${fmtDate(p.anniversary)}` : ''}</p>
                      <p>{[p.mobile ? formatMobile(p.mobile) : '', p.email, p.occupation, p.education].filter(Boolean).join(' · ')}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="mb-2 text-base">{t('admin.documents')}</h3>
              {cur.documents.length === 0 ? <p className="text-muted">{t('admin.noDocs')}</p> : (
                <ul className="grid grid-cols-2 gap-3">
                  {cur.documents.map((doc, i) => (
                    <li key={doc.fileId}>
                      <a href={fileSrc(doc.url)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-theme-sm border border-line hover:border-primary">
                        {doc.mime.startsWith('image/')
                          ? <ImageWithFallback src={doc.url} alt={t('admin.docN', { n: i + 1 })} className="h-28 w-full object-cover" />
                          : <div className="grid h-28 place-items-center bg-accent-soft text-accent"><FileText size={30} aria-hidden /></div>}
                        <span className="flex items-center justify-between gap-1 px-2 py-1.5 text-sm font-medium">{doc.originalName ?? t('admin.docN', { n: i + 1 })}<ExternalLink size={14} aria-hidden /></span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {cur.status === 'PENDING' ? (
              <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-line bg-surface px-4 py-3">
                <Button className="flex-1" variant="success" icon={Check} onClick={() => setApprove(cur)}>{t('admin.approve')}</Button>
                <Button className="flex-1" variant="danger" icon={X} onClick={() => { setRemarks(''); setRemarksErr(''); setReject(cur); }}>{t('admin.reject')}</Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={!!approve} onClose={() => setApprove(null)} onConfirm={() => void doApprove()} loading={d.approve.isPending}
        title={t('admin.approveTitle')} message={approve ? t('admin.approveBody', { name: approve.headName ?? '' }) : null} confirmLabel={t('admin.approve')}
      />
      <Modal
        open={!!reject} onClose={() => setReject(null)} title={t('admin.rejectTitle')} size="sm"
        footer={<><Button variant="ghost" onClick={() => setReject(null)}>{t('back')}</Button><Button variant="danger" loading={d.reject.isPending} onClick={() => void doReject()}>{t('admin.reject')}</Button></>}
      >
        <p className="mb-3 text-muted">{t('admin.rejectBody', { name: reject?.headName ?? '' })}</p>
        <Textarea label={t('admin.remarks')} required rows={3} value={remarks} error={remarksErr} onChange={(e) => { setRemarks(e.target.value); setRemarksErr(''); }} data-autofocus />
      </Modal>
    </div>
  );
}
