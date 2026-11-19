import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AtSign, Briefcase, Cake, Heart, Image as ImageIcon, MapPin, MessageCircle, Phone, type LucideIcon } from 'lucide-react';
import { Card, ChipGroup, ErrorState, PageHeader, Skeleton, Toggle, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useMyFamily, type PrivacyMap } from '@/features/family/api';

const FIELDS: { key: keyof PrivacyMap; icon: LucideIcon }[] = [
  { key: 'mobile', icon: Phone },
  { key: 'whatsapp', icon: MessageCircle },
  { key: 'address', icon: MapPin },
  { key: 'email', icon: AtSign },
  { key: 'photo', icon: ImageIcon },
  { key: 'dob', icon: Cake },
  { key: 'anniversary', icon: Heart },
  { key: 'business', icon: Briefcase },
];

export default function Privacy() {
  const { t } = useTranslation('privacy');
  const toast = useToast();
  const qc = useQueryClient();
  const q = useMyFamily();
  const [personId, setPersonId] = useState<number | null>(null);
  const save = useMutation({
    mutationFn: ({ id, field, visible }: { id: number; field: string; visible: boolean }) => api.put(`/api/family/privacy/${id}`, { fields: { [field]: visible } }),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['family'] }); void qc.invalidateQueries({ queryKey: ['members'] }); },
  });

  useEffect(() => {
    if (q.data && personId === null) setPersonId(q.data.myPersonId ?? q.data.persons[0]?.id ?? null);
  }, [q.data, personId]);

  if (q.isLoading) return <div className="mx-auto max-w-xl space-y-3"><Skeleton className="h-10 w-56" /><Skeleton className="h-12" /><Skeleton className="h-72" /></div>;
  if (q.isError || !q.data) return <ErrorState onRetry={() => void q.refetch()} />;
  const { persons, canEdit } = q.data;
  const person = persons.find((p) => p.id === personId) ?? persons[0];
  if (!person) return <ErrorState />;

  const change = (field: keyof PrivacyMap, visible: boolean) => {
    // optimistic update, rolled back by the refetch if the request fails
    qc.setQueryData(['family', 'mine'], (old: typeof q.data) =>
      old ? { ...old, persons: old.persons.map((p) => (p.id === person.id ? { ...p, privacy: { ...p.privacy, [field]: visible } } : p)) } : old);
    save.mutate({ id: person.id, field, visible }, {
      onSuccess: () => toast.success(t('saved')),
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="-mx-1 mb-4 overflow-x-auto px-1 pb-1">
        <ChipGroup
          label={t('whose')} value={person.id} onChange={setPersonId}
          options={persons.map((p) => ({ value: p.id, label: p.id === q.data.myPersonId ? t('you', { name: p.name.split(' ')[0] }) : p.name.split(' ')[0]! }))}
        />
      </div>
      <p className="mb-3 text-muted">{canEdit ? t('choose', { name: person.name.split(' ')[0] }) : t('readOnly', { name: person.name.split(' ')[0] })}</p>
      <Card padded={false} className="mb-4">
        <ul className="divide-y divide-line">
          {FIELDS.map(({ key, icon: Icon }) => {
            const on = person.privacy[key];
            return (
              <li key={key} className="flex items-center gap-3 px-4 py-2">
                <Icon size={20} className="shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <Toggle
                    checked={on} disabled={!canEdit || save.isPending} onChange={(v) => change(key, v)}
                    label={<span className="font-semibold">{t(`fields.${key}`)}</span>}
                    description={<span aria-live="polite">{on ? t('visible') : t('hidden')}</span>}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
      <p className="text-sm text-muted">{t('officeNote')}</p>
    </div>
  );
}
