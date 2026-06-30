import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Fuse template's i18next instance. The product i18n surface
// (CDN-loaded translations + tOr() with fallbacks) lives in
// src-next/lib/i18n.ts. This file exists so Fuse's navigation /
// settings / nav-badge code that calls `i18n.t('navigation:foo')`
// still resolves — when a key isn't registered, i18next returns the
// raw key, which is what the Fuse code expects as a fallback.
const resources = {
	en: {
		navigation: {}
	}
};

i18n.use(initReactI18next).init({
	resources,
	lng: 'en',
	keySeparator: false,
	interpolation: { escapeValue: false }
});

export default i18n;
