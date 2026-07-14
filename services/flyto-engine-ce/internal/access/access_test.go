package access

import "testing"

func TestRequire_AllowsFeatureAndAction(t *testing.T) {
	dec := Require(Request{
		Principal: Principal{
			UserID:      "u1",
			Features:    []string{"surface_external"},
			Permissions: []string{ActionSurfaceReadExternal},
		},
		ScopeType:       ScopeOrg,
		ScopeID:         "org1",
		RequiredFeature: "surface_external",
		Action:          ActionSurfaceReadExternal,
		Resource:        Resource{Surface: SurfaceExternal},
	})
	if !dec.Allow {
		t.Fatalf("expected allow, got %+v", dec)
	}
}

func TestRequire_DeniesMissingFeature(t *testing.T) {
	dec := Require(Request{
		Principal: Principal{
			UserID:      "u1",
			Permissions: []string{ActionSurfaceReadCloud},
		},
		ScopeType:       ScopeOrg,
		ScopeID:         "org1",
		RequiredFeature: "surface_cloud",
		Action:          ActionSurfaceReadCloud,
		Resource:        Resource{Surface: SurfaceCloud},
	})
	if dec.Allow || dec.Reason != "feature_required" || dec.RequiredFeature != "surface_cloud" {
		t.Fatalf("unexpected decision: %+v", dec)
	}
}

func TestRequire_DeniesSensitiveWithoutAction(t *testing.T) {
	dec := Require(Request{
		Principal: Principal{
			UserID:      "u1",
			Features:    []string{"surface_code"},
			Permissions: []string{ActionSurfaceReadCode},
		},
		ScopeType:       ScopeOrg,
		ScopeID:         "org1",
		RequiredFeature: "surface_code",
		Action:          ActionSurfaceReadCode,
		Resource:        Resource{Surface: SurfaceCode, Sensitivity: "secret"},
	})
	if dec.Allow || dec.Reason != "sensitive_evidence_required" {
		t.Fatalf("unexpected decision: %+v", dec)
	}
}
