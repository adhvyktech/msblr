import { useState } from 'react';
import { ErrorState, FileUpload, Input, PageHeader, Skeleton, Textarea, Toggle } from '@/components/ui';
import { useT } from '@/lib/useT';
import { fileSrc } from '@/lib/api';
import { fieldError, useSaveSetting, useSettings, type SettingsData } from '../api';
import { SettingCard } from '../components/SettingCard';
import { ThemePicker } from '../components/ThemePicker';
import { ZonesManager } from '../components/ZonesManager';
import { PublicSiteSettings } from '../components/PublicSiteSettings';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function Sabha({ value }: { value: SettingsData['sabha'] }) {
  const { t } = useT('settings');
  const [v, setV] = useState(value);
  const m = useSaveSetting('sabha');
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  return (
    <SettingCard id="sabha" title={t('sabha.title')} description={t('sabha.desc')} onSave={() => m.mutate(v)} saving={m.isPending} dirty={!same(v, value)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t('sabha.name')} required value={v.name} onChange={set('name')} error={fieldError(m.error, 'name')} />
        <Input label={t('sabha.nameHi')} lang="hi" value={v.nameHi} onChange={set('nameHi')} error={fieldError(m.error, 'nameHi')} />
        <Input label={t('sabha.phone')} value={v.phone} onChange={set('phone')} error={fieldError(m.error, 'phone')} />
        <Input label={t('sabha.email')} type="email" value={v.email} onChange={set('email')} error={fieldError(m.error, 'email')} />
      </div>
      <Textarea label={t('sabha.address')} rows={2} value={v.address} onChange={set('address')} error={fieldError(m.error, 'address')} />
    </SettingCard>
  );
}

function Upi({ value }: { value: SettingsData['upi'] }) {
  const { t } = useT('settings');
  const [v, setV] = useState(value);
  const [qr, setQr] = useState<{ id: number; url: string } | null>(value.qrFileId ? { id: value.qrFileId, url: fileSrc(`/files/${value.qrFileId}`) ?? `/files/${value.qrFileId}` } : null);
  const m = useSaveSetting('upi');
  return (
    <SettingCard id="upi" title={t('upi.title')} description={t('upi.desc')} onSave={() => m.mutate({ ...v, qrFileId: qr?.id ?? null })} saving={m.isPending} dirty={!same({ ...v, qrFileId: qr?.id ?? null }, value)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t('upi.id')} required value={v.id} placeholder="name@bank" onChange={(e) => setV({ ...v, id: e.target.value })} error={fieldError(m.error, 'id')} />
        <Input label={t('upi.payee')} required value={v.payeeName} onChange={(e) => setV({ ...v, payeeName: e.target.value })} error={fieldError(m.error, 'payeeName')} />
      </div>
      <FileUpload kind="logo" visibility="PUBLIC" label={t('upi.qr')} hint={t('upi.qrHint')} value={qr} onChange={setQr} accept="image/jpeg,image/png,image/webp" maxMb={5} />
    </SettingCard>
  );
}

function Subscription({ value }: { value: SettingsData['subscription'] }) {
  const { t } = useT('settings');
  const [amount, setAmount] = useState(String(value.amount));
  const m = useSaveSetting('subscription');
  return (
    <SettingCard id="subscription" title={t('subscription.title')} description={t('subscription.desc')} onSave={() => m.mutate({ ...value, amount: Number(amount) })} saving={m.isPending} dirty={Number(amount) !== value.amount}>
      <Input label={t('subscription.amount')} type="number" min={1} inputMode="numeric" wrapperClassName="max-w-xs" value={amount} onChange={(e) => setAmount(e.target.value)} error={fieldError(m.error, 'amount')} />
    </SettingCard>
  );
}

function Security({ value }: { value: number }) {
  const { t } = useT('settings');
  const [days, setDays] = useState(String(value));
  const m = useSaveSetting('trustedDeviceDays');
  return (
    <SettingCard id="security" title={t('security.title')} description={t('security.desc')} onSave={() => m.mutate(Number(days))} saving={m.isPending} dirty={Number(days) !== value}>
      <Input label={t('security.days')} type="number" min={1} max={365} inputMode="numeric" wrapperClassName="max-w-xs" value={days} onChange={(e) => setDays(e.target.value)} error={fieldError(m.error)} hint={t('security.hint')} />
    </SettingCard>
  );
}

