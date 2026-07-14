package permission

// external_ingest_test.go — audit AUTH-WRITE #4. Bulk-ingesting an external
// vendor rating feed (Bitsight) writes authoritative kernel state, so the
// external:ingest action must be admin+ ONLY. A member must not hold it —
// otherwise the Bitsight ingest handler (gated on this action) would let a
// member inject arbitrary third-party "facts" into the kernel.

import "testing"

func TestExternalIngest_IsAdminOnly(t *testing.T) {
	const action = "external:ingest"
	cases := []struct {
		role Role
		want bool
	}{
		{RoleGuest, false},
		{RoleViewer, false},
		{RoleMember, false}, // the boundary the fix establishes
		{RoleAdmin, true},
		{RoleOwner, true},
	}
	for _, c := range cases {
		caps, err := Resolve(TierCode, PlanFree, c.role, nil)
		if err != nil {
			t.Fatalf("Resolve(%s): %v", c.role, err)
		}
		if got := HasAction(caps, action); got != c.want {
			t.Errorf("role %s: HasAction(%q) = %v, want %v", c.role, action, got, c.want)
		}
	}
}
