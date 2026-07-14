package scheduler

import (
	"fmt"
	"testing"
	"time"
)

// HourBucket must be stable: same orgID always maps to the same
// bucket so an org's daily sweep stays at the same time of day
// across worker restarts.
func TestHourBucket_Stable(t *testing.T) {
	for i := 0; i < 100; i++ {
		got := HourBucket("org-abc", 24)
		if got != HourBucket("org-abc", 24) {
			t.Fatalf("HourBucket not stable across calls")
		}
		if got < 0 || got >= 24 {
			t.Fatalf("HourBucket=%d out of [0,24)", got)
		}
	}
}

// With buckets=24 and N orgs, FilterDueOrgs across a 24-hour day
// must cover every org exactly once.
func TestFilterDueOrgs_FullDayCoverage(t *testing.T) {
	orgs := make([]string, 100)
	for i := range orgs {
		orgs[i] = fmt.Sprintf("org-%d", i)
	}
	seen := map[string]int{}
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	for h := 0; h < 24; h++ {
		due := FilterDueOrgs(orgs, 24, base.Add(time.Duration(h)*time.Hour))
		for _, id := range due {
			seen[id]++
		}
	}
	if len(seen) != len(orgs) {
		t.Fatalf("coverage gap: %d orgs seen, want %d", len(seen), len(orgs))
	}
	for id, count := range seen {
		if count != 1 {
			t.Errorf("org %s seen %d times in 24h, want 1", id, count)
		}
	}
}

// FilterDueOrgs should spread roughly evenly across buckets — no
// bucket should hold more than 2.5× the average. (CRC32 is not a
// cryptographic hash so we accept some variance.)
func TestFilterDueOrgs_LoadBalanced(t *testing.T) {
	orgs := make([]string, 1000)
	for i := range orgs {
		orgs[i] = fmt.Sprintf("org-%d", i)
	}
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	counts := make([]int, 24)
	for h := 0; h < 24; h++ {
		counts[h] = len(FilterDueOrgs(orgs, 24, base.Add(time.Duration(h)*time.Hour)))
	}
	avg := float64(len(orgs)) / 24
	for h, c := range counts {
		if float64(c) > avg*2.5 {
			t.Errorf("bucket %d has %d orgs, avg=%.1f (>2.5× imbalance)", h, c, avg)
		}
	}
}

// buckets=1 (or 0) must disable staggering — every org every tick.
func TestFilterDueOrgs_BucketsOneDisables(t *testing.T) {
	orgs := []string{"a", "b", "c"}
	got := FilterDueOrgs(orgs, 1, time.Now())
	if len(got) != 3 {
		t.Fatalf("buckets=1 should return all orgs, got %d", len(got))
	}
}
