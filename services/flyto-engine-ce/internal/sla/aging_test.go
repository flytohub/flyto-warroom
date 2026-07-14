package sla

import (
	"testing"
	"time"
)

// fixed reference time so day math is deterministic.
var agingNow = time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)

// daysAgo returns a first_seen `d` days before agingNow.
func daysAgo(d int) time.Time { return agingNow.AddDate(0, 0, -d) }

func TestAgeBucket_Boundaries(t *testing.T) {
	cases := []struct {
		days int
		want string
	}{
		{0, BucketAge0to7},
		{7, BucketAge0to7},   // exactly at boundary stays low
		{8, BucketAge8to30},  // rolls up
		{30, BucketAge8to30}, // boundary
		{31, BucketAge31to90},
		{90, BucketAge31to90}, // boundary
		{91, BucketAge90plus},
		{365, BucketAge90plus},
	}
	for _, c := range cases {
		if got := ageBucket(c.days); got != c.want {
			t.Errorf("ageBucket(%d) = %q, want %q", c.days, got, c.want)
		}
	}
}

func TestAgeBuckets_PerSeverityDistribution(t *testing.T) {
	// All critical, none breached (no SLABreachAt), spread across
	// the four age buckets: 3d, 15d, 60d, 200d.
	findings := []FindingAge{
		{Severity: "critical", FirstSeenAt: daysAgo(3)},
		{Severity: "critical", FirstSeenAt: daysAgo(15)},
		{Severity: "critical", FirstSeenAt: daysAgo(60)},
		{Severity: "critical", FirstSeenAt: daysAgo(200)},
	}
	rep := AgeBuckets(findings, agingNow)

	if rep.TotalOpen != 4 {
		t.Fatalf("TotalOpen = %d, want 4", rep.TotalOpen)
	}
	if rep.TotalBreached != 0 || rep.TotalOverdue != 0 {
		t.Errorf("no SLABreachAt set → breached/overdue should be 0, got %d/%d",
			rep.TotalBreached, rep.TotalOverdue)
	}
	if len(rep.BySeverity) != 1 || rep.BySeverity[0].Severity != "critical" {
		t.Fatalf("want one critical row, got %+v", rep.BySeverity)
	}
	row := rep.BySeverity[0]
	want := map[string]int{
		BucketAge0to7:   1,
		BucketAge8to30:  1,
		BucketAge31to90: 1,
		BucketAge90plus: 1,
	}
	for b, w := range want {
		if row.AgeBuckets[b] != w {
			t.Errorf("AgeBuckets[%s] = %d, want %d", b, row.AgeBuckets[b], w)
		}
	}
	if row.OldestAgeDays != 200 {
		t.Errorf("OldestAgeDays = %d, want 200", row.OldestAgeDays)
	}
	// avg = (3+15+60+200)/4 = 69.5
	if row.AvgAgeDays != 69.5 {
		t.Errorf("AvgAgeDays = %v, want 69.5", row.AvgAgeDays)
	}
	if rep.OldestOpenDays != 200 {
		t.Errorf("OldestOpenDays = %d, want 200", rep.OldestOpenDays)
	}
	if rep.AvgAgeDays != 69.5 {
		t.Errorf("report AvgAgeDays = %v, want 69.5", rep.AvgAgeDays)
	}
}

