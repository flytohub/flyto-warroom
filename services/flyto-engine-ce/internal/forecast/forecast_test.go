package forecast

import (
	"math"
	"testing"
	"time"
)

func TestForecast_FlatHistoryPredictsFlat(t *testing.T) {
	// 14 days of identical scores → forecast should be flat at
	// that value, with a small (but non-zero) confidence band.
	now := time.Date(2026, 5, 18, 0, 0, 0, 0, time.UTC)
	pts := make([]Point, 14)
	for i := range pts {
		pts[i] = Point{T: now.AddDate(0, 0, -14+i), Value: 720}
	}
	out := Forecast(pts, 7)
	if len(out) != 7 {
		t.Fatalf("want 7 predictions, got %d", len(out))
	}
	for _, p := range out {
		if math.Abs(p.Value-720) > 1 {
			t.Errorf("flat input should predict flat ~720, got %v", p.Value)
		}
		if p.Upper < p.Value || p.Lower > p.Value {
			t.Errorf("bracketing wrong: lower=%v value=%v upper=%v",
				p.Lower, p.Value, p.Upper)
		}
	}
}

func TestForecast_TrendUp(t *testing.T) {
	// Linear ramp from 600 → 700 over 30 days. Forecast should
	// continue the upward trend.
	now := time.Date(2026, 5, 18, 0, 0, 0, 0, time.UTC)
	pts := make([]Point, 30)
	for i := range pts {
		pts[i] = Point{
			T:     now.AddDate(0, 0, -30+i),
			Value: 600 + float64(i)*100.0/30.0,
		}
	}
	out := Forecast(pts, 7)
	if len(out) != 7 {
		t.Fatalf("want 7 predictions, got %d", len(out))
	}
	// Last input was ~699; 7 days later linear extrapolation
	// should push past 720 but stay reasonable.
	last := out[len(out)-1].Value
	if last < 710 || last > 760 {
		t.Errorf("upward trend should continue past 710 (≤760), got %v", last)
	}
}

func TestForecast_TooFewPoints(t *testing.T) {
	pts := []Point{
		{T: time.Now(), Value: 700},
		{T: time.Now().Add(24 * time.Hour), Value: 720},
	}
	if got := Forecast(pts, 7); got != nil {
		t.Errorf("want nil on <7 points, got %v", got)
	}
}

func TestForecast_BandWidensWithHorizon(t *testing.T) {
	// Noisy 14-day series → band on day-7 should be wider than
	// band on day-1 (σ·sqrt(k) scaling).
	now := time.Date(2026, 5, 18, 0, 0, 0, 0, time.UTC)
	pts := make([]Point, 14)
	for i := range pts {
		// alternating 700 / 720 — pure noise after detrend
		val := 700.0
		if i%2 == 1 {
			val = 720
		}
		pts[i] = Point{T: now.AddDate(0, 0, -14+i), Value: val}
	}
	out := Forecast(pts, 7)
	if len(out) < 2 {
		t.Fatal("need ≥ 2 predictions for this test")
	}
	day1Width := out[0].Upper - out[0].Lower
	day7Width := out[6].Upper - out[6].Lower
	if day7Width <= day1Width {
		t.Errorf("day7 band (%v) should be wider than day1 (%v)",
			day7Width, day1Width)
	}
}

func TestForecast_ScoreClampedToRange(t *testing.T) {
	// Aggressive negative trend should be clamped to 0.
	now := time.Date(2026, 5, 18, 0, 0, 0, 0, time.UTC)
	pts := make([]Point, 14)
	for i := range pts {
		pts[i] = Point{T: now.AddDate(0, 0, -14+i), Value: 50.0 - float64(i)*5}
	}
	out := Forecast(pts, 10)
	for _, p := range out {
		if p.Value < 0 || p.Value > 1000 {
			t.Errorf("score must be clamped to [0,1000], got %v", p.Value)
		}
		if p.Lower < 0 || p.Upper > 1000 {
			t.Errorf("band must be clamped, got lower=%v upper=%v", p.Lower, p.Upper)
		}
	}
}

func TestNormalizeToDaily(t *testing.T) {
	day := time.Date(2026, 5, 18, 0, 0, 0, 0, time.UTC)
	pts := []Point{
		{T: day.Add(2 * time.Hour), Value: 700},
		{T: day.Add(14 * time.Hour), Value: 740}, // same day
		{T: day.AddDate(0, 0, 1), Value: 750},
	}
	out := normalizeToDaily(pts)
	if len(out) != 2 {
		t.Fatalf("want 2 daily buckets, got %d", len(out))
	}
	if math.Abs(out[0].Value-720) > 0.01 {
		t.Errorf("day-1 mean should be 720, got %v", out[0].Value)
	}
}
