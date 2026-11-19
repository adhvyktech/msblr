import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Step indicator. current is 0-based. Compact bar on mobile, labelled on ≥sm. */
export function Stepper({ steps, current, className }: { steps: string[]; current: number; className?: string }) {
  return (
    <nav aria-label="Progress" className={className}>
      <p className="mb-2 text-sm font-semibold text-muted sm:hidden">{current + 1} / {steps.length} · <span className="text-ink">{steps[current]}</span></p>
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {steps.map((s, i) => {
          const done = i < current, on = i === current;
          return (
            <li key={s} className="flex flex-1 items-center gap-2" aria-current={on ? 'step' : undefined}>
              <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold max-sm:hidden', done && 'bg-success text-white', on && 'bg-primary text-on-primary', !done && !on && 'bg-ink/10 text-muted')}>
                {done ? <Check size={16} aria-hidden /> : i + 1}
              </span>
              <span className={cn('hidden truncate text-sm font-semibold sm:block', on ? 'text-ink' : 'text-muted')}>{s}</span>
              <span className={cn('h-1.5 flex-1 rounded-full sm:hidden', done || on ? 'bg-accent' : 'bg-line')} aria-hidden />
              {i < steps.length - 1 ? <span className={cn('hidden h-0.5 flex-1 sm:block', done ? 'bg-success' : 'bg-line')} aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
