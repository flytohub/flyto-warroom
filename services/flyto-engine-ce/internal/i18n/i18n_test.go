package i18n

import (
	"testing"
	"time"
)

func TestFlatten(t *testing.T) {
	input := []byte(`{
		"engine": {
			"error": {
				"not_found": "Resource not found",
				"bad_request": {
					"name_required": "Name is required"
				}
			}
		}
	}`)
	flat := flatten(input)
	if flat["engine.error.not_found"] != "Resource not found" {
		t.Errorf("expected 'Resource not found', got %q", flat["engine.error.not_found"])
	}
	if flat["engine.error.bad_request.name_required"] != "Name is required" {
		t.Errorf("expected 'Name is required', got %q", flat["engine.error.bad_request.name_required"])
	}
}

func TestSlugify(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"workspace_id query parameter required", "workspace_id_query_parameter_required"},
		{"Name is required", "name_is_required"},
		{"repo not found", "repo_not_found"},
		{"  Admin or owner role required  ", "admin_or_owner_role_required"},
	}
	for _, tt := range tests {
		got := Slugify(tt.input)
		if got != tt.want {
			t.Errorf("Slugify(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestBundleT_Fallback(t *testing.T) {
	b := New(1 * time.Hour)
	// Manually inject translations.
	b.mu.Lock()
	b.locales["en"] = map[string]string{
		"engine.error.not_found": "Resource not found",
	}
	b.locales["zh-TW"] = map[string]string{
		"engine.error.not_found": "找不到資源",
	}
	b.fetched["en"] = time.Now()
	b.fetched["zh-TW"] = time.Now()
	b.mu.Unlock()

	// Direct hit.
	if got := b.T("zh-TW", "engine.error.not_found"); got != "找不到資源" {
		t.Errorf("expected zh-TW translation, got %q", got)
	}
	// Fallback to English.
	if got := b.T("zh-TW", "engine.error.missing_key"); got != "engine.error.missing_key" {
		t.Errorf("expected raw key fallback, got %q", got)
	}
	// Param interpolation.
	b.mu.Lock()
	b.locales["en"]["engine.msg.hello"] = "Hello {0}, welcome to {1}"
	b.mu.Unlock()
	if got := b.T("en", "engine.msg.hello", "Alice", "Flyto2"); got != "Hello Alice, welcome to Flyto2" {
		t.Errorf("param interpolation failed, got %q", got)
	}
}

func TestBundleOfflineDoesNotFetchRemoteLocales(t *testing.T) {
	b := NewOffline(1 * time.Hour)
	b.Preload("zh-TW")
	b.ensureLoaded("zh-TW")

	if len(b.locales) != 0 {
		t.Fatalf("offline bundle loaded remote locales: %+v", b.locales)
	}
	if got := b.T("zh-TW", "engine.error.not_found"); got != "engine.error.not_found" {
		t.Fatalf("offline bundle fallback = %q, want raw key", got)
	}
}

func TestTranslateError(t *testing.T) {
	b := New(1 * time.Hour)
	b.mu.Lock()
	b.locales["en"] = map[string]string{
		"engine.error.not_found":      "Resource not found",
		"engine.error.not_found.repo": "Repository not found",
	}
	b.locales["zh-TW"] = map[string]string{
		"engine.error.not_found":                         "找不到資源",
		"engine.error.not_found.repo_not_found":          "找不到儲存庫",
		"engine.error.bad_request.workspace_id_required": "需要提供工作區 ID",
	}
	b.fetched["en"] = time.Now()
	b.fetched["zh-TW"] = time.Now()
	b.mu.Unlock()

	// Specific key match.
	got := b.TranslateError("zh-TW", "NOT_FOUND", "repo not found")
	if got != "找不到儲存庫" {
		t.Errorf("specific key: got %q", got)
	}

	// Generic fallback.
	got = b.TranslateError("zh-TW", "NOT_FOUND", "something obscure not found")
	if got != "找不到資源" {
		t.Errorf("generic fallback: got %q", got)
	}

	// English passthrough.
	got = b.TranslateError("en", "NOT_FOUND", "repo not found")
	if got != "repo not found" {
		t.Errorf("english passthrough: got %q", got)
	}

	// No translation — return original.
	got = b.TranslateError("zh-TW", "INTERNAL", "some unknown error xyz")
	if got != "some unknown error xyz" {
		t.Errorf("no translation fallback: got %q", got)
	}
}
