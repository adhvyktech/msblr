import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/Badge';
import { Card, PageHeader } from '@/components/ui/Card';

/** Placeholder admin landing — replaced by the Admin builder's dashboard (features/admin-dashboard). */
export default function AdminHome() {
  const { t } = useTranslation('shell');
  const { me } = useAuth();
  return (
    <div>
      <PageHeader title={t('admin.title')} subtitle={t('admin.welcome', { name: me?.user.name ?? '' })} />
      <Card>
        <h2 className="mb-3 text-lg">{t('admin.yourAccess')}</h2>
        <div className="flex flex-wrap gap-2">{me?.roles.map((r) => <Badge key={r} tone="accent">{r}</Badge>)}</div>
        <p className="mt-4 text-sm text-muted">{t('admin.placeholder')}</p>
      </Card>
    </div>
  );
}
