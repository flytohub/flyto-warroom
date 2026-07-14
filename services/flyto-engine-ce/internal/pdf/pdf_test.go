package pdf

import (
	"strings"
	"testing"
)

func TestBuild_StructurallyValidPDF(t *testing.T) {
	doc := New("Security Report").
		Heading("Findings").
		Text("This is a reasonably long line of body text that should wrap across the column width without breaking the PDF content stream in any way at all.").
		Blank().
		Text("Another paragraph with a (parenthesis) and a backslash \\ to exercise escaping.")
	out := doc.Build()

	s := string(out)
	if !strings.HasPrefix(s, "%PDF-1.") {
		t.Fatalf("missing PDF header: %q", s[:min(16, len(s))])
	}
	for _, want := range []string{"/Type /Catalog", "/Type /Pages", "/BaseFont /Helvetica", "xref", "trailer", "startxref", "%%EOF"} {
		if !strings.Contains(s, want) {
			t.Errorf("PDF missing %q", want)
		}
	}
	// Escaping must have neutralized the raw "(parenthesis)" into \( \).
	if !strings.Contains(s, `\(parenthesis\)`) {
		t.Error("parenthesis not escaped in content stream")
	}
	if len(out) < 400 {
		t.Errorf("PDF suspiciously small: %d bytes", len(out))
	}
}

func TestBuild_Paginates(t *testing.T) {
	b := New("")
	for i := 0; i < 200; i++ {
		b.Text("line")
	}
	out := string(b.Build())
	// 200 body lines must spill onto multiple pages.
	if c := strings.Count(out, "/Type /Page "); c < 2 {
		// note: "/Type /Pages" also contains "/Type /Page" — guard with trailing space
		t.Errorf("expected multiple pages, found %d page objects", c)
	}
}

func TestFromMarkdown(t *testing.T) {
	out := FromMarkdown("Report", "# Heading\n\n- bullet one\n- bullet two\nplain line")
	s := string(out)
	if !strings.HasPrefix(s, "%PDF-") || !strings.Contains(s, "%%EOF") {
		t.Fatal("FromMarkdown did not produce a valid PDF envelope")
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
