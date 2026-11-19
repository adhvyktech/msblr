import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn('animate-spin', className)} aria-hidden />;
}

export function Skeleton({ className, lines }: { className?: string; lines?: number }) {
  if (lines) {
    return (
      <div className="space-y-2" aria-hidden>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={cn('h-4', i === lines - 1 ? 'w-2/3' : 'w-full')} />
        ))}
      </div>
    );
  }
  return (
    <div aria-hidden className={cn('relative overflow-hidden rounded-theme-sm bg-ink/10', className)}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: {
  icon?: LucideIcon; title?: string; description?: string; action?: ReactNode; className?: string;
}) {
  const { t } = useTranslation('common');
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-theme border border-dashed border-line bg-surface px-6 py-12 text-center', className)}>
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-accent"><Icon size={26} aria-hidden /></div>
      <h3 className="text-lg">{title ?? t('states.emptyTitle')}</h3>
      <p className="mt-1 max-w-sm text-muted">{description ?? t('states.emptyBody')}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title, description, onRetry, className }: {
  title?: string; description?: string; onRetry?: () => void; className?: string;
}) {
  const { t } = useTranslation('common');
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center rounded-theme border border-danger/30 bg-danger-soft px-6 py-10 text-center', className)}>
      <AlertTriangle className="mb-3 text-danger" size={30} aria-hidden />
      <h3 className="text-lg text-danger">{title ?? t('states.errorTitle')}</h3>
      <p className="mt-1 max-w-sm text-ink/80">{description ?? t('states.errorBody')}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-4 min-h-[44px] rounded-theme-sm border border-danger px-5 font-semibold text-danger hover:bg-danger/10">
          {t('actions.retry')}
        </button>
      ) : null}
    </div>
  );
}
