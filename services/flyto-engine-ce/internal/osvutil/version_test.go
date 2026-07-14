package osvutil

import "testing"

func TestSelectFixedVersion_MultipleRangesSelectsCurrentRange(t *testing.T) {
	ranges := [][]Event{
		{{Introduced: "0.9.0"}, {Fixed: "0.9.3"}},
		{{Introduced: "0.10.0"}, {Fixed: "0.10.1"}},
		{{Introduced: "0.7.0"}, {Fixed: "0.8.6"}},
	}
	if got := SelectFixedVersion("0.8.5", ranges); got != "0.8.6" {
		t.Fatalf("SelectFixedVersion(0.8.5) = %q, want 0.8.6", got)
	}
	if got := SelectFixedVersion("0.9.2", ranges); got != "0.9.3" {
		t.Fatalf("SelectFixedVersion(0.9.2) = %q, want 0.9.3", got)
	}
}

func TestSelectFixedVersion_CombinedIntroducedFixedEvents(t *testing.T) {
	ranges := [][]Event{{
		{Introduced: "0.7.0"},
		{Fixed: "0.8.6"},
		{Introduced: "0.9.0"},
		{Fixed: "0.9.3"},
		{Introduced: "0.10.0"},
		{Fixed: "0.10.1"},
	}}
	if got := SelectFixedVersion("0.8.5", ranges); got != "0.8.6" {
		t.Fatalf("SelectFixedVersion(0.8.5) = %q, want 0.8.6", got)
	}
	if got := SelectFixedVersion("0.9.1", ranges); got != "0.9.3" {
		t.Fatalf("SelectFixedVersion(0.9.1) = %q, want 0.9.3", got)
	}
}

func TestSafeBumpTarget_MajorZeroStaysOnMinorLine(t *testing.T) {
	if !SafeBumpTarget("0.8.5", "0.8.6") {
		t.Fatal("0.8.5 -> 0.8.6 should be safe")
	}
	if SafeBumpTarget("0.8.5", "0.9.3") {
		t.Fatal("0.8.5 -> 0.9.3 should not be treated as safe")
	}
	if !SafeBumpTarget("1.8.5", "1.9.3") {
		t.Fatal("1.8.5 -> 1.9.3 should stay on the same major line")
	}
}
