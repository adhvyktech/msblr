import { useThemeVariant } from '@/app/theme';
import { useT } from '@/lib/useT';
import { ErrorState, Skeleton } from '@/components/ui';
import { useIsDesktop } from '../useMedia';
import { useHome } from '../api';
import { DesktopC, MobileC, VariantA, VariantB } from '../components/variants';

/** Member home. Direction C (default) is the bento / big-tile layout; A and B reuse the same data. */
export default function Home() {
  const { t } = useT('home');
  const variant = useThemeVariant();
  const desktop = useIsDesktop();
  const q = useHome();

  if (q.isLoading) {
    return (
      <div aria-busy="true" aria-label={t('loading')}>
        <Skeleton className="mb-5 h-12 w-72" />
        <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-60 lg:col-span-2" /><Skeleton className="h-60" /></div>
      </div>
    );
  }
  if (q.isError || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  const d = q.data;
  if (variant === 'a') return <VariantA d={d} />;
  if (variant === 'b') return <VariantB d={d} />;
  return desktop ? <DesktopC d={d} /> : <MobileC d={d} />;
}
