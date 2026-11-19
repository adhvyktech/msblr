import { useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { Button, FileUpload, IconButton, Input, Textarea, Toggle } from '@/components/ui';
import { fileSrc } from '@/lib/api';
import { useT } from '@/lib/useT';
import { fieldError, useSaveSetting, type SettingsData } from '../api';
import { SettingCard } from './SettingCard';

type Site = SettingsData['publicSite'];
type Member = Site['committee'][number];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function PublicSiteSettings({ value }: { value: Site }) {
  const { t } = useT('settings');
  const [v, setV] = useState<Site>(value);
  const m = useSaveSetting('publicSite');
  const setMember = (i: number, patch: Partial<Member>) => setV({ ...v, committee: v.committee.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const move = (i: number, d: -1 | 1) => {
    const list = [...v.committee];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    setV({ ...v, committee: list });
  };
  const save = () => m.mutate({
    ...v,
    mapsUrl: v.mapsUrl?.trim() ?? '',
    committee: v.committee.map((c) => ({ name: c.name.trim(), role: c.role.trim(), roleHi: c.roleHi?.trim() || undefined, photoFileId: c.photoFileId ?? null })),
  });
  return (
    <SettingCard id="public-site" title={t('publicSite.title')} description={t('publicSite.desc')} onSave={save} saving={m.isPending} dirty={!same(v, value)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Textarea label={`${t('publicSite.about')} (English)`} rows={6} value={v.about.en} onChange={(e) => setV({ ...v, about: { ...v.about, en: e.target.value } })} error={fieldError(m.error, 'about.en')} />
        <Textarea label={`${t('publicSite.about')} (हिन्दी)`} lang="hi" rows={6} value={v.about.hi} onChange={(e) => setV({ ...v, about: { ...v.about, hi: e.target.value } })} error={fieldError(m.error, 'about.hi')} />
      </div>

      <div>
        <h3 className="text-base">{t('publicSite.committee')}</h3>
        <p className="mb-3 text-sm text-muted">{t('publicSite.committeeHint')}</p>
        <ul className="space-y-3">
          {v.committee.map((c, i) => (
            <li key={i} className="rounded-theme border border-line p-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Input label={t('publicSite.name')} required value={c.name} onChange={(e) => setMember(i, { name: e.target.value })} error={fieldError(m.error, `committee.${i}.name`)} />
                <Input label={t('publicSite.role')} required value={c.role} onChange={(e) => setMember(i, { role: e.target.value })} error={fieldError(m.error, `committee.${i}.role`)} />
                <Input label={t('publicSite.roleHi')} lang="hi" value={c.roleHi ?? ''} onChange={(e) => setMember(i, { roleHi: e.target.value })} />
              </div>
              <FileUpload
                className="mt-3" kind="photo" visibility="PUBLIC" label={t('publicSite.photo')} hint={t('publicSite.photoHint')}
                accept="image/jpeg,image/png,image/webp" maxMb={5}
                value={c.photoFileId ? { id: c.photoFileId, url: fileSrc(`/files/${c.photoFileId}`) ?? `/files/${c.photoFileId}` } : null}
                onChange={(f) => setMember(i, { photoFileId: f?.id ?? null })}
              />
              <div className="mt-2 flex items-center justify-end gap-1">
                <IconButton icon={ArrowUp} label={t('publicSite.up')} disabled={i === 0} onClick={() => move(i, -1)} />
                <IconButton icon={ArrowDown} label={t('publicSite.down')} disabled={i === v.committee.length - 1} onClick={() => move(i, 1)} />
                <IconButton icon={Trash2} label={t('publicSite.remove')} onClick={() => setV({ ...v, committee: v.committee.filter((_, j) => j !== i) })} />
              </div>
            </li>
          ))}
        </ul>
        <Button className="mt-3" variant="outline" icon={Plus} onClick={() => setV({ ...v, committee: [...v.committee, { name: '', role: '', roleHi: '', photoFileId: null }] })}>{t('publicSite.add')}</Button>
      </div>

      <Toggle checked={v.showHighlightPhotos} onChange={(c) => setV({ ...v, showHighlightPhotos: c })} label={t('publicSite.showPhotos')} description={t('publicSite.showPhotosHint')} />

      <Input label={t('publicSite.maps')} type="url" placeholder="https://maps.google.com/…" value={v.mapsUrl ?? ''} onChange={(e) => setV({ ...v, mapsUrl: e.target.value })} error={fieldError(m.error, 'mapsUrl')} hint={t('publicSite.mapsHint')} />

      <a href="/" target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center gap-2 font-semibold text-primary">
        <ExternalLink size={16} aria-hidden />{t('publicSite.view')}
      </a>
    </SettingCard>
  );
}
