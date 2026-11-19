import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Globe, MapPin, Share2, User } from 'lucide-react';
import { useT } from '@/lib/useT';
import { useToast, Card, EmptyState, ErrorState, ImageWithFallback, Skeleton, Badge, Button } from '@/components/ui';
import { catName, useBusiness } from '../api';
import { ContactActions } from '../components/BusinessCard';

export default function BusinessDetail() {
  const { t, tc, lang } = useT('business');
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const q = useBusiness(id);

  if (q.isLoading) return <div className="mx-auto max-w-2xl"><Skeleton className="h-56 w-full" /><Skeleton className="mt-4 h-40 w-full" /></div>;
  if (q.isError || !q.data) {
    return q.error && (q.error as { status?: number }).status === 404
      ? <EmptyState title={t('detail.notFound')} description={t('detail.notFoundBody')} action={<Link to="/business"><Button variant="outline">{t('detail.back')}</Button></Link>} />
      : <ErrorState onRetry={() => q.refetch()} />;
  }
  const b = q.data;
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: b.name, url });
      else { await navigator.clipboard.writeText(url); toast.success(t('detail.linkCopied')); }
    } catch { /* user cancelled */ }
  };
  const site = b.website ? b.website.replace(/^https?:\/\//i, '').replace(/\/$/, '') : null;
  const address = [b.addressLine, b.area].filter(Boolean).join(', ');

  return (
    <article className="mx-auto max-w-2xl">
      <div className="relative overflow-hidden rounded-theme">
        {b.photoUrls[0]
          ? <ImageWithFallback src={b.photoUrls[0]} alt="" className="h-48 w-full object-cover sm:h-60" />
          : <div className="h-48 w-full bg-gradient-to-br from-primary via-primary-2 to-accent sm:h-60" aria-hidden />}
        <div className="absolute inset-x-3 top-3 flex justify-between">
          <button type="button" onClick={() => nav(-1)} aria-label={tc('actions.back')} className="grid h-11 w-11 place-items-center rounded-full bg-black/45 text-white hover:bg-black/60"><ArrowLeft size={22} aria-hidden /></button>
          <button type="button" onClick={() => void share()} aria-label={tc('actions.share')} className="grid h-11 w-11 place-items-center rounded-full bg-black/45 text-white hover:bg-black/60"><Share2 size={20} aria-hidden /></button>
        </div>
      </div>

      <Card className="relative z-[1] -mt-9 mx-3 sm:mx-5">
        <div className="flex items-center gap-3">
          <div className="grid h-[58px] w-[58px] shrink-0 place-items-center overflow-hidden rounded-2xl bg-accent-soft font-head text-2xl text-primary" style={{ fontWeight: 'var(--hw)' }}>
            {b.logoUrl ? <ImageWithFallback src={b.logoUrl} alt="" className="h-full w-full object-cover" /> : b.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl">{b.name}</h1>
            <p className="text-sm text-muted">{[catName(b.category, lang), b.area].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        {b.status !== 'APPROVED' ? <div className="mt-2"><Badge tone="warning">{t(`status.${b.status}`)}</Badge></div> : null}
        <ContactActions b={b} labels className="mt-4" />
      </Card>

      {b.description ? <p className="mt-4 whitespace-pre-line px-1 text-base">{b.description}</p> : null}

      <Card padded={false} className="mt-4">
        <ul className="divide-y divide-line">
          {address ? <li className="flex items-start gap-3 px-4 py-3"><MapPin size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden /><span>{address}</span></li> : null}
          {site ? <li className="flex items-center gap-3 px-4 py-3"><Globe size={18} className="shrink-0 text-primary" aria-hidden /><a href={b.website!} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-primary underline-offset-2 hover:underline">{site}</a></li> : null}
          {b.owner.name ? (
            <li className="flex items-center gap-3 px-4 py-3">
              <User size={18} className="shrink-0 text-primary" aria-hidden />
              <span>{t('detail.owner')}: {b.owner.membershipNo
                ? <Link to={`/members?q=${encodeURIComponent(b.owner.membershipNo)}`} className="font-semibold text-primary hover:underline">{b.owner.name} · {b.owner.membershipNo}</Link>
                : <b>{b.owner.name}</b>}</span>
            </li>
          ) : null}
        </ul>
      </Card>

      {b.photoUrls.length > 1 ? (
        <section className="mt-5" aria-label={t('detail.photos')}>
          <h2 className="mb-2 text-base">{t('detail.photos')}</h2>
          <div className="grid grid-cols-3 gap-2">
            {b.photoUrls.slice(1).map((u) => <ImageWithFallback key={u} src={u} alt="" className="aspect-[4/3] w-full rounded-theme-sm object-cover" />)}
          </div>
        </section>
      ) : null}
    </article>
  );
}
