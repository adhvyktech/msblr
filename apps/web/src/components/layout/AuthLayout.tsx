import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LangSwitch } from '@/components/ui/LangSwitch';
import { useLogo } from '@/app/theme';

/** Centered card layout for login / registration entry. */
export function AuthLayout() {
  const { t } = useTranslation('common');
  const logo = useLogo();
  return (
    <div className="relative flex min-h-screen flex-col items-center bg-bg px-4 pb-10 pt-safe">
      <div aria-hidden className="absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-primary/15 to-transparent" />
      <div className="relative flex w-full max-w-md items-center justify-end py-4"><LangSwitch /></div>
      <main className="relative flex w-full max-w-md flex-1 flex-col items-center">
        <img src={logo} alt={t('appName')} width={96} height={96} className="mb-4 h-24 w-24 rounded-[22%] shadow-pop" />
        <p className="mb-6 text-center text-sm font-medium text-muted">{t('tagline')}</p>
        <div className="w-full rounded-theme border border-line bg-surface p-6 shadow-pop sm:p-8"><Outlet /></div>
        <p className="mt-6 text-center text-xs text-muted">{t('sabhaName')}</p>
      </main>
    </div>
  );
}
