package i18n

import (
	"regexp"
	"strings"
)

// slugRe normalises a raw error message into a lookup slug.
// "workspace_id query parameter required" → "workspace_id_required"
// "repo not found" → "repo_not_found" (but handled by specific keys)
var slugRe = regexp.MustCompile(`[^a-z0-9]+`)

// Slugify converts a human message to a translation key slug.
// Only exported for use by the baseline export script.
func Slugify(msg string) string {
	s := strings.ToLower(strings.TrimSpace(msg))
	s = slugRe.ReplaceAllString(s, "_")
	s = strings.Trim(s, "_")
	// Cap length to keep keys manageable.
	if len(s) > 60 {
		s = s[:60]
	}
	return s
}

// TranslateError attempts to resolve a translated error message for the
// given locale, error code, and original English message.
//
// Resolution order:
//  1. Specific key: engine.error.{code}.{slug} (e.g. engine.error.not_found.repo_not_found)
//  2. Generic key: engine.error.{code} (e.g. engine.error.not_found)
//  3. Fallback: return original message unchanged
//
// This function is the primary integration point — call it from respond.go
// before writing the error envelope.
func (b *Bundle) TranslateError(locale, code, message string) string {
	if locale == "en" || locale == "" {
		// English is the source language — skip lookup, return as-is.
		return message
	}

	codeLower := strings.ToLower(code)
	slug := Slugify(message)

	// Try specific key first.
	specificKey := "engine.error." + codeLower + "." + slug
	if b.Has(locale, specificKey) {
		return b.T(locale, specificKey)
	}

	// Try generic code-level key.
	genericKey := "engine.error." + codeLower
	if b.Has(locale, genericKey) {
		return b.T(locale, genericKey)
	}

	// No translation found — return original.
	return message
}
