import { Info } from 'lucide-react';
import { useT } from '@/lib/useT';
import { SHOW_LEGAL_DRAFT_NOTE, usePublicSite } from '../api';
import { Container } from '../components/sections';

interface LegalSection { h: string; p: string[] }

function LegalPage({ doc }: { doc: 'privacy' | 'terms' }) {
  const { t } = useT('site');
  const q = usePublicSite();
  const sections = t(`legal.${doc}.sections`, { returnObjects: true }) as unknown as LegalSection[];
  const email = q.data?.sabha.email;
  return (
    <Container className="max-w-3xl py-10">
      {SHOW_LEGAL_DRAFT_NOTE ? (
        <p role="note" className="mb-6 flex items-center gap-2 rounded-theme border border-warning bg-warning-soft px-4 py-3 font-semibold">
          <Info size={18} aria-hidden />{t('legal.draft')}
        </p>
      ) : null}
      <h1 className="text-3xl">{t(`legal.${doc}.title`)}</h1>
      <p className="mt-4 text-muted">{t(`legal.${doc}.intro`)}</p>
      {Array.isArray(sections) ? sections.map((s) => (
        <section key={s.h} className="mt-6">
          <h2 className="text-xl">{s.h}</h2>
          {s.p.map((x) => <p key={x} className="mt-2">{x}</p>)}
        </section>
      )) : null}
      {email ? <p className="mt-8 font-semibold"><a className="text-primary" href={`mailto:${email}`}>{email}</a></p> : null}
    </Container>
  );
}
export const Privacy = () => <LegalPage doc="privacy" />;
export const Terms = () => <LegalPage doc="terms" />;
