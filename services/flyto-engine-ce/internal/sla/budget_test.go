package sla

import (
	"testing"
	"time"
)

func TestComputeUsage_HealthyAndWarning(t *testing.T) {
	now := time.Date(2026, 5, 18, 0, 0, 0, 0, time.UTC)
	policies := []PolicyInput{
		{Severity: "critical", AllowedBreaches: 4, WindowDays: 90, AlertAtPercent: 75, IsActive: true},
	}

	// One breach 30 days ago — 25% used, well under the 75% alert.
	breaches := []Breach{
		{Severity: "critical", BreachAt: now.AddDate(0, 0, -30)},
	}
	usage := ComputeUsage(policies, breaches, now)
	if len(usage) != 1 || usage[0].Status != "healthy" {
		t.Fatalf("want healthy with 1 used out of 4, got %+v", usage)
	}
	if usage[0].UsedBreaches != 1 || usage[0].RemainingBreaches != 3 {
		t.Errorf("usage counts off: %+v", usage[0])
	}

	// Three breaches → 75% used, hits the alert threshold.
	breaches = append(breaches,
		Breach{Severity: "critical", BreachAt: now.AddDate(0, 0, -10)},
		Breach{Severity: "critical", BreachAt: now.AddDate(0, 0, -5)},
	)
	usage = ComputeUsage(policies, breaches, now)
	if usage[0].Status != "warning" {
		t.Errorf("3/4 should be warning, got %s", usage[0].Status)
	}
}

func TestComputeUsage_Exhausted(t *testing.T) {
	now := time.Now().UTC()
	policies := []PolicyInput{
		{Severity: "high", AllowedBreaches: 2, WindowDays: 90, AlertAtPercent: 80, IsActive: true},
	}
	breaches := []Breach{
		{Severity: "high", BreachAt: now.AddDate(0, 0, -1)},
		{Severity: "high", BreachAt: now.AddDate(0, 0, -2)},
	}
	usage := ComputeUsage(policies, breaches, now)
	if usage[0].Status != "exhausted" {
		t.Errorf("equal-to-allowance should be exhausted, got %s", usage[0].Status)
	}
	if usage[0].RemainingBreaches != 0 {
		t.Errorf("remaining should be 0 on exhausted, got %d", usage[0].RemainingBreaches)
	}
}

func TestComputeUsage_WindowExclusion(t *testing.T) {
	now := time.Now().UTC()
	policies := []PolicyInput{
		{Severity: "critical", AllowedBreaches: 2, WindowDays: 30, AlertAtPercent: 80, IsActive: true},
	}
	breaches := []Breach{
		{Severity: "critical", BreachAt: now.AddDate(0, 0, -60)}, // outside 30d
		{Severity: "critical", BreachAt: now.AddDate(0, 0, -10)}, // inside
	}
	usage := ComputeUsage(policies, breaches, now)
	if usage[0].UsedBreaches != 1 {
		t.Errorf("breach outside window must not count, got used=%d", usage[0].UsedBreaches)
	}
}

func TestComputeUsage_InactiveShortCircuits(t *testing.T) {
	now := time.Now().UTC()
	policies := []PolicyInput{
		{Severity: "low", AllowedBreaches: 5, WindowDays: 90, IsActive: false},
	}
	breaches := []Breach{{Severity: "low", BreachAt: now}}
	usage := ComputeUsage(policies, breaches, now)
	if usage[0].Status != "inactive" {
		t.Errorf("inactive policy should report inactive, got %s", usage[0].Status)
	}
}

func TestComputeUsage_ZeroToleranceAnyBreachExhausts(t *testing.T) {
	now := time.Now().UTC()
	policies := []PolicyInput{
		{Severity: "critical", AllowedBreaches: 0, WindowDays: 90, IsActive: true},
	}
	noBreaches := ComputeUsage(policies, nil, now)
	if noBreaches[0].Status != "healthy" {
		t.Errorf("zero-tolerance + zero breaches should be healthy, got %s", noBreaches[0].Status)
	}
	withBreach := ComputeUsage(policies, []Breach{{Severity: "critical", BreachAt: now}}, now)
	if withBreach[0].Status != "exhausted" {
		t.Errorf("zero-tolerance + 1 breach should be exhausted, got %s", withBreach[0].Status)
	}
	if withBreach[0].UsedPercent != 100.0 {
		t.Errorf("zero-tolerance over budget should report 100%%, got %v", withBreach[0].UsedPercent)
	}
}

func TestComputeUsage_SortBySeverityRank(t *testing.T) {
	now := time.Now().UTC()
	policies := []PolicyInput{
		{Severity: "low", AllowedBreaches: 5, WindowDays: 90, IsActive: true},
		{Severity: "critical", AllowedBreaches: 2, WindowDays: 90, IsActive: true},
		{Severity: "high", AllowedBreaches: 3, WindowDays: 90, IsActive: true},
	}
	usage := ComputeUsage(policies, nil, now)
	if len(usage) != 3 {
		t.Fatalf("want 3 rows, got %d", len(usage))
	}
	want := []string{"critical", "high", "low"}
	for i, sev := range want {
		if usage[i].Severity != sev {
			t.Errorf("position %d: want %s got %s", i, sev, usage[i].Severity)
		}
	}
}
