/**
 * @flyto/i18n-data/runtime — shared i18n runtime for flyto-data consumers.
 *
 * Dynamic: only the active locale is fetched (not all 16 bundled).
 * No i18n logic lives in flyto-data — this module IS the runtime.
 *
 * Usage:
 *   import { t, useT, setLocale, getLocale } from '@flyto/i18n-data/runtime';
 *   const text = t('flyto_data.datasets.title');
 *   const tHook = useT(); // re-renders on locale change
 */

import { useEffect, useState } from 'react';

const LOCALE_KEY = 'flyto_data_locale';
const AVAILABLE = [
  'en','zh-TW','zh-CN','ja','ko','de','es','fr','hi','id','it','pl','pt-BR','th','tr','vi'
];

/** Loaded translations: { locale → { key → value } } */
const cache = {};
let current = detectLocale();
let loading = false;

/** Detect locale from localStorage → navigator → 'en' */
export function detectLocale() {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(LOCALE_KEY);
    if (saved && AVAILABLE.includes(saved)) return saved;
  }
  if (typeof navigator === 'undefined') return 'en';
  const lang = navigator.language;
  if (AVAILABLE.includes(lang)) return lang;
  const prefix = lang.split('-')[0];
  if (prefix === 'zh') return lang.includes('CN') || lang.includes('Hans') ? 'zh-CN' : 'zh-TW';
  const match = AVAILABLE.find(l => l.startsWith(prefix));
  return match || 'en';
}

/** Resolve the base URL where locale JSONs live (sibling to this file). */
function baseUrl() {
  // In Vite dev: the alias @flyto/i18n-data maps to the dist/data/ directory.
  // We use fetch() with a path relative to the page origin + known public path.
  // For prod: locale JSONs should be copied to /locales/ in the build output.
  return '/__flyto_i18n_data__';
}

async function fetchLocale(locale) {
  if (cache[locale]) return cache[locale];
  // Try dynamic import first (works with vite alias in dev)
  try {
    const mod = await import(/* @vite-ignore */ `@flyto/i18n-data/${locale}.json`);
    cache[locale] = mod.default || mod;
    return cache[locale];
  } catch {
    // fallback: fetch from public path
    try {
      const res = await fetch(`/locales/data/${locale}.json`);
      if (res.ok) {
        cache[locale] = await res.json();
        return cache[locale];
      }
    } catch { /* ignore */ }
  }
  return null;
}

/** Ensure the current locale is loaded. Call on app init. */
export async function init() {
  if (cache[current]) return;
  loading = true;
  // Load current + English fallback in parallel
  await Promise.all([
    fetchLocale(current),
    current !== 'en' ? fetchLocale('en') : Promise.resolve(),
  ]);
  loading = false;
}

export function getLocale() { return current; }
export function getAvailableLocales() {
  return [
    { code: 'en', name: 'English', native: 'English' },
    { code: 'zh-TW', name: 'Traditional Chinese', native: '繁體中文' },
    { code: 'zh-CN', name: 'Simplified Chinese', native: '简体中文' },
    { code: 'ja', name: 'Japanese', native: '日本語' },
    { code: 'ko', name: 'Korean', native: '한국어' },
    { code: 'de', name: 'German', native: 'Deutsch' },
    { code: 'es', name: 'Spanish', native: 'Español' },
    { code: 'fr', name: 'French', native: 'Français' },
    { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
    { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
    { code: 'it', name: 'Italian', native: 'Italiano' },
    { code: 'pl', name: 'Polish', native: 'Polski' },
    { code: 'pt-BR', name: 'Portuguese (Brazil)', native: 'Português (Brasil)' },
    { code: 'th', name: 'Thai', native: 'ไทย' },
    { code: 'tr', name: 'Turkish', native: 'Türkçe' },
    { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt' },
  ];
}

export async function setLocale(locale) {
  if (!AVAILABLE.includes(locale)) return;
  current = locale;
  if (typeof localStorage !== 'undefined') localStorage.setItem(LOCALE_KEY, locale);
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  await fetchLocale(locale);
  // Notify listeners
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('flyto_data:locale_changed', { detail: locale }));
  }
}

/**
 * Translate a key. Falls back: current locale → English → key itself.
 * Supports {param} interpolation.
 */
export function t(key, params) {
  let text = cache[current]?.[key] ?? cache['en']?.[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

/**
 * React hook — re-renders when locale changes.
 * Returns the same t() function but triggers re-render.
 */
export function useT() {
  const [, force] = useState(0);
  useEffect(() => {
    const handler = () => force(n => n + 1);
    window.addEventListener('flyto_data:locale_changed', handler);
    return () => window.removeEventListener('flyto_data:locale_changed', handler);
  }, []);
  return t;
}

/**
 * React hook — returns current locale + setter.
 */
export function useLocale() {
  const [locale, _setLocale] = useState(current);
  useEffect(() => {
    const handler = (e) => _setLocale(e.detail);
    window.addEventListener('flyto_data:locale_changed', handler);
    return () => window.removeEventListener('flyto_data:locale_changed', handler);
  }, []);
  return { locale, setLocale, availableLocales: getAvailableLocales() };
}
