import {
  forwardRef, useId, type ChangeEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Label + control + hint/error wrapper used by all form controls. */
export function Field({ id, label, required, hint, error, children, className }: {
  id: string; label?: ReactNode; required?: boolean; hint?: ReactNode; error?: string; children: ReactNode; className?: string;
}) {
  return (
    <div className={cn('w-full', className)}>
      {label ? (
        <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink/80">
          {label}
          {required ? <span className="ml-0.5 text-danger" aria-hidden>*</span> : null}
          {required ? <span className="sr-only"> (required)</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <p id={`${id}-err`} role="alert" className="mt-1.5 text-sm text-danger">{error}</p> : hint ? <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

const control =
  'block w-full min-h-[48px] rounded-theme-sm border-[1.5px] bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-muted/70 transition-colors ' +
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:bg-ink/5 disabled:opacity-70';
const border = (error?: string) => (error ? 'border-danger' : 'border-line');

export interface BaseFieldProps { label?: ReactNode; hint?: ReactNode; error?: string; required?: boolean; wrapperClassName?: string }

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & BaseFieldProps & { leftIcon?: LucideIcon }>(function Input(
  { label, hint, error, required, wrapperClassName, className, id, leftIcon: Icon, ...rest }, ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field id={fid} label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      <div className="relative">
        {Icon ? <Icon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden /> : null}
        <input
          ref={ref} id={fid} required={required} aria-invalid={!!error || undefined} aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
          className={cn(control, border(error), Icon && 'pl-10', className)} {...rest}
        />
      </div>
    </Field>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & BaseFieldProps>(function Textarea(
  { label, hint, error, required, wrapperClassName, className, id, rows = 4, ...rest }, ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field id={fid} label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      <textarea ref={ref} id={fid} rows={rows} required={required} aria-invalid={!!error || undefined} className={cn(control, border(error), 'resize-y', className)} {...rest} />
    </Field>
  );
});

export interface SelectOption { value: string | number; label: string; disabled?: boolean }
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & BaseFieldProps & { options?: SelectOption[]; placeholder?: string }>(function Select(
  { label, hint, error, required, wrapperClassName, className, id, options, placeholder, children, ...rest }, ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field id={fid} label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      <div className="relative">
        <select ref={ref} id={fid} required={required} aria-invalid={!!error || undefined} className={cn(control, border(error), 'appearance-none pr-10', className)} {...rest}>
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options?.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
          {children}
        </select>
        <ChevronDown size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
      </div>
    </Field>
  );
});

export const DateInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & BaseFieldProps>(function DateInput(props, ref) {
  return <Input ref={ref} type="date" {...props} />;
});

/** +91 prefix, digits only, max 10. Works with react-hook-form register() and as controlled input. */
export const PhoneInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & BaseFieldProps>(function PhoneInput(
  { label, hint, error, required, wrapperClassName, className, id, onChange, ...rest }, ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  const clean = (e: ChangeEvent<HTMLInputElement>) => {
    let d = e.target.value.replace(/\D/g, '');
    if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
    e.target.value = d.slice(0, 10);
    onChange?.(e);
  };
  return (
    <Field id={fid} label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      <div className={cn('flex min-h-[48px] items-stretch overflow-hidden rounded-theme-sm border-[1.5px] bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25', border(error))}>
        <span className="flex items-center border-r border-line bg-ink/5 px-3.5 font-semibold text-ink/80" aria-hidden>+91</span>
        <input
          ref={ref} id={fid} type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={13} required={required}
          aria-invalid={!!error || undefined} aria-describedby={error ? `${fid}-err` : undefined} placeholder="98450 12345"
          className={cn('min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-base tracking-wide text-ink placeholder:text-muted/70 focus:outline-none', className)}
          onChange={clean} {...rest}
        />
      </div>
    </Field>
  );
});

export const Checkbox = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; error?: string }>(function Checkbox(
  { label, error, className, id, ...rest }, ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={className}>
      <label htmlFor={fid} className="flex min-h-[44px] cursor-pointer items-center gap-3">
        <span className="relative grid h-6 w-6 shrink-0 place-items-center">
          <input ref={ref} id={fid} type="checkbox" className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-md border-[1.5px] border-line bg-surface checked:border-primary checked:bg-primary" {...rest} />
          <Check size={16} strokeWidth={3} className="pointer-events-none relative hidden text-on-primary peer-checked:block" aria-hidden />
        </span>
        <span className="text-base">{label}</span>
      </label>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </div>
  );
});

export function Toggle({ checked, onChange, label, disabled, id, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean; id?: string; description?: ReactNode;
}) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-4">
      <label htmlFor={fid} className="min-w-0 cursor-pointer">
        <span className="block text-base">{label}</span>
        {description ? <span className="block text-sm text-muted">{description}</span> : null}
      </label>
      <button
        id={fid} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-success' : 'bg-ink/25')}
      >
        <span className={cn('absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
      </button>
    </div>
  );
}

export interface ChoiceOption<V extends string | number = string> { value: V; label: ReactNode; description?: ReactNode; icon?: LucideIcon; disabled?: boolean }

export function RadioCards<V extends string | number>({ options, value, onChange, name, label, columns = 2, error }: {
  options: ChoiceOption<V>[]; value: V | null | undefined; onChange: (v: V) => void; name: string; label?: ReactNode; columns?: 1 | 2 | 3; error?: string;
}) {
  return (
    <fieldset>
      {label ? <legend className="mb-1.5 text-sm font-semibold text-ink/80">{label}</legend> : null}
      <div role="radiogroup" className={cn('grid gap-3', columns === 1 && 'grid-cols-1', columns === 2 && 'grid-cols-1 sm:grid-cols-2', columns === 3 && 'grid-cols-1 sm:grid-cols-3')}>
        {options.map((o) => {
          const on = o.value === value;
          const Icon = o.icon;
          return (
            <label key={String(o.value)} className={cn('relative flex min-h-[56px] cursor-pointer items-start gap-3 rounded-theme-sm border-2 p-3.5 transition-colors',
              on ? 'border-primary bg-accent-soft' : 'border-line bg-surface hover:border-primary/40', o.disabled && 'cursor-not-allowed opacity-50')}>
              <input type="radio" name={name} className="peer sr-only" checked={on} disabled={o.disabled} onChange={() => onChange(o.value)} />
              <span className={cn('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2', on ? 'border-primary' : 'border-line')} aria-hidden>
                {on ? <span className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
              </span>
              {Icon ? <Icon size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden /> : null}
              <span className="min-w-0"><span className="block font-semibold">{o.label}</span>{o.description ? <span className="block text-sm text-muted">{o.description}</span> : null}</span>
              <span className="pointer-events-none absolute inset-0 rounded-theme-sm peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-primary/70" />
            </label>
          );
        })}
      </div>
      {error ? <p role="alert" className="mt-1.5 text-sm text-danger">{error}</p> : null}
    </fieldset>
  );
}

/** Pill filters. Single select by default; pass multiple + array value for multi-select. */
export function ChipGroup<V extends string | number>(props: {
  options: ChoiceOption<V>[]; label?: string; className?: string;
} & ({ multiple?: false; value: V | null | undefined; onChange: (v: V) => void } | { multiple: true; value: V[]; onChange: (v: V[]) => void })) {
  const { options, label, className } = props;
  const isOn = (v: V) => (props.multiple ? props.value.includes(v) : props.value === v);
  const toggle = (v: V) => {
    if (props.multiple) props.onChange(props.value.includes(v) ? props.value.filter((x) => x !== v) : [...props.value, v]);
    else props.onChange(v);
  };
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)} type="button" aria-pressed={isOn(o.value)} disabled={o.disabled} onClick={() => toggle(o.value)}
          className={cn('min-h-[40px] whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors disabled:opacity-50',
            isOn(o.value) ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-ink hover:border-primary/50')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Convenience: translated "Required"/"Optional" suffix */
export function useOptionalLabel() {
  const { t } = useTranslation('common');
  return (label: string, optional?: boolean) => (optional ? `${label} (${t('forms.optional')})` : label);
}
