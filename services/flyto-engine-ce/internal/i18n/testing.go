package i18n

import "time"

// InjectForTest directly sets translations for a locale without hitting CDN.
// This is intended for unit tests only — it bypasses the fetch mechanism.
func (b *Bundle) InjectForTest(locale string, translations map[string]string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.locales[locale] = translations
	b.fetched[locale] = time.Now()
}
