import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { setLang } from '@/app/i18n';
import { useAuth } from '@/lib/auth';

/** EN / हिं segmented switch. Persists locally and (when signed in) on the account. */
export function LangSwitch({ className, onDark }: { className?: string; onDark?: boolean }) {
  const { i18n, t } = useTranslation('common');
  const { setLanguage } = useAuth();
  const cur = i18n.language?.startsWith('hi') ? 'hi' : 'en';
  const pick = (l: 'en' | 'hi') => { if (l !== cur) { setLang(l); void setLanguage(l); } };
  return (
    <div role="group" aria-label={t('lang.switch')} className={cn('inline-flex overflow-hidden rounded-full border text-sm font-semibold', onDark ? 'border-white/60' : 'border-primary', className)}>
      {(['en', 'hi'] as const).map((l) => (
        <button
          key={l} type="button" lang={l} aria-pressed={cur === l} onClick={() => pick(l)}
          className={cn('min-h-[36px] min-w-[44px] px-3 transition-colors',
            cur === l ? (onDark ? 'bg-white text-primary' : 'bg-primary text-on-primary') : onDark ? 'text-white hover:bg-white/15' : 'text-primary hover:bg-primary/10')}
        >
          {t(`lang.${l}`)}
        </button>
      ))}
    </div>
  );
}
