export type Locale = 'en' | 'zh-TW' | 'zh-CN' | 'ja' | 'ko' | 'de' | 'es' | 'fr' | 'hi' | 'id' | 'it' | 'pl' | 'pt-BR' | 'th' | 'tr' | 'vi';
export type LocaleInfo = { code: Locale; name: string; native: string };

export function detectLocale(): Locale;
export function init(): Promise<void>;
export function getLocale(): Locale;
export function getAvailableLocales(): LocaleInfo[];
export function setLocale(locale: Locale): Promise<void>;
export function t(key: string, params?: Record<string, string | number>): string;
export function useT(): (key: string, params?: Record<string, string | number>) => string;
export function useLocale(): { locale: Locale; setLocale: (locale: Locale) => Promise<void>; availableLocales: LocaleInfo[] };
