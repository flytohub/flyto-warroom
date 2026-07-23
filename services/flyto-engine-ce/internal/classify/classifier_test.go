package classify

import (
	"path/filepath"
	"strings"
	"testing"
)

var sampleRules = []Rule{
	{
		Name: "meeting", Type: TypeFilenamePattern,
		Pattern: "(?i)(meeting|standup)", Category: "document",
		Subcategory: "meeting-notes", Confidence: 0.95,
	},
	{
		Name: "code-go", Type: TypeExtension,
		Extensions: []string{"go"}, Category: "code",
		Subcategory: "golang", Confidence: 0.95,
	},
	{
		Name: "code-python", Type: TypeExtension,
		Extensions: []string{"py", "pyw"}, Category: "code",
		Subcategory: "python", Confidence: 0.95,
	},
	{
		Name: "mime-image", Type: TypeMIMECategory,
		Pattern: "image/", Category: "media",
		Subcategory: "image", Confidence: 0.90,
	},
	{
		Name: "mime-archive", Type: TypeMIMECategory,
		Pattern: "application/zip|application/x-tar", Category: "archive",
		Subcategory: "compressed", Confidence: 0.90,
	},
	{
		Name: "content-invoice", Type: TypeContentKeyword,
		Pattern:    "(invoice|bill\\s*to|due\\s*date)",
		MinMatches: 2, Category: "document",
		Subcategory: "invoice", Confidence: 0.70,
	},
	{
		Name: "fallback", Type: TypeDefault,
		Category: "document", Subcategory: "general", Confidence: 0.10,
	},
}

func newTestClassifier(t *testing.T) *Classifier {
	t.Helper()
	c, err := New(sampleRules)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return c
}

func TestFilenamePatternMatch(t *testing.T) {
	c := newTestClassifier(t)
	r := c.Classify(Input{Filename: "Q4-Standup-Notes.md"})
	if r.RuleName != "meeting" {
		t.Errorf("want meeting, got %s", r.RuleName)
	}
	if r.Category != "document" || r.Subcategory != "meeting-notes" {
		t.Errorf("category/subcategory mismatch: %+v", r)
	}
}

func TestExtensionMatch(t *testing.T) {
	c := newTestClassifier(t)
	cases := []struct {
		filename string
		want     string
	}{
		{"main.go", "code-go"},
		{"app.py", "code-python"},
		{"script.pyw", "code-python"},
		{"unknown.xyz", "fallback"},
	}
	for _, tc := range cases {
		r := c.Classify(Input{Filename: tc.filename})
		if r.RuleName != tc.want {
			t.Errorf("%s: got %s, want %s", tc.filename, r.RuleName, tc.want)
		}
	}
}

func TestMIMEPrefixMatch(t *testing.T) {
	c := newTestClassifier(t)
	r := c.Classify(Input{Filename: "photo.unknown", MIMEType: "image/png"})
	if r.RuleName != "mime-image" {
		t.Errorf("want mime-image, got %s", r.RuleName)
	}
}

func TestMIMEAlternationMatch(t *testing.T) {
	c := newTestClassifier(t)
	r := c.Classify(Input{Filename: "data.bin", MIMEType: "application/x-tar"})
	if r.RuleName != "mime-archive" {
		t.Errorf("want mime-archive, got %s", r.RuleName)
	}
}

func TestContentKeywordRequiresMinMatches(t *testing.T) {
	c := newTestClassifier(t)
	// only one match → not enough
	r1 := c.Classify(Input{Filename: "x.txt", Content: "Please pay this invoice"})
	if r1.RuleName == "content-invoice" {
		t.Errorf("expected content rule to NOT match with only 1 hit, got %+v", r1)
	}
	// two matches → triggers
	r2 := c.Classify(Input{Filename: "x.txt", Content: "Invoice #42 — bill to ACME, due date next Friday"})
	if r2.RuleName != "content-invoice" {
		t.Errorf("expected content-invoice, got %s", r2.RuleName)
	}
}

func TestFirstMatchWins(t *testing.T) {
	c := newTestClassifier(t)
	// .go extension AND filename matches "meeting"? Let's craft a case.
	r := c.Classify(Input{Filename: "meeting-prep.go"})
	// filename rule is listed first → it should win
	if r.RuleName != "meeting" {
		t.Errorf("expected first-match-wins: meeting beats code-go, got %s", r.RuleName)
	}
}

func TestFallbackWhenNoMatch(t *testing.T) {
	c := newTestClassifier(t)
	r := c.Classify(Input{Filename: "data.unknown", MIMEType: "application/octet-stream"})
	if r.RuleName != "fallback" {
		t.Errorf("expected fallback, got %s", r.RuleName)
	}
}

func TestNoRulesIsError(t *testing.T) {
	if _, err := New(nil); err == nil {
		t.Fatal("expected error for empty rules")
	}
}

func TestInvalidPatternIsError(t *testing.T) {
	bad := []Rule{{Name: "bad", Type: TypeFilenamePattern, Pattern: "(unclosed", Category: "x"}}
	if _, err := New(bad); err == nil {
		t.Fatal("expected error for invalid regex")
	}
}

func TestUnknownTypeIsError(t *testing.T) {
	bad := []Rule{{Name: "bad", Type: "made-up", Category: "x"}}
	if _, err := New(bad); err == nil {
		t.Fatal("expected error for unknown rule type")
	}
}

func TestConfidenceBoundsValidated(t *testing.T) {
	bad := []Rule{{Name: "bad", Type: TypeDefault, Category: "x", Confidence: 1.5}}
	if _, err := New(bad); err == nil {
		t.Fatal("expected error for out-of-range confidence")
	}
}

func TestLoadFromYAMLFile(t *testing.T) {
	// Use the real config shipped with the repo to make sure the YAML schema
	// stays in sync with the loader.
	path := filepath.Join("..", "..", "config", "classification", "rules.yaml")
	c, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(c.Rules()) < 10 {
		t.Errorf("expected ≥10 rules from production config, got %d", len(c.Rules()))
	}
	// Spot-check a few well-known rules
	r := c.Classify(Input{Filename: "README.md"})
	if r.Category != "document" || !strings.Contains(r.Subcategory, "readme") {
		t.Errorf("README.md should classify as readme, got %+v", r)
	}
}
