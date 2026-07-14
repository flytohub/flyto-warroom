package forecast

// Package forecast — pure-math time-series forecasting for the
// ScoreTrends view. The user-facing question is "given my past N
// days of unified score, where will it land in the next 30 days?"
//
// Why we hand-roll this instead of pulling a stats library:
//
//   1. Explainability. Operators have to defend the predicted line
//      to executives — "linear trend + weekday cycle" is something
//      they can explain; ARIMA / Prophet is a black box that
//      surprises everyone.
//   2. Bounded inputs. We forecast scores in [0, 1000] over at most
//      365 daily points. A 50-line implementation is plenty.
//   3. No CGo / external deps. The engine ships as a static Linux
//      binary; adding an ML dep doubles container size.
//
// Method:
//
//   y(t) = intercept + slope·t + seasonal(t mod 7)
//
// Fit:
//
//   1. Decompose by removing the day-of-week mean from each
//      observation, leaving the trend residual.
//   2. Ordinary least squares on the residual gives slope + intercept.
//   3. Per-day-of-week mean of (observation - linear_fit) is the
//      seasonal kernel.
//
// Confidence band:
//
//   ±1.96·σ where σ is the residual standard deviation. Bands widen
//   linearly with forecast horizon (each step adds the residual
//   variance). Conservative but explainable.

import (
	"math"
	"time"
)

// Point is one observation in the input series. T is calendar
// time; the math layer normalises to days-since-first internally.
type Point struct {
	T     time.Time
	Value float64
}

// Prediction is one point in the output forecast. Lower/Upper
// bracket the 95% confidence band; for callers that don't render
// uncertainty, Value alone is the central estimate.
type Prediction struct {
	T     time.Time `json:"t"`
	Value float64   `json:"value"`
	Lower float64   `json:"lower"`
	Upper float64   `json:"upper"`
}

// Forecast fits the model on `history` and returns `nAhead`
// predictions stepping forward at the median observation interval.
// Empty/short history (< 7 points) returns nil — operators see
// "not enough data yet" instead of a wild guess.
func Forecast(history []Point, nAhead int) []Prediction {
	if len(history) < 7 || nAhead <= 0 {
		return nil
	}

	// Sort + dedupe by day (multiple scans/day collapse to the
	// average). The seasonal kernel needs at least one full week
	// to be stable — fewer than 7 distinct days short-circuits.
	pts := normalizeToDaily(history)
	if len(pts) < 7 {
		return nil
	}

	t0 := pts[0].T
	xs := make([]float64, len(pts))
	ys := make([]float64, len(pts))
	for i, p := range pts {
		xs[i] = p.T.Sub(t0).Hours() / 24.0
		ys[i] = p.Value
	}

	// First pass: OLS for trend (intercept + slope).
	slope, intercept := linearFit(xs, ys)

	// Seasonal kernel — average residual per day-of-week.
	seasonal := [7]float64{}
	seasonalCount := [7]int{}
	for i, p := range pts {
		resid := ys[i] - (intercept + slope*xs[i])
		dow := int(p.T.Weekday())
		seasonal[dow] += resid
		seasonalCount[dow]++
	}
	for d := 0; d < 7; d++ {
		if seasonalCount[d] > 0 {
			seasonal[d] /= float64(seasonalCount[d])
		}
	}

	// Residual standard deviation (after removing trend + season).
	sumSq := 0.0
	for i, p := range pts {
		fitted := intercept + slope*xs[i] + seasonal[int(p.T.Weekday())]
		d := ys[i] - fitted
		sumSq += d * d
	}
	sigma := math.Sqrt(sumSq / float64(len(pts)))

	// Generate predictions stepping one day at a time. Band widens
	// with horizon as σ·sqrt(steps_ahead) — each step adds
	// variance, not standard deviation, so the +1 is correct.
	out := make([]Prediction, 0, nAhead)
	lastT := pts[len(pts)-1].T
	lastX := xs[len(xs)-1]
	for k := 1; k <= nAhead; k++ {
		t := lastT.AddDate(0, 0, k)
		x := lastX + float64(k)
		base := intercept + slope*x + seasonal[int(t.Weekday())]
		// 1.96 = 95% confidence under normal residuals. Multiply
		// by sqrt(k) so day-30 band is wider than day-1.
		halfWidth := 1.96 * sigma * math.Sqrt(float64(k))
		out = append(out, Prediction{
			T:     t,
			Value: clampScore(base),
			Lower: clampScore(base - halfWidth),
			Upper: clampScore(base + halfWidth),
		})
	}
	return out
}

// normalizeToDaily collapses multi-per-day points to the day's mean.
// Returns sorted-by-day. Preserves the time-of-day of the FIRST
// observation per day (so day index math stays integer).
func normalizeToDaily(pts []Point) []Point {
	if len(pts) == 0 {
		return nil
	}
	type bucket struct {
		t   time.Time
		sum float64
		n   int
	}
	byDay := map[string]*bucket{}
	var keys []string
	for _, p := range pts {
		d := p.T.Truncate(24 * time.Hour)
		k := d.Format("2006-01-02")
		b, ok := byDay[k]
		if !ok {
			b = &bucket{t: d}
			byDay[k] = b
			keys = append(keys, k)
		}
		b.sum += p.Value
		b.n++
	}
	// Sort keys ascending (RFC3339 date prefix sorts lexically).
	// Tiny N, in-place insertion sort.
	for i := 1; i < len(keys); i++ {
		for j := i; j > 0 && keys[j-1] > keys[j]; j-- {
			keys[j-1], keys[j] = keys[j], keys[j-1]
		}
	}
	out := make([]Point, 0, len(keys))
	for _, k := range keys {
		b := byDay[k]
		out = append(out, Point{T: b.t, Value: b.sum / float64(b.n)})
	}
	return out
}

// linearFit returns (slope, intercept) of OLS regression y ~ x.
// Handles degenerate cases (zero variance) by returning slope=0.
func linearFit(xs, ys []float64) (slope, intercept float64) {
	n := float64(len(xs))
	if n == 0 {
		return 0, 0
	}
	var sumX, sumY, sumXY, sumX2 float64
	for i := range xs {
		sumX += xs[i]
		sumY += ys[i]
		sumXY += xs[i] * ys[i]
		sumX2 += xs[i] * xs[i]
	}
	denom := n*sumX2 - sumX*sumX
	if denom == 0 {
		// All x identical — return the mean as the intercept.
		return 0, sumY / n
	}
	slope = (n*sumXY - sumX*sumY) / denom
	intercept = (sumY - slope*sumX) / n
	return slope, intercept
}

func clampScore(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1000 {
		return 1000
	}
	return v
}
