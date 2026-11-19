import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem { id: string; label: ReactNode; count?: number; disabled?: boolean }

/** Controlled tabs. Render panels yourself keyed by `value`; use panelId(id) for aria-controls. */
export function Tabs({ items, value, onChange, className, label }: {
  items: TabItem[]; value: string; onChange: (id: string) => void; className?: string; label?: string;
}) {
  const uid = useId();
  const enabled = items.filter((i) => !i.disabled);
  const onKey = (e: KeyboardEvent) => {
    const idx = enabled.findIndex((i) => i.id === value);
    if (e.key === 'ArrowRight') { e.preventDefault(); onChange(enabled[(idx + 1) % enabled.length]!.id); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(enabled[(idx - 1 + enabled.length) % enabled.length]!.id); }
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className={cn('scrollbar-none flex gap-1 overflow-x-auto border-b border-line', className)}>
      {items.map((i) => {
        const on = i.id === value;
        return (
          <button
            key={i.id} role="tab" type="button" id={`${uid}-${i.id}`} aria-selected={on} tabIndex={on ? 0 : -1} disabled={i.disabled} onClick={() => onChange(i.id)}
            className={cn('-mb-px flex min-h-[44px] items-center gap-2 whitespace-nowrap border-b-[3px] px-4 text-base font-semibold transition-colors disabled:opacity-40',
              on ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink')}
          >
            {i.label}
            {i.count !== undefined ? <span className={cn('rounded-full px-2 text-xs', on ? 'bg-primary text-on-primary' : 'bg-ink/10')}>{i.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
