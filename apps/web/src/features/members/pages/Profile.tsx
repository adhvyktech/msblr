import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Briefcase, Cake, Heart, Mail, MapPin, MessageCircle, Navigation, Phone, Tag, type LucideIcon } from 'lucide-react';
import { Avatar, Badge, Card, ErrorState, LockedField, Section, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { fmtDate, formatMobile, whatsappLink } from '@/lib/format';
import { useLang } from '../useLang';
import { relationKey } from '@/features/family/PersonForm';
import { ActionLink } from '../ActionLink';
import { useFamilyDetail } from '../api';

function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-0">
      <Icon size={19} className="mt-0.5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1"><p className="text-xs text-muted">{label}</p><div className="break-words text-[15px] font-medium">{children}</div></div>
    </li>
  );
}

export default function Profile() {
  const { t } = useTranslation('members');
  const { t: tf } = useTranslation('family');
  const lang = useLang();
  const id = Number(useParams().familyId);
  const q = useFamilyDetail(id);
  const [pid, setPid] = useState<number | null>(null);

  if (q.isLoading) return <div className="mx-auto max-w-2xl space-y-4"><Skeleton className="h-44" /><Skeleton className="h-60" /></div>;
  if (q.isError || !q.data) return <div className="mx-auto max-w-2xl"><ErrorState title={t('profile.notFound')} description={t('profile.notFoundBody')} onRetry={() => void q.refetch()} /></div>;
  const { family, persons, businesses } = q.data;
  const p = persons.find((x) => x.id === pid) ?? persons.find((x) => x.isHead) ?? persons[0];
  if (!p) return <ErrorState />;
  const locked = (f: string) => p.hidden.includes(f);
  const field = (f: string, value: string | null | undefined, render?: (v: string) => ReactNode) =>
    locked(f) ? <LockedField /> : value ? (render ? render(value) : value) : <span className="text-muted">—</span>;
  const mapsUrl = p.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}` : null;

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/members" className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-primary"><ArrowLeft size={18} aria-hidden />{t('profile.back')}</Link>
      <Card className="relative overflow-hidden !p-0">
        <div className="h-20 bg-primary" aria-hidden />
        <div className="-mt-10 px-4 pb-5 sm:px-6">
          <div className="flex items-end gap-4">
            <Avatar name={p.name} src={p.photoUrl} size={80} className="ring-4 ring-surface" />
            <div className="min-w-0 pb-1">
              <h1 className="truncate text-xl sm:text-2xl">{p.name}</h1>
              <p className="text-sm text-muted">{family.membershipNo} · {p.isHead ? t('profile.head') : tf(relationKey(p.relation))}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {family.status === 'ACTIVE' ? <Badge tone="success">{t('profile.active')}</Badge> : <Badge tone="warning">{family.status}</Badge>}
            {family.zone ? <Badge tone="accent" icon={<Tag size={11} aria-hidden />}>{family.zone}</Badge> : null}
            {family.isOwn ? <Badge tone="info">{t('profile.you')}</Badge> : null}
          </div>
          <div className="mt-4 flex gap-2">
            {p.mobile ? <ActionLink size="md" href={`tel:+91${p.mobile}`} icon={Phone}>{t('call')}</ActionLink> : null}
            {p.whatsapp ? <ActionLink size="md" variant="success" href={whatsappLink(p.whatsapp)} target="_blank" rel="noreferrer" icon={MessageCircle}>{t('whatsapp')}</ActionLink> : null}
            {mapsUrl ? <ActionLink size="md" variant="outline" href={mapsUrl} target="_blank" rel="noreferrer" icon={Navigation} aria-label={t('directions')} className="!flex-none"><span className="hidden sm:inline">{t('directions')}</span></ActionLink> : null}
          </div>
        </div>
      </Card>

      <Card padded={false} className="mt-4">
        <ul>
          <Row icon={Phone} label={t('profile.mobile')}>{field('mobile', p.mobile, (v) => formatMobile(v))}</Row>
          <Row icon={Mail} label={t('profile.email')}>{field('email', p.email)}</Row>
          <Row icon={MapPin} label={t('profile.address')}>{field('address', p.address)}</Row>
          <Row icon={Cake} label={t('profile.dob')}>{field('dob', p.dob, (v) => fmtDate(v))}</Row>
          <Row icon={Heart} label={t('profile.anniversary')}>{p.anniversary || locked('anniversary') ? field('anniversary', p.anniversary, (v) => fmtDate(v)) : <span className="text-muted">—</span>}</Row>
          {p.occupation ? <Row icon={Briefcase} label={t('profile.occupation')}>{p.occupation}</Row> : null}
          {p.isHead ? (
            <Row icon={Briefcase} label={t('profile.business')}>
              {locked('business') ? <LockedField /> : businesses.length
                ? <ul className="space-y-0.5">{businesses.map((b) => <li key={b.id}>{b.name}{b.category ? <span className="text-muted"> · {lang === 'hi' && b.category.nameHi ? b.category.nameHi : b.category.nameEn}</span> : null}</li>)}</ul>
                : <span className="text-muted">—</span>}
            </Row>
          ) : null}
        </ul>
      </Card>

      <Section title={t('profile.family', { count: persons.length })} className="mt-6">
        <ul className="flex flex-wrap gap-3">
          {persons.map((x) => (
            <li key={x.id}>
              <button
                type="button" onClick={() => setPid(x.id)} aria-pressed={x.id === p.id}
                className={cn('flex w-24 flex-col items-center gap-1 rounded-theme-sm border-2 p-2 transition-colors', x.id === p.id ? 'border-primary bg-accent-soft' : 'border-transparent hover:bg-ink/5')}
              >
                <Avatar name={x.name} src={x.photoUrl} size={52} />
                <span className="w-full truncate text-center text-xs font-semibold">{x.name.split(' ')[0]}</span>
                <span className="w-full truncate text-center text-[11px] text-muted">{x.isHead ? t('profile.head') : tf(relationKey(x.relation))}</span>
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
