import type { AnchorHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Anchor styled like <Button> (tel:, wa.me and maps links must be real links, not buttons). */
export function ActionLink({ icon: Icon, variant = 'primary', size = 'sm', className, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & {
  icon?: LucideIcon; variant?: 'primary' | 'outline' | 'success'; size?: 'sm' | 'md';
}) {
  return (
    <a
      className={cn(
        'inline-flex flex-1 select-none items-center justify-center rounded-theme-sm border-[1.5px] font-semibold transition-colors',
        size === 'sm' ? 'min-h-[40px] gap-1.5 px-3 text-sm' : 'min-h-[44px] gap-2 px-5 text-base',
        variant === 'primary' && 'border-primary bg-primary text-on-primary hover:bg-primary-2',
        variant === 'outline' && 'border-primary bg-transparent text-primary hover:bg-primary/10',
        variant === 'success' && 'border-success bg-success text-white hover:opacity-90',
        className,
      )}
      {...rest}
    >
      {Icon ? <Icon size={size === 'sm' ? 16 : 20} aria-hidden /> : null}
      {children}
    </a>
  );
}
