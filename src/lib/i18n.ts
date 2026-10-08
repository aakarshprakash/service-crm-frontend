import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en.json';
import hi from '@/locales/hi.json';
import ml from '@/locales/ml.json';

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

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi }, ml: { translation: ml } },
  lng: initialLanguage(),
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

export function setLanguage(code: LanguageCode) {
  void i18n.changeLanguage(code);
}

export default i18n;
