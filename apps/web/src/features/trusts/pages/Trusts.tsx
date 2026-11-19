import { ChevronRight, Download, ExternalLink, Landmark } from 'lucide-react';
import { useT } from '@/lib/useT';
import { fileSrc } from '@/lib/api';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { useTrusts } from '../api';

export default function Trusts() {
  const { t } = useT('trusts');
  const q = useTrusts();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      {q.isLoading ? <div className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36" />)}</div>
        : q.isError ? <ErrorState onRetry={() => q.refetch()} />
        : q.data!.length === 0 ? <EmptyState icon={Landmark} title={t('emptyTitle')} description={t('emptyBody')} />
        : (
          <ul className="grid gap-4">
            {q.data!.map((tr) => (
              <li key={tr.id}>
                <Card>
                  <div className="flex items-start gap-3">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-primary"><Landmark size={24} aria-hidden /></span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg">{tr.name}</h2>
                      {tr.description ? <p className="mt-1 whitespace-pre-line text-ink/80">{tr.description}</p> : null}
                    </div>
                  </div>
                  {tr.attachments.length ? (
                    <ul className="mt-4 grid gap-2" aria-label={t('documents')}>
                      {tr.attachments.map((a) => (
                        <li key={a.id}>
                          <a
                            href={a.isLink ? a.href ?? '#' : fileSrc(a.href) ?? '#'} target="_blank" rel="noopener noreferrer"
                            className="flex min-h-[48px] items-center gap-3 rounded-theme-sm bg-bg px-3 py-2 hover:bg-accent-soft"
                          >
                            {a.isLink ? <ExternalLink size={18} className="shrink-0 text-accent" aria-hidden /> : <Download size={18} className="shrink-0 text-accent" aria-hidden />}
                            <span className="min-w-0 flex-1 truncate font-medium">{a.label}</span>
                            <span className="text-xs text-muted">{a.isLink ? t('link') : t('file')}</span>
                            <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