function Businesses({ value }: { value: boolean }) {
  const { t } = useT('settings');
  const m = useSaveSetting('businessApprovalRequired');
  return (
    <SettingCard id="businesses" title={t('business.title')}>
      <Toggle checked={value} disabled={m.isPending} onChange={(c) => m.mutate(c)} label={t('business.toggle')} description={t('business.desc')} />
    </SettingCard>
  );
}

function Staleness({ value }: { value: number }) {
  const { t } = useT('settings');
  const [days, setDays] = useState(String(value));
  const m = useSaveSetting('contentStaleDays');
  return (
    <SettingCard id="content" title={t('stale.title')} description={t('stale.desc')} onSave={() => m.mutate(Number(days))} saving={m.isPending} dirty={Number(days) !== value}>
      <Input label={t('stale.days')} type="number" min={1} max={365} inputMode="numeric" wrapperClassName="max-w-xs" value={days} onChange={(e) => setDays(e.target.value)} error={fieldError(m.error)} />
    </SettingCard>
  );
}

function Wishes({ value }: { value: SettingsData['wishTemplates'] }) {
  const { t } = useT('settings');
  const [v, setV] = useState(value);
  const m = useSaveSetting('wishTemplates');
  const upd = (kind: 'birthday' | 'anniversary', lang: 'en' | 'hi') => (e: { target: { value: string } }) => setV({ ...v, [kind]: { ...v[kind], [lang]: e.target.value } });
  return (
    <SettingCard id="wishes" title={t('wishes.title')} description={t('wishes.desc')} onSave={() => m.mutate(v)} saving={m.isPending} dirty={!same(v, value)}>
      {(['birthday', 'anniversary'] as const).map((k) => (
        <div key={k} className="grid gap-4 sm:grid-cols-2">
          <Textarea label={`${t(`wishes.${k}`)} (English)`} rows={3} value={v[k].en} onChange={upd(k, 'en')} error={fieldError(m.error, `${k}.en`)} hint={t('wishes.hint')} />
          <Textarea label={`${t(`wishes.${k}`)} (हिन्दी)`} lang="hi" rows={3} value={v[k].hi} onChange={upd(k, 'hi')} error={fieldError(m.error, `${k}.hi`)} hint={t('wishes.hint')} />
        </div>
      ))}
    </SettingCard>
  );
}

function Receipt({ value }: { value: string }) {
  const { t } = useT('settings');
  const [p, setP] = useState(value);
  const m = useSaveSetting('receiptPrefix');
  return (
    <SettingCard id="receipt" title={t('receipt.title')} description={t('receipt.desc')} onSave={() => m.mutate(p)} saving={m.isPending} dirty={p !== value}>
      <Input label={t('receipt.prefix')} maxLength={8} wrapperClassName="max-w-xs" value={p} onChange={(e) => setP(e.target.value)} error={fieldError(m.error)} hint={t('receipt.example', { prefix: p || 'R' })} />
    </SettingCard>
  );
}

export default function Settings() {
  const { t } = useT('settings');
  const q = useSettings();
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  if (q.isLoading || !q.data) return (<div><PageHeader title={t('title')} /><Skeleton className="h-48" /><Skeleton className="mt-4 h-48" /></div>);
  const s = q.data;
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader title={t('title')} subtitle={t('subtitle')} className="mb-0" />
      <SettingCard id="appearance" title={t('appearance.title')} description={t('appearance.desc')}><ThemePicker value={s.theme} /></SettingCard>
      <Sabha value={s.sabha} />
      <PublicSiteSettings value={s.publicSite} />
      <Upi value={s.upi} />
      <Subscription value={s.subscription} />
      <Receipt value={s.receiptPrefix} />
      <Security value={s.trustedDeviceDays} />
      <Businesses value={s.businessApprovalRequired} />
      <Staleness value={s.contentStaleDays} />
      <Wishes value={s.wishTemplates} />
      <SettingCard id="zones" title={t('zones.title')} description={t('zones.desc')}><ZonesManager /></SettingCard>
    </div>
  );
}
