import { ErrorState, Skeleton } from '@/components/ui';
import { useT } from '@/lib/useT';
import { usePublicSite } from '../api';
import { SectionBlock, TrustsList } from '../components/sections';

export default function TrustsInfo() {
  const { t } = useT('site');
  const q = usePublicSite();
  return (
    <SectionBlock title={t('pages.trustsTitle')}>
      <p className="-mt-3 mb-6 text-muted">{t('trusts.subtitle')}</p>
      {q.isLoading ? <Skeleton className="h-40" /> : q.isError || !q.data ? <ErrorState title={t('loadError')} onRetry={() => void q.refetch()} /> : <TrustsList items={q.data.trusts} />}
    </SectionBlock>
  );
}
