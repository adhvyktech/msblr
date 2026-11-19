import { ErrorState, Skeleton } from '@/components/ui';
import { useT } from '@/lib/useT';
import { useHashScroll, usePublicSite } from '../api';
import { CommitteeGrid, ContactSection, Container, SectionBlock } from '../components/sections';

export default function About() {
  const { t, lang } = useT('site');
  const q = usePublicSite();
  useHashScroll(!!q.data);
  if (q.isLoading) return <Container className="space-y-4 py-10"><Skeleton className="h-10 w-64" /><Skeleton className="h-48" /></Container>;
  if (q.isError || !q.data) return <Container className="py-10"><ErrorState title={t('loadError')} onRetry={() => void q.refetch()} /></Container>;
  const d = q.data;
  const about = lang === 'hi' && d.about.hi ? d.about.hi : d.about.en || d.about.hi;
  return (
    <>
      <SectionBlock title={t('about.title')}>
        {about ? <div className="max-w-3xl space-y-4 whitespace-pre-line text-base sm:text-lg">{about}</div> : <p className="text-muted">{t('about.empty')}</p>}
      </SectionBlock>
      <SectionBlock title={t('about.committee')} tone="soft"><CommitteeGrid items={d.committee} /></SectionBlock>
      <ContactSection site={d} />
    </>
  );
}
