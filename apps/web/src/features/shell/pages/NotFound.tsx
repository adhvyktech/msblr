import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { Brand } from '@/components/layout/parts';

export default function NotFound() {
  const { t } = useTranslation('common');
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 bg-bg p-6">
      <Brand size={64} />
      <EmptyState
        icon={Compass} title={t('notFound.title')} description={t('notFound.body')} className="w-full"
        action={<Link to="/"><Button>{t('notFound.home')}</Button></Link>}
      />
    </div>
  );
}
