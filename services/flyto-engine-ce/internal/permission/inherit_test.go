package permission

import "testing"

func TestResolveDefaultsWhenEmpty(t *testing.T) {
	got := PolicyChain{}.Resolve()
	if got.Visibility != VisibilityWorkspace {
		t.Errorf("got %s, want workspace", got.Visibility)
	}
	if got.Sensitivity != SensitivityOpen {
		t.Errorf("got %s, want open", got.Sensitivity)
	}
}

func TestVisibilityNarrowsDownward(t *testing.T) {
	// Workspace says public, but resource says restricted → restricted wins.
	c := PolicyChain{
		Workspace: LayerPolicy{Visibility: VisibilityPublic},
		Resource:  LayerPolicy{Visibility: VisibilityRestricted},
	}
	if got := c.Resolve().Visibility; got != VisibilityRestricted {
		t.Errorf("got %s, want restricted", got)
	}
}

func TestVisibilityNeverWidens(t *testing.T) {
	// Workspace sets restricted; folder/resource cannot widen back to public.
	c := PolicyChain{
		Workspace: LayerPolicy{Visibility: VisibilityRestricted},
		Project:   LayerPolicy{Visibility: VisibilityPublic},
		Folder:    LayerPolicy{Visibility: VisibilityWorkspace},
		Resource:  LayerPolicy{Visibility: VisibilityPublic},
	}
	if got := c.Resolve().Visibility; got != VisibilityRestricted {
		t.Errorf("inner public widened the policy, got %s", got)
	}
}

func TestSensitivityRisesOnly(t *testing.T) {
	// Resource is the only one declaring sensitivity → it's adopted.
	c := PolicyChain{
		Resource: LayerPolicy{Sensitivity: SensitivitySecret},
	}
	if got := c.Resolve().Sensitivity; got != SensitivitySecret {
		t.Errorf("got %s, want secret", got)
	}

	// Workspace says secret, resource says open → secret stays.
	c = PolicyChain{
		Workspace: LayerPolicy{Sensitivity: SensitivitySecret},
		Resource:  LayerPolicy{Sensitivity: SensitivityOpen},
	}
	if got := c.Resolve().Sensitivity; got != SensitivitySecret {
		t.Errorf("inner open should not lower sensitivity, got %s", got)
	}
}

func TestEmptyLayersIgnored(t *testing.T) {
	// Folder has empty fields — the chain should skip it without effect.
	c := PolicyChain{
		Workspace: LayerPolicy{Visibility: VisibilityWorkspace, Sensitivity: SensitivityInternal},
		Folder:    LayerPolicy{},
		Resource:  LayerPolicy{Visibility: VisibilityProject},
	}
	got := c.Resolve()
	if got.Visibility != VisibilityProject {
		t.Errorf("visibility: got %s", got.Visibility)
	}
	if got.Sensitivity != SensitivityInternal {
		t.Errorf("sensitivity: got %s", got.Sensitivity)
	}
}

func TestResolveAccessChainDeniesGuestOnConfidential(t *testing.T) {
	res := ResolveAccessChain(AccessRequestChain{
		UserRole: RoleGuest,
		Chain: PolicyChain{
			Workspace: LayerPolicy{Visibility: VisibilityWorkspace},
			Resource:  LayerPolicy{Sensitivity: SensitivityConfidential},
		},
	})
	if res.CanAccess {
		t.Errorf("guest must not see confidential, got %+v", res)
	}
	if !res.AuditRequired {
		t.Errorf("confidential access attempts must be audited, got %+v", res)
	}
}

func TestResolveAccessChainAllowsAdminOnConfidential(t *testing.T) {
	res := ResolveAccessChain(AccessRequestChain{
		UserRole: RoleAdmin,
		Chain: PolicyChain{
			Workspace: LayerPolicy{Visibility: VisibilityWorkspace},
			Resource:  LayerPolicy{Sensitivity: SensitivityConfidential},
		},
	})
	if !res.CanAccess {
		t.Errorf("admin should access confidential, got %+v", res)
	}
	if !res.AuditRequired {
		t.Errorf("confidential always audits, got %+v", res)
	}
}

func TestResolveAccessChainBlocksNonOwnerOnPrivate(t *testing.T) {
	res := ResolveAccessChain(AccessRequestChain{
		UserRole: RoleAdmin,
		Chain: PolicyChain{
			Workspace: LayerPolicy{Visibility: VisibilityWorkspace},
			Resource:  LayerPolicy{Visibility: VisibilityPrivate},
		},
		IsOwner: false,
	})
	if res.CanAccess {
		t.Errorf("non-owner admin should be blocked on private, got %+v", res)
	}
}

func TestResolveAccessChainGrantsOwnerOnPrivate(t *testing.T) {
	res := ResolveAccessChain(AccessRequestChain{
		UserRole: RoleMember,
		Chain: PolicyChain{
			Resource: LayerPolicy{Visibility: VisibilityPrivate},
		},
		IsOwner: true,
	})
	if !res.CanAccess {
		t.Errorf("owner of private should access, got %+v", res)
	}
}

func TestVisibilityRankIsTotalOrdered(t *testing.T) {
	want := []Visibility{VisibilityPublic, VisibilityWorkspace, VisibilityProject, VisibilityPrivate, VisibilityRestricted}
	for i := 1; i < len(want); i++ {
		if visibilityRank(want[i]) <= visibilityRank(want[i-1]) {
			t.Errorf("ranking not monotone: %s(%d) vs %s(%d)",
				want[i-1], visibilityRank(want[i-1]), want[i], visibilityRank(want[i]))
		}
	}
}

func TestSensitivityRankIsTotalOrdered(t *testing.T) {
	want := []Sensitivity{SensitivityOpen, SensitivityInternal, SensitivityConfidential, SensitivitySecret}
	for i := 1; i < len(want); i++ {
		if sensitivityRank(want[i]) <= sensitivityRank(want[i-1]) {
			t.Errorf("ranking not monotone")
		}
	}
}

func TestUnknownVisibilityFallsBackToWorkspace(t *testing.T) {
	if visibilityRank(Visibility("garbage")) != visibilityRank(VisibilityWorkspace) {
		t.Errorf("unknown visibility should rank like workspace")
	}
}

func TestResolveAccessChainWithMixedSensitivityAndVisibility(t *testing.T) {
	// Project sets visibility=project, resource sets sensitivity=secret.
	// Member with project membership but no secret perm should be denied.
	res := ResolveAccessChain(AccessRequestChain{
		UserRole: RoleMember,
		Chain: PolicyChain{
			Project:  LayerPolicy{Visibility: VisibilityProject},
			Resource: LayerPolicy{Sensitivity: SensitivitySecret},
		},
		IsProjectMember: true,
	})
	if res.CanAccess {
		t.Errorf("member without view_secret must be denied, got %+v", res)
	}
}
