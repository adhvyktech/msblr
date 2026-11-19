import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Spinner } from './States';

export type ButtonVariant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary border-primary hover:bg-primary-2 hover:border-primary-2',
  accent: 'bg-accent text-on-primary border-accent hover:opacity-90',
  outline: 'bg-transparent text-primary border-primary hover:bg-primary/10',
  ghost: 'bg-transparent text-ink border-transparent hover:bg-ink/5',
  danger: 'bg-danger text-white border-danger hover:opacity-90',
  success: 'bg-success text-white border-success hover:opacity-90',
};
const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-[36px] px-3 text-sm gap-1.5',
  md: 'min-h-[44px] px-5 text-base gap-2',
  lg: 'min-h-[52px] px-6 text-lg gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, fullWidth, icon: Icon, iconRight: IconR, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-theme-sm border-[1.5px] font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant], sizes[size], fullWidth && 'w-full', className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={size === 'lg' ? 20 : 16} /> : Icon ? <Icon size={size === 'sm' ? 16 : 20} aria-hidden /> : null}
      {children as ReactNode}
      {IconR && !loading ? <IconR size={size === 'sm' ? 16 : 20} aria-hidden /> : null}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  icon: LucideIcon;
  /** Required: accessible name for the icon-only button */
  label: string;
  variant?: 'ghost' | 'outline' | 'solid';
  size?: 'sm' | 'md' | 'lg';
  badge?: number;
}
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, variant = 'ghost', size = 'md', badge, className, type = 'button', ...rest },
  ref,
) {
  const dim = size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-12 w-12' : 'h-11 w-11';
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50',
        dim,
        variant === 'ghost' && 'text-ink hover:bg-ink/5',
        variant === 'outline' && 'border border-line bg-surface text-ink hover:bg-ink/5',
        variant === 'solid' && 'bg-primary text-on-primary hover:bg-primary-2',
        className,
      )}
      {...rest}
    >
      <Icon size={size === 'sm' ? 18 : 22} aria-hidden />
      {badge ? (
        <span className="absolute -right-0.5 -top-0.5 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[11px] font-bold leading-none text-on-primary">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </button>
  );
});
