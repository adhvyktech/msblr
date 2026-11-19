import { ErrorState, Skeleton } from '@/components/ui';
import { useT } from '@/lib/useT';
import { usePublicSite } from '../api';
import { EventsList, SectionBlock } from '../components/sections';

export default function PublicEvents() {
  const { t } = useT('site');
  const q = usePublicSite();
  return (
    <SectionBlock title={t('pages.eventsTitle')}>
      <p className="-mt-3 mb-6 text-muted">{t('pages.eventsSubtitle')}</p>
      {q.isLoading ? <Skeleton className="h-40" /> : q.isError || !q.data ? <ErrorState title={t('loadError')} onRetry={() => void q.refetch()} /> : <EventsList items={q.data.upcomingEvents} />}
    </SectionBlock>
  );
}
