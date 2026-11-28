import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en.json';

/** Languages the web app ships with. Add locales/<code>.json and an entry here to add one. */
export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

const STORAGE_KEY = 'servon.lang';
const supported = (code: string | null | undefined): code is LanguageCode => LANGUAGES.some((l) => l.code === code);

/** Saved choice, else the browser's language when we support it, else English. */
function initialLanguage(): LanguageCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (supported(saved)) return saved;
  } catch {
    /* storage blocked */
  }
  const browser = typeof navigator !== 'undefined' ? navigator.language?.slice(0, 2) : undefined;
  return supported(browser) ? browser : 'en';
}

// English is built in; Hindi and Malayalam are downloaded only by people who use them.
const LOADERS: Record<Exclude<LanguageCode, 'en'>, () => Promise<{ default: Record<string, unknown> }>> = {
  hi: () => import('@/locales/hi.json'),
  ml: () => import('@/locales/ml.json'),
};

async function load(code: LanguageCode): Promise<void> {
  if (code === 'en' || i18n.hasResourceBundle(code, 'translation')) return;
  try {
    const bundle = await LOADERS[code]();
    i18n.addResourceBundle(code, 'translation', bundle.default, true, true);
  } catch {
    /* offline or a failed download: English stays */
  }
}

const first = initialLanguage();
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: first,
  fallbackLng: 'en', // any key missing in hi / ml shows the English text
  interpolation: { escapeValue: false }, // React already escapes
});

document.documentElement.lang = i18n.language;
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* storage blocked: the choice lasts for this tab only */
  }
});

/** Resolves once the starting language is ready, so the first screen doesn't flash in English. */
export const i18nReady: Promise<void> = load(first).then(() => i18n.changeLanguage(first)).then(() => undefined);

export function setLanguage(code: LanguageCode) {
  void load(code).then(() => i18n.changeLanguage(code));
}

export default i18n;
