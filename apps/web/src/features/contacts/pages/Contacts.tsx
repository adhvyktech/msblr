import { Phone, Siren } from 'lucide-react';
import { useT } from '@/lib/useT';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { telHref, useContacts } from '../api';

export default function Contacts() {
  const { t } = useT('contacts');
  const q = useContacts();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      {q.isLoading ? <Skeleton className="h-56" lines={4} />
        : q.isError ? <ErrorState onRetry={() => q.refetch()} />
        : q.data!.length === 0 ? <EmptyState icon={Phone} title={t('emptyTitle')} description={t('emptyBody')} />
        : q.data!.map((g) => (
          <section key={g.section} className="mb-6" aria-labelledby={`sec-${g.section}`}>
            <h2 id={`sec-${g.section}`} className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-muted">{t(`sections.${g.section}`, { defaultValue: g.section })}</h2>
            {g.section === 'EMERGENCY' ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {g.items.map((c) => (
                  <li key={c.id}>
                    <a href={telHref(c.phone)} className="flex min-h-[72px] items-center gap-3 rounded-theme border border-danger/30 bg-surface p-3 shadow-card hover:bg-danger-soft" aria-label={`${t('call')} ${c.name} ${c.phone}`}>
                      <Siren size={22} className="shrink-0 text-danger" aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{c.name}</span>
                        <span className="block font-head text-xl text-danger" style={{ fontWeight: 'var(--hw)' }}>{c.phone}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <Card padded={false}>
                <ul className="divide-y divide-line">
                  {g.items.map((c) => (
                    <li key={c.id}>
                      <a href={telHref(c.phone)} className="flex min-h-[64px] items-center gap-3 px-4 py-3 hover:bg-ink/5" aria-label={`${t('call')} ${c.name} ${c.phone}`}>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{c.name}</span>
                          <span className="block text-sm text-muted">{c.phone}{c.details ? ` · ${c.details}` : ''}</span>
                        </span>
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-primary"><Phone size={18} aria-hidden /></span>
                      </a>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        ))}
    </div>
  );
}
