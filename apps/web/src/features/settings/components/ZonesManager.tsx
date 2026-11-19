import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, ErrorState, IconButton, Input, Skeleton, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/useT';
import { useZoneList, fieldError, type Zone } from '../api';

function ZoneRow({ zone, onDelete }: { zone: Zone; onDelete: (z: Zone) => void }) {
  const { t, tc } = useT('settings');
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(zone.name);
  const m = useMutation({
    mutationFn: () => api.patch(`/api/settings/zones/${zone.id}`, { name }),
    onSuccess: () => { toast.success(t('saved')); void qc.invalidateQueries({ queryKey: ['settings', 'zones'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const used = zone.families + zone.events + zone.staff;
  return (
    <li className="flex flex-wrap items-end gap-2 py-3">
      <Input label={t('zones.name')} wrapperClassName="min-w-[200px] flex-1" value={name} onChange={(e) => setName(e.target.value)} error={fieldError(m.error, 'name')} />
      <span className="pb-3 text-sm text-muted">{t('zones.usage', { families: zone.families, events: zone.events })}</span>
      <Button variant="outline" disabled={!name.trim() || name === zone.name} loading={m.isPending} onClick={() => m.mutate()}>{tc('actions.save')}</Button>
      <IconButton icon={Trash2} label={t('zones.delete', { name: zone.name })} disabled={used > 0} title={used > 0 ? t('zones.inUse') : undefined} onClick={() => onDelete(zone)} className="text-danger" />
    </li>
  );
}

export function ZonesManager() {
  const { t } = useT('settings');
  const toast = useToast();
  const qc = useQueryClient();
  const zones = useZoneList();
  const [name, setName] = useState('');
  const [del, setDel] = useState<Zone | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['settings', 'zones'] });
  const add = useMutation({
    mutationFn: () => api.post('/api/settings/zones', { name }),
    onSuccess: () => { toast.success(t('zones.added')); setName(''); void refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (z: Zone) => api.delete(`/api/settings/zones/${z.id}`),
    onSuccess: () => { toast.success(t('zones.deleted')); setDel(null); void refresh(); },
    onError: (e: Error) => { toast.error(e.message); setDel(null); },
  });

  if (zones.isError) return <ErrorState onRetry={() => void zones.refetch()} />;
  if (zones.isLoading) return <Skeleton className="h-40" />;
  return (
    <div>
      <ul className="divide-y divide-line">{(zones.data ?? []).map((z) => <ZoneRow key={`${z.id}-${z.name}`} zone={z} onDelete={setDel} />)}</ul>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(); }}>
        <Input label={t('zones.newName')} wrapperClassName="min-w-[200px] flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('zones.placeholder')} error={fieldError(add.error, 'name')} />
        <Button type="submit" icon={Plus} loading={add.isPending} disabled={!name.trim()}>{t('zones.add')}</Button>
      </form>
      <ConfirmDialog
        open={!!del} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del)} loading={remove.isPending} danger
        title={t('zones.deleteTitle')} message={del ? t('zones.deleteMsg', { name: del.name }) : null}
      />
    </div>
  );
}
