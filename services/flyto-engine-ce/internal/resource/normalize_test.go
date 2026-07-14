package resource

import (
	"strings"
	"testing"
)

func TestNormalizeSimple(t *testing.T) {
	if got := NormalizeFilename("report.pdf"); got != "report.pdf" {
		t.Errorf("expected report.pdf, got %s", got)
	}
}

func TestNormalizeLowercaseExt(t *testing.T) {
	if got := NormalizeFilename("Report.PDF"); got != "Report.pdf" {
		t.Errorf("expected Report.pdf, got %s", got)
	}
}

func TestNormalizeUnsafeChars(t *testing.T) {
	got := NormalizeFilename("file:name*test.txt")
	if strings.ContainsAny(got, `:*?"<>|`) {
		t.Errorf("still has unsafe chars: %s", got)
	}
}

func TestNormalizeCJK(t *testing.T) {
	got := NormalizeFilename("會議記錄_2026.md")
	if !strings.Contains(got, "會議記錄") {
		t.Errorf("CJK chars should be preserved: %s", got)
	}
}

func TestNormalizeTruncate(t *testing.T) {
	long := strings.Repeat("a", 250) + ".txt"
	got := NormalizeFilename(long)
	if len([]rune(got)) > 204 { // 200 + ".txt"
		t.Errorf("should truncate: len=%d", len([]rune(got)))
	}
}

func TestNormalizeEmpty(t *testing.T) {
	got := NormalizeFilename("")
	if !strings.HasPrefix(got, "untitled-") {
		t.Errorf("empty should fallback: %s", got)
	}
}

func TestToDisplayName(t *testing.T) {
	if got := ToDisplayName("my-report-2026.pdf"); got != "my report 2026" {
		t.Errorf("expected 'my report 2026', got '%s'", got)
	}
}
