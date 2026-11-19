import { Link, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LangSwitch } from '@/components/ui/LangSwitch';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth';
import { Brand } from './parts';

/** Header + footer shell for public pages (e.g. /register). */
export function PublicLayout() {
  const { t } = useTranslation('common');
  const { status } = useAuth();
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur pt-safe">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          <Brand size={40} showText className="flex-1" />
          <LangSwitch />
          {status === 'authed'
            ? <Link to="/"><Button size="sm" variant="outline">{t('nav.home')}</Button></Link>
            : <Link to="/login"><Button size="sm">{t('actions.login')}</Button></Link>}
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6"><Outlet /></main>
      <footer className="border-t border-line py-5 text-center text-sm text-muted">{t('sabhaName')} · {t('tagline')}</footer>
    </div>
  );
}
