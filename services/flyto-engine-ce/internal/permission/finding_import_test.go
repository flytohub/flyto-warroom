package permission

// finding_import_test.go — audit AUTH-WRITE. Importing an external scanner's
// findings (SARIF / Trivy-JSON) upserts authoritative code_alerts rows that
// drive SLA / scoring / remediation, so the finding:import action must be
// admin+ ONLY. A member must not hold it — otherwise the import handler (gated
// on this action) would let a member inject arbitrary findings into the
// consolidation layer.

import "testing"

func TestFindingImport_IsAdminOnly(t *testing.T) {
	const action = "finding:import"
	cases := []struct {
		role Role
		want bool
	}{
		{RoleGuest, false},
		{RoleViewer, false},
		{RoleMember, false}, // the trust boundary this gate establishes
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