func TestAgeBuckets_OverdueMathAndBuckets(t *testing.T) {
	// A high finding first seen 20d ago with a 7d SLA → breach_at
	// was 13 days ago → overdue 13 days → "8-30" overdue bucket.
	breachAt := daysAgo(13)
	// A critical first seen 100d ago, breach_at 95d ago → overdue
	// 95 days → "90+" overdue bucket.
	breachAtCrit := daysAgo(95)
	// A high finding with SLABreachAt in the FUTURE → not breached.
	future := agingNow.AddDate(0, 0, 5)

	findings := []FindingAge{
		{Severity: "high", FirstSeenAt: daysAgo(20), SLABreachAt: breachAt},
		{Severity: "critical", FirstSeenAt: daysAgo(100), SLABreachAt: breachAtCrit},
		{Severity: "high", FirstSeenAt: daysAgo(2), SLABreachAt: future},
	}
	rep := AgeBuckets(findings, agingNow)

	if rep.TotalOpen != 3 {
		t.Fatalf("TotalOpen = %d, want 3", rep.TotalOpen)
	}
	if rep.TotalBreached != 2 || rep.TotalOverdue != 2 {
		t.Errorf("want 2 breached/overdue (future one excluded), got %d/%d",
			rep.TotalBreached, rep.TotalOverdue)
	}

	// critical sorts first.
	if rep.BySeverity[0].Severity != "critical" {
		t.Fatalf("critical should sort first, got %s", rep.BySeverity[0].Severity)
	}
	crit := rep.BySeverity[0]
	if crit.OverdueBuckets[BucketAge90plus] != 1 {
		t.Errorf("critical overdue 95d should be in 90+, got %+v", crit.OverdueBuckets)
	}
	if crit.OverdueCount != 1 {
		t.Errorf("critical OverdueCount = %d, want 1", crit.OverdueCount)
	}

	var high SeverityAging
	for _, r := range rep.BySeverity {
		if r.Severity == "high" {
			high = r
		}
	}
	if high.OpenCount != 2 {
		t.Errorf("high OpenCount = %d, want 2", high.OpenCount)
	}
	if high.BreachedCount != 1 {
		t.Errorf("high BreachedCount = %d, want 1 (future-breach excluded)", high.BreachedCount)
	}
	if high.OverdueBuckets[BucketAge8to30] != 1 {
		t.Errorf("high overdue 13d should be in 8-30, got %+v", high.OverdueBuckets)
	}
}

func TestAgeBuckets_ResolvedExcluded(t *testing.T) {
	findings := []FindingAge{
		{Severity: "low", FirstSeenAt: daysAgo(500), Resolved: true},
		{Severity: "low", FirstSeenAt: daysAgo(500), SLABreachAt: daysAgo(400), Resolved: true},
		{Severity: "low", FirstSeenAt: daysAgo(5)},
	}
	rep := AgeBuckets(findings, agingNow)
	if rep.TotalOpen != 1 {
		t.Errorf("resolved should be excluded → TotalOpen = %d, want 1", rep.TotalOpen)
	}
	if rep.TotalBreached != 0 {
		t.Errorf("resolved breached should not count → TotalBreached = %d, want 0", rep.TotalBreached)
	}
	if len(rep.BySeverity) != 1 || rep.BySeverity[0].OpenCount != 1 {
		t.Errorf("want single low row open=1, got %+v", rep.BySeverity)
	}
}

func TestAgeBuckets_ExactlyAtBreachBoundaryNotOverdue(t *testing.T) {
	// SLABreachAt == now exactly → now.After(breachAt) is false →
	// not yet overdue (deadline is the last good moment).
	findings := []FindingAge{
		{Severity: "medium", FirstSeenAt: daysAgo(30), SLABreachAt: agingNow},
	}
	rep := AgeBuckets(findings, agingNow)
	if rep.TotalBreached != 0 {
		t.Errorf("breach_at == now should NOT be overdue, got breached=%d", rep.TotalBreached)
	}
}

func TestAgeBuckets_Empty(t *testing.T) {
	rep := AgeBuckets(nil, agingNow)
	if rep.TotalOpen != 0 || len(rep.BySeverity) != 0 {
		t.Errorf("empty input → empty report, got %+v", rep)
	}
	if rep.AvgAgeDays != 0 || rep.OldestOpenDays != 0 {
		t.Errorf("empty → zero avg/oldest, got %v / %d", rep.AvgAgeDays, rep.OldestOpenDays)
	}
}

func TestAgeBuckets_SeverityNormalization(t *testing.T) {
	// "Moderate" → medium; uppercase + spaces normalised.
	findings := []FindingAge{
		{Severity: " Moderate ", FirstSeenAt: daysAgo(5)},
		{Severity: "MEDIUM", FirstSeenAt: daysAgo(6)},
	}
	rep := AgeBuckets(findings, agingNow)
	if len(rep.BySeverity) != 1 || rep.BySeverity[0].Severity != "medium" {
		t.Fatalf("moderate+MEDIUM should collapse to one medium row, got %+v", rep.BySeverity)
	}
	if rep.BySeverity[0].OpenCount != 2 {
		t.Errorf("collapsed OpenCount = %d, want 2", rep.BySeverity[0].OpenCount)
	}
}
