// Package scheduler provides time-bucket helpers so periodic
// workers don't process every customer in one burst.
//
// Discovery loops would naively sweep N orgs every tick — fine when
// N is small but a burst risk at scale. The pattern here assigns
// each org to a stable hour bucket via CRC32(orgID) % buckets, so
// an hourly tick only touches orgs whose bucket matches the current
// hour. Net result: the daily sweep is spread evenly over 24 ticks
// without any per-org cursor or coordination.
//
// The stable hash means a given org always lands in the same bucket
// across worker restarts, which keeps the observable "we ran at 03:00
// last night" pattern consistent for ops.
package scheduler

import (
	"hash/crc32"
	"time"
)

// HourBucket returns the org's stable bucket index in [0, buckets).
// buckets must be > 0; out of range input panics — a misconfigured
// loop is louder than a silently mis-bucketed org.
func HourBucket(orgID string, buckets int) int {
	if buckets <= 0 {
		panic("scheduler.HourBucket: buckets must be > 0")
	}
	if buckets == 1 {
		return 0
	}
	h := crc32.ChecksumIEEE([]byte(orgID))
	return int(h % uint32(buckets))
}

// IsBucketDue reports whether `orgID` should be processed in the
// bucket of the given time. Use with a 1h ticker + buckets=24 to
// process every org once per day, spread across 24 ticks.
func IsBucketDue(orgID string, buckets int, now time.Time) bool {
	currentBucket := now.UTC().Hour() % buckets
	return HourBucket(orgID, buckets) == currentBucket
}

// FilterDueOrgs returns the subset of orgIDs whose bucket matches
// the current hour. Convenience wrapper for the common loop shape:
//
//	for _, orgID := range scheduler.FilterDueOrgs(orgIDs, 24, time.Now()) {
//	    process(orgID)
//	}
//
// Pass buckets=1 to disable staggering (every org every tick) — the
// loop body stays the same so toggling between dev (immediate) and
// prod (spread) is one constant change.
func FilterDueOrgs(orgIDs []string, buckets int, now time.Time) []string {
	if buckets <= 1 {
		return orgIDs
	}
	currentBucket := now.UTC().Hour() % buckets
	out := make([]string, 0, len(orgIDs)/buckets+1)
	for _, id := range orgIDs {
		if HourBucket(id, buckets) == currentBucket {
			out = append(out, id)
		}
	}
	return out
}
