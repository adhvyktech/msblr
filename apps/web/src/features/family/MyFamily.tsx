import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { KeyRound, Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import {
  Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, IconButton, PageHeader, Skeleton, useToast,
} from '@/components/ui';
import { fmtDate, formatMobile } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { useFamilyMutations, useMyFamily, type FamilyPerson } from './api';
import { PersonFormModal, emptyPerson, personPayload, relationKey, type PersonValues } from './PersonForm';

const toValues = (p: FamilyPerson): PersonValues => ({
  name: p.name, relation: p.relation, gender: p.gender ?? '', dob: p.dob ?? '', anniversary: p.anniversary ?? '', mobile: p.mobile ?? '',
  email: p.email ?? '', education: p.education ?? '', occupation: p.occupation ?? '',
  photo: p.photoFileId && p.photoUrl ? { id: p.photoFileId, url: p.photoUrl } : null,
});

export default function MyFamily() {
  const { t } = useTranslation('family');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const { reloadMe } = useAuth();
  const q = useMyFamily();
  const m = useFamilyMutations();
  const [editing, setEditing] = useState<FamilyPerson | 'new' | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'withdraw' | 'remove'; p: FamilyPerson } | null>(null);
  const initial = useMemo(() => (editing && editing !== 'new' ? toValues(editing) : emptyPerson()), [editing]);

  if (q.isLoading) return <div className="mx-auto max-w-2xl space-y-3"><Skeleton className="h-10 w-48" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>;
  if (q.isError || !q.data) return <ErrorState onRetry={() => void q.refetch()} />;
  const { persons, canEdit, family } = q.data;

  const save = async (v: PersonValues) => {
    if (editing === 'new') {
      await m.add.mutateAsync(personPayload(v));
      toast.success(t('toast.added'));
    } else if (editing) {
      await m.update.mutateAsync({ id: editing.id, body: personPayload(v, { isHead: editing.isHead }) });
      toast.success(t('toast.updated'));
      if (editing.isHead) void reloadMe();
    }
    setEditing(null);
  };
  const request = async (p: FamilyPerson) => {
    try { await m.requestLogin.mutateAsync(p.id); toast.success(t('toast.requested', { name: p.name })); } catch (e) { toast.error((e as Error).message); }
  };
  const doConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === 'withdraw') { await m.withdrawLogin.mutateAsync(confirm.p.id); toast.success(t('toast.withdrawn')); }
      else { await m.remove.mutateAsync(confirm.p.id); toast.success(t('toast.removed')); }
      setConfirm(null);
      setEditing(null);
    } catch (e) { toast.error((e as Error).message); setConfirm(null); }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={t('title')}
        subtitle={family.membershipNo ? `${family.membershipNo}${family.zone ? ` · ${family.zone}` : ''}` : undefined}
        actions={canEdit ? <Button icon={Plus} onClick={() => setEditing('new')}>{t('addMember')}</Button> : null}
      />
      <Card tone="accent-soft" className="mb-4 flex items-start gap-3">
        <ShieldCheck size={22} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <p className="text-[15px]">{canEdit ? t('headNote') : t('viewerNote')}</p>
      </Card>

      {persons.length === 0 ? <EmptyState icon={Users} /> : (
        <ul className="space-y-3">
          {persons.map((p) => (
            <li key={p.id}>
              <Card className="!p-3.5">
                <div className="flex items-start gap-3">
                  <Avatar name={p.name} src={p.photoUrl} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-sm text-muted">
                      {p.isHead ? t('headYou') : t(relationKey(p.relation))}
                      {p.mobile ? ` · ${formatMobile(p.mobile)}` : ''}
                      {p.dob ? ` · ${fmtDate(p.dob)}` : ''}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {p.loginStatus === 'ACTIVE' ? <Badge tone="success">{p.isHead ? t('status.active') : t('status.activeViewOnly')}</Badge> : null}
                      {p.loginStatus === 'REQUESTED' ? <Badge tone="warning">{t('status.requested')}</Badge> : null}
                      {p.loginStatus === 'NONE' ? <Badge tone="neutral">{t('status.none')}</Badge> : null}
                    </div>
                    {p.loginStatus === 'NONE' && p.activationRemarks ? <p className="mt-1.5 text-sm text-danger">{t('rejectedNote', { remarks: p.activationRemarks })}</p> : null}
                  </div>
                  {canEdit ? <div className="flex shrink-0"><IconButton icon={Pencil} label={t('editMember', { name: p.name })} onClick={() => setEditing(p)} />{p.isHead ? null : <IconButton icon={Trash2} label={t('removeMember', { name: p.name })} className="text-danger" onClick={() => setConfirm({ kind: 'remove', p })} />}</div> : null}
                </div>
                {canEdit && !p.isHead ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    {p.loginStatus === 'NONE' ? (
                      p.mobile
                        ? <Button size="sm" variant="outline" icon={KeyRound} loading={m.requestLogin.isPending && m.requestLogin.variables === p.id} onClick={() => void request(p)}>{t('activate', { name: p.name.split(' ')[0] })}</Button>
                        : <p className="flex items-center gap-1.5 text-sm text-muted"><Lock size={14} aria-hidden />{t('needMobile')}</p>
                    ) : null}
                    {p.loginStatus === 'REQUESTED' ? <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'withdraw', p })}>{t('cancelRequest')}</Button> : null}
                    {p.loginStatus === 'ACTIVE' ? <Button size="sm" variant="ghost" className="!text-primary" onClick={() => setConfirm({ kind: 'withdraw', p })}>{t('withdraw')}</Button> : null}
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {canEdit ? <p className="mt-4 text-sm text-muted">{t('privacyHint')} <Link to="/me/privacy" className="font-semibold text-primary underline">{t('privacyLink')}</Link></p> : null}

      <PersonFormModal
        open={editing !== null} onClose={() => setEditing(null)} initial={initial} onSubmit={save}
        title={editing === 'new' ? t('form.addTitle') : t('form.editTitle')} isHead={editing !== null && editing !== 'new' && editing.isHead}
      />
      <ConfirmDialog
        open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => void doConfirm()} danger
        loading={m.withdrawLogin.isPending || m.remove.isPending}
        title={confirm?.kind === 'remove' ? t('confirm.removeTitle') : t('confirm.withdrawTitle')}
        message={confirm?.kind === 'remove' ? t('confirm.removeBody', { name: confirm.p.name }) : confirm ? t('confirm.withdrawBody', { name: confirm.p.name }) : null}
        confirmLabel={confirm?.kind === 'remove' ? tc('actions.delete') : t('confirm.withdrawYes')}
      />
    </div>
  );
}
