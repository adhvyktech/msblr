import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import commonEn from './locales/en.json';
import commonHi from './locales/hi.json';

type Bundle = Record<string, unknown>;
const resources: Record<'en' | 'hi', Record<string, Bundle>> = { en: { common: commonEn }, hi: { common: commonHi } };

// features/<name>/i18n/{en,hi}.json are merged under namespace = <name>
const files = import.meta.glob('../features/*/i18n/{en,hi}.json', { eager: true, import: 'default' }) as Record<string, Bundle>;
for (const [p, json] of Object.entries(files)) {
  const m = p.match(/features\/([^/]+)\/i18n\/(en|hi)\.json$/);
  if (m) resources[m[2] as 'en' | 'hi'][m[1]!] = json;
}

export const LANG_KEY = 'msblr_lang';
export function storedLang(): 'en' | 'hi' {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === 'en' || v === 'hi') return v;
  } catch { /* ignore */ }
  return 'en';
}
export function setLang(l: 'en' | 'hi') {
  try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
  void i18n.changeLanguage(l);
  document.documentElement.lang = l;
}

void i18n.use(initReactI18next).init({
  resources,
  lng: storedLang(),
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: Object.keys(resources.en),
  interpolation: { escapeValue: false },
  returnNull: false,
});
document.documentElement.lang = storedLang();

export default i18n;
