import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { fileSrc } from '@/lib/api';
import { initials } from '@/lib/format';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';
const tones: Record<BadgeTone, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-ink/10 text-ink/80',
  accent: 'bg-accent-soft text-accent',
};

export function Badge({ tone = 'neutral', children, className, icon }: { tone?: BadgeTone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}>
      {icon}{children}
    </span>
  );
}

/** Maps common status strings to a tone. */
export function statusTone(s: string): BadgeTone {
  switch (s) {
    case 'ACTIVE': case 'APPROVED': case 'LIVE': case 'PUBLISHED': case 'PAID': return 'success';
    case 'DUE': case 'PENDING': case 'REQUESTED': case 'CONTENT_SUBMITTED': case 'RETURNED': case 'DRAFT': case 'PAUSED': return 'warning';
    case 'EXPIRED': case 'REJECTED': case 'DISABLED': case 'HIDDEN': return 'danger';
    default: return 'neutral';
  }
}
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const { t } = useTranslation('common');
  return <Badge tone={statusTone(status)}>{label ?? t(`status.${status}`, { defaultValue: status })}</Badge>;
}

// deterministic avatar colours (token-independent on purpose: identity colours, not theme colours)
const AV = ['#B4532A', '#2F6B4F', '#7A1F2B', '#1E3A8A', '#9A6B12', '#5B4B8A', '#0F766E', '#A0344F'];
const colourOf = (s: string) => AV[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length]!;

export function Avatar({ name, src, size = 40, className }: { name?: string | null; src?: string | null; size?: number; className?: string }) {
  const n = name ?? '?';
  return (
    <span
      className={cn('inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-bold text-white', className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.38), background: src ? undefined : colourOf(n) }}
      role="img" aria-label={n}
    >
      {src ? <img src={fileSrc(src)} alt="" className="h-full w-full object-cover" loading="lazy" /> : initials(n)}
    </span>
  );
}

/** Shown in place of a field the member chose to hide ("🔒 Hidden by member"). */
export function LockedField({ label, className }: { label?: ReactNode; className?: string }) {
  const { t } = useTranslation('common');
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm italic text-muted', className)}>
      <Lock size={14} aria-hidden />
      {label ?? t('forms.hiddenByMember')}
    </span>
  );
}
