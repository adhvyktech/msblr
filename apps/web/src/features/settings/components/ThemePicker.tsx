import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/useT';
import { useToast } from '@/components/ui';
import { useSaveSetting, type SettingsData } from '../api';

const THEMES: SettingsData['theme'][] = ['a', 'b', 'c'];

/** Mini preview rendered inside a wrapper with data-theme so every token resolves to that direction. */
function Mini({ v }: { v: SettingsData['theme'] }) {
  return (
    <div data-theme={v} className="overflow-hidden rounded-theme-sm border border-line bg-bg" aria-hidden>
      <div className="flex h-7 items-center gap-1.5 bg-primary px-2">
        <span className="h-3 w-3 rounded-full bg-on-primary/80" />
        <span className="h-1.5 w-12 rounded-full bg-on-primary/60" />
      </div>
      <div className="space-y-2 p-2.5">
        <div className="rounded-theme-sm bg-surface p-2 shadow-card">
          <div className="h-2 w-16 rounded-full bg-ink/70" />
          <div className="mt-1.5 h-1.5 w-24 rounded-full bg-muted/60" />
        </div>
        <div className="flex gap-1.5">
          <span className="h-5 flex-1 rounded-theme-sm bg-primary" />
          <span className="h-5 flex-1 rounded-theme-sm bg-accent" />
          <span className="h-5 flex-1 rounded-theme-sm bg-accent-soft" />
        </div>
      </div>
    </div>
  );
}

/** Applies instantly (document.documentElement.dataset.theme) and then saves; reverts if saving fails. */
export function ThemePicker({ value }: { value: SettingsData['theme'] }) {
  const { t } = useT('settings');
  const toast = useToast();
  const save = useSaveSetting('theme');
  const pick = (v: SettingsData['theme']) => {
    if (v === value || save.isPending) return;
    const prev = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = v;
    try { sessionStorage.removeItem('msblr_theme'); } catch { /* ignore */ }
    save.mutate(v, {
      onError: () => {
        document.documentElement.dataset.theme = prev ?? value;
        toast.error(t('appearance.failed'));
      },
    });
  };
  return (
    <div role="radiogroup" aria-label={t('appearance.title')} className="grid gap-3 sm:grid-cols-3">
      {THEMES.map((v) => {
        const on = v === value;
        return (
          <button
            key={v} type="button" role="radio" aria-checked={on} onClick={() => pick(v)} disabled={save.isPending}
            className={cn('rounded-theme border-2 p-3 text-left transition-colors disabled:opacity-60', on ? 'border-primary bg-accent-soft' : 'border-line bg-surface hover:border-primary/40')}
          >
            <Mini v={v} />
            <div className="mt-3 flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{t(`appearance.${v}.name`)}</div>
                <div className="text-sm text-muted">{t(`appearance.${v}.desc`)}</div>
              </div>
              {on ? <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-on-primary"><Check size={15} aria-hidden /></span> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
