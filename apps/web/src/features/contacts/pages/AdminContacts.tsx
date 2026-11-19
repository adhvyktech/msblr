import { useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useT } from '@/lib/useT';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, IconButton, Input, Modal, PageHeader, Select, Skeleton } from '@/components/ui';
import { useContacts, useDeleteContact, useReorderContacts, useSaveContact, type Contact } from '../api';

const SECTIONS = ['EMERGENCY', 'SABHA', 'OTHER'];

export default function AdminContacts() {
  const { t } = useT('contacts');
  const q = useContacts();
  const save = useSaveContact(t('admin.saved'));
  const remove = useDeleteContact(t('admin.deleted'));
  const reorder = useReorderContacts();
  const [edit, setEdit] = useState<Contact | 'new' | null>(null);
  const [del, setDel] = useState<Contact | null>(null);
  const [f, setF] = useState({ section: 'SABHA', name: '', phone: '', details: '' });
  const open = (c: Contact | 'new') => {
    setEdit(c);
    setF(c === 'new' ? { section: 'SABHA', name: '', phone: '', details: '' } : { section: c.section, name: c.name, phone: c.phone, details: c.details ?? '' });
  };
  const phoneOk = /^[+\d][\d\s()-]{2,}$/.test(f.phone.trim());
  const valid = f.name.trim().length >= 2 && phoneOk;

  const move = (groupItems: Contact[], i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= groupItems.length) return;
    // keep the global order: re-send every id, swapping the two neighbours inside this section
    const all = q.data!.flatMap((g) => g.items.map((c) => c.id));
    const a = all.indexOf(groupItems[i]!.id);
    const b = all.indexOf(groupItems[j]!.id);
    [all[a], all[b]] = [all[b]!, all[a]!];
    reorder.mutate(all);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('admin.title')} subtitle={t('admin.subtitle')} actions={<Button icon={Plus} onClick={() => open('new')}>{t('admin.add')}</Button>} />
      {q.isLoading ? <Skeleton className="h-56" /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : q.data!.length === 0 ? <EmptyState title={t('emptyTitle')} description={t('emptyBody')} /> : q.data!.map((g) => (
        <section key={g.section} className="mb-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-muted">{t(`sections.${g.section}`, { defaultValue: g.section })}</h2>
          <Card padded={false}>
            <ul className="divide-y divide-line">
              {g.items.map((c, i) => (
                <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex flex-col">
                    <IconButton icon={ArrowUp} label={t('admin.moveUp')} size="sm" disabled={i === 0 || reorder.isPending} onClick={() => move(g.items, i, -1)} />
                    <IconButton icon={ArrowDown} label={t('admin.moveDown')} size="sm" disabled={i === g.items.length - 1 || reorder.isPending} onClick={() => move(g.items, i, 1)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{c.name}</div>
                    <div className="truncate text-sm text-muted">{c.phone}{c.details ? ` · ${c.details}` : ''}</div>
                  </div>
                  <Button size="sm" variant="outline" icon={Pencil} onClick={() => open(c)} aria-label={`${t('admin.edit')} ${c.name}`}>{t('admin.edit')}</Button>
                  <IconButton icon={Trash2} label={`${t('admin.delete')} ${c.name}`} className="text-danger" onClick={() => setDel(c)} />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}

      <Modal
        open={!!edit} onClose={() => setEdit(null)} title={edit === 'new' ? t('admin.add') : t('admin.edit')}
        footer={<>
          <Button variant="ghost" onClick={() => setEdit(null)}>{t('admin.cancel')}</Button>
          <Button disabled={!valid} loading={save.isPending}
            onClick={() => save.mutate({ id: edit && edit !== 'new' ? edit.id : undefined, data: { section: f.section, name: f.name.trim(), phone: f.phone.trim(), details: f.details.trim() || null } }, { onSuccess: () => setEdit(null) })}>{t('admin.save')}</Button>
        </>}
      >
        <div className="grid gap-4">
          <Select label={t('admin.section')} value={SECTIONS.includes(f.section) ? f.section : 'OTHER'} onChange={(e) => setF({ ...f, section: e.target.value })} options={SECTIONS.map((s) => ({ value: s, label: t(`sections.${s}`) }))} />
          <Input label={t('admin.name')} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input label={t('admin.phone')} required type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} error={f.phone && !phoneOk ? t('admin.phoneError') : undefined} />
          <Input label={t('admin.details')} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} hint={t('admin.detailsHint')} />
        </div>
      </Modal>
      <ConfirmDialog
        open={!!del} onClose={() => setDel(null)} danger loading={remove.isPending} title={t('admin.deleteTitle')} message={t('admin.deleteBody', { name: del?.name ?? '' })}
        confirmLabel={t('admin.delete')} onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })}
      />
    </div>
  );
}
