import { useTranslation } from 'react-i18next';

/** useT('payments') -> t bound to the feature namespace; common strings via useT().tc('actions.save') */
export function useT(ns: string = 'common') {
  const { t, i18n } = useTranslation([ns, 'common']);
  return {
    t: (key: string, o?: Record<string, unknown>) => t(key, { ns, ...o }) as string,
    tc: (key: string, o?: Record<string, unknown>) => t(key, { ns: 'common', ...o }) as string,
    lang: (i18n.language?.startsWith('hi') ? 'hi' : 'en') as 'en' | 'hi',
  };
}
