package stats

import "testing"

func TestPercentile_Basic(t *testing.T) {
	sorted := []float64{10, 20, 30, 40, 50, 60, 70, 80, 90, 100}
	cases := []struct {
		p    int
		want float64
	}{
		{0, 10},
		{25, 30},
		{50, 50},
		{75, 80},
		{90, 90},
		{95, 100},
		{100, 100},
	}
	for _, c := range cases {
		if got := Percentile(sorted, c.p); got != c.want {
			t.Errorf("P%d: want %v got %v", c.p, c.want, got)
		}
	}
}

func TestPercentile_Empty(t *testing.T) {
	if Percentile(nil, 50) != 0 {
		t.Error("empty should return 0")
	}
}

func TestPercentile_Single(t *testing.T) {
	if Percentile([]float64{42}, 50) != 42 {
		t.Error("single-element should return that element")
	}
}

func TestPercentile_OutOfRangeClamps(t *testing.T) {
	sorted := []float64{1, 2, 3}
	if Percentile(sorted, -10) != 1 {
		t.Error("negative p should clamp to first")
	}
	if Percentile(sorted, 999) != 3 {
		t.Error("p>100 should clamp to last")
	}
}

func TestAverage(t *testing.T) {
	if Average(nil) != 0 {
		t.Error("empty avg should be 0")
	}
	if Average([]float64{10, 20, 30}) != 20 {
		t.Errorf("want 20, got %v", Average([]float64{10, 20, 30}))
	}
}
