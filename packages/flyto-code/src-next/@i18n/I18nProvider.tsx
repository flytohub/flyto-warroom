'use client';
import React, { useMemo, useState, useEffect } from 'react';
import useFuseSettings from '@components/adapters/useFuseSettings';
import I18nContext from './I18nContext';
import {
  setLocale,
  getAvailableLocales,
  i18nReady,
  type Locale,
} from '@lib/i18n';
import { useLocale } from '@hooks/useLocale';

type I18nProviderProps = {
  children: React.ReactNode;
};

/**
 * I18nProvider — bridges Fuse's I18nContext with our unified src/lib/i18n.ts store.
 *
 * CRITICAL: Blocks rendering until translations are loaded from CDN.
 * Without this gate, first paint shows English fallbacks / raw keys for
 * non-English users because init() is async and React renders before
 * translations arrive.
 */
export function I18nProvider(props: I18nProviderProps) {
  const { children } = props;
  const { data: settings, setSettings } = useFuseSettings();
  const currentLocale = useLocale();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    i18nReady.then(() => setReady(true));
  }, []);

  // Build Fuse-compatible language list from flyto-i18n manifest
  const locales = getAvailableLocales();
  const languages = useMemo(() =>
    locales.map(l => ({
      id: l.code,
      title: l.native,
      flag: l.region?.toUpperCase() ?? l.code.toUpperCase(),
    })),
    [locales]
  );

  const currentLanguage = useMemo(() =>
    languages.find(l => l.id === currentLocale) ?? { id: currentLocale, title: currentLocale, flag: 'US' },
    [languages, currentLocale]
  );

  // Determine text direction
  const langDirection = currentLocale === 'ar' || currentLocale === 'he' ? 'rtl' as const : 'ltr' as const;

  // Sync direction to Fuse settings if it changed
  useMemo(() => {
    if (settings.direction !== langDirection) {
      setSettings({ direction: langDirection });
    }
  }, [langDirection, settings.direction, setSettings]);

  const changeLanguage = async (languageId: string) => {
    await setLocale(languageId as Locale);
  };

  // MUST be before the early return so hook count is stable across renders
  const contextValue = useMemo(
    () => ({
      language: currentLanguage,
      languageId: currentLocale,
      langDirection,
      languages,
      changeLanguage,
    }),
    [currentLanguage, currentLocale, langDirection, languages]
  );

  // Block rendering until translations are loaded — prevents flash of
  // English / raw keys for non-English users on first paint
  if (!ready) {
    return null;
  }

  return (
    <I18nContext value={contextValue}>
      {/* key forces remount on language switch so every tOr() re-executes */}
      <React.Fragment key={currentLocale}>
        {children}
      </React.Fragment>
    </I18nContext>
  );
}
