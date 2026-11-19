import { Link } from 'react-router-dom';
import { MapPin, MessageCircle, Phone } from 'lucide-react';
import { useT } from '@/lib/useT';
import { whatsappLink } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Card, ImageWithFallback } from '@/components/ui';
import { catName, directionsUrl, type Business } from '../api';

const btn = 'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-theme-sm border-[1.5px] px-3 text-sm font-semibold transition-colors';

/** Call / WhatsApp / Directions row used on cards and the detail page. */
export function ContactActions({ b, className, labels = false }: { b: Business; className?: string; labels?: boolean }) {
  const { tc } = useT('business');
  const digits = (b.phone ?? '').replace(/[^\d+]/g, '');
  return (
    <div className={cn('flex gap-2', className)}>
      {b.phone ? (
        <a href={`tel:${digits}`} className={cn(btn, 'border-primary bg-primary text-on-primary hover:bg-primary-2')} aria-label={`${tc('actions.call')} ${b.name}`}>
          <Phone size={16} aria-hidden />{labels ? <span>{tc('actions.call')}</span> : null}
        </a>
      ) : null}
      {b.whatsapp ? (
        <a href={whatsappLink(b.whatsapp)} target="_blank" rel="noopener noreferrer" className={cn(btn, 'border-success bg-success text-white hover:opacity-90')} aria-label={`${tc('actions.whatsapp')} ${b.name}`}>
          <MessageCircle size={16} aria-hidden />{labels ? <span>{tc('actions.whatsapp')}</span> : null}
        </a>
      ) : null}
      <a href={directionsUrl(b)} target="_blank" rel="noopener noreferrer" className={cn(btn, 'border-primary bg-transparent text-primary hover:bg-primary/10')} aria-label={`${tc('actions.directions')} ${b.name}`}>
        <MapPin size={16} aria-hidden />{labels ? <span>{tc('actions.directions')}</span> : null}
      </a>
    </div>
  );
}

export function BusinessCard({ b }: { b: Business }) {
  const { lang } = useT('business');
  const cover = b.photoUrls[0];
  return (
    <Card padded={false} className="flex h-full flex-col overflow-hidden">
      <Link to={`/business/${b.id}`} className="block" aria-label={b.name}>
        {cover
          ? <ImageWithFallback src={cover} alt="" className="h-24 w-full object-cover" />
          : <div className="h-24 w-full bg-gradient-to-br from-primary/80 via-primary-2/70 to-accent/70" aria-hidden />}
      </Link>
      <div className="flex flex-1 flex-col p-3.5">
        <div className="-mt-10 flex items-end">
          <div className="relative z-[1] grid h-[52px] w-[52px] place-items-center overflow-hidden rounded-xl border border-line bg-surface font-head text-xl text-primary" style={{ fontWeight: 'var(--hw)' }}>
            {b.logoUrl ? <ImageWithFallback src={b.logoUrl} alt="" className="h-full w-full object-cover" /> : b.name.slice(0, 1).toUpperCase()}
          </div>
        </div>
        <Link to={`/business/${b.id}`} className="mt-2 font-semibold hover:text-primary">{b.name}</Link>
        <p className="text-sm text-muted">{[catName(b.category, lang), b.area].filter(Boolean).join(' · ')}</p>
        {b.owner.name ? <p className="mt-0.5 truncate text-xs text-muted">{b.owner.name}{b.owner.membershipNo ? ` · ${b.owner.membershipNo}` : ''}</p> : null}
        <ContactActions b={b} className="mt-auto pt-3" />
      </div>
    </Card>
  );
}
