import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  tone?: 'default' | 'accent' | 'accent-soft' | 'primary';
}
export function Card({ padded = true, tone = 'default', className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-theme border',
        tone === 'default' && 'border-line bg-surface shadow-card',
        tone === 'accent' && 'border-transparent bg-accent text-on-primary',
        tone === 'accent-soft' && 'border-transparent bg-accent-soft',
        tone === 'primary' && 'border-transparent bg-primary text-on-primary',
        padded && 'p-4 sm:p-5',
        className,
      )}
      {...rest}
    />
  );
}

export function PageHeader({ title, subtitle, actions, back, className }: {
  title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode; className?: string;
}) {
  return (
    <header className={cn('mb-5 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Section({ title, action, children, className }: {
  title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={cn('mb-6', className)}>
      {title || action ? (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          {title ? <h2 className="text-lg sm:text-xl">{title}</h2> : <span />}
          {action ? <div className="text-sm font-semibold text-primary">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function StatCard({ label, value, icon: Icon, hint, tone = 'default', to, className }: {
  label: string; value: ReactNode; icon?: LucideIcon; hint?: ReactNode; to?: string;
  tone?: 'default' | 'accent' | 'accent-soft' | 'primary'; className?: string;
}) {
  const inner = (
    <Card tone={tone} className={cn('flex h-full flex-col justify-between gap-4', to && 'transition-shadow hover:shadow-pop', className)}>
      {Icon ? (
        <div className={cn('grid h-11 w-11 place-items-center rounded-2xl', tone === 'default' || tone === 'accent-soft' ? 'bg-surface text-accent' : 'bg-white/20')}>
          <Icon size={22} aria-hidden />
        </div>
      ) : null}
      <div>
        <div className="font-head text-3xl leading-none" style={{ fontWeight: 'var(--hw)' }}>{value}</div>
        <div className={cn('mt-1 text-sm', tone === 'default' || tone === 'accent-soft' ? 'text-muted' : 'opacity-90')}>{label}</div>
        {hint ? <div className="mt-1 text-xs opacity-80">{hint}</div> : null}
      </div>
    </Card>
  );
  return to ? <Link to={to} className="block rounded-theme">{inner}</Link> : inner;
}
