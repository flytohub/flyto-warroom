package severity

import "testing"

func TestNormalize(t *testing.T) {
	cases := []struct {
		in   string
		want Level
	}{
		{"CRITICAL", Critical},
		{"critical", Critical},
		{" High ", High},
		{"MEDIUM", Medium},
		{"MODERATE", Medium}, // GitHub vocabulary alias
		{"moderate", Medium},
		{"LOW", Low},
		{"INFO", Info},
		{"INFORMATIONAL", Info},
		{"", Medium},    // empty → Medium (don't drop)
		{"???", Medium}, // unknown → Medium
		{"category:critical_sql_injection", Critical}, // taint-category alias
		{"high-confidence", High},
	}
	for _, tc := range cases {
		got := Normalize(tc.in)
		if got != tc.want {
			t.Errorf("Normalize(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestRankOrdering(t *testing.T) {
	if Rank(Critical) <= Rank(High) {
		t.Error("Critical must rank higher than High")
	}
	if Rank(High) <= Rank(Medium) {
		t.Error("High must rank higher than Medium")
	}
	if Rank(Medium) <= Rank(Low) {
		t.Error("Medium must rank higher than Low")
	}
	if Rank(Low) <= Rank(Info) {
		t.Error("Low must rank higher than Info")
	}
}

func TestAtLeast(t *testing.T) {
	if !AtLeast(Critical, High) {
		t.Error("Critical should satisfy AtLeast(High)")
	}
	if AtLeast(Low, High) {
		t.Error("Low should not satisfy AtLeast(High)")
	}
	if !AtLeast(High, High) {
		t.Error("High should satisfy AtLeast(High) — boundary inclusive")
	}
}
