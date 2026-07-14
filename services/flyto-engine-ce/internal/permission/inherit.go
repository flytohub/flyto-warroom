package permission

// Permission inheritance — Workspace → Project → Folder → Resource cascade.
//
// Each layer of the hierarchy can declare a Visibility and Sensitivity. The
// effective policy applied to an access check is the *narrowest* combination
// across the chain: visibility narrows downward (more restrictive wins),
// sensitivity widens upward (more sensitive wins). This guarantees that
// no inner layer can ever GRANT access that an outer layer denied.
//
// Why both? Visibility says "who can see this at all". Sensitivity says "what
// extra controls (audit, MFA, encryption) apply once they can see it". Both
// signals must propagate along the chain — visibility to clamp who's in the
// audience, sensitivity to ensure the strictest classification anywhere in
// the chain wins.

// LayerPolicy is the per-level (workspace / project / folder / resource)
// declaration. Empty strings mean "inherit from outer layer" — they do not
// participate in narrowing.
type LayerPolicy struct {
	Visibility  Visibility
	Sensitivity Sensitivity
}

// EffectivePolicy is the resolved (Visibility, Sensitivity) after cascading.
type EffectivePolicy struct {
	Visibility  Visibility
	Sensitivity Sensitivity
}

// PolicyChain represents the full inheritance stack. Workspace is required;
// inner layers (Project / Folder / Resource) are optional and skipped when
// both their fields are empty.
type PolicyChain struct {
	Workspace LayerPolicy
	Project   LayerPolicy
	Folder    LayerPolicy
	Resource  LayerPolicy
}

// Resolve cascades the chain into a single EffectivePolicy.
//
// Rules:
//   - Visibility: pick the most restrictive across all non-empty layers.
//     Order from least → most restrictive:
//     public → workspace → project → private → restricted.
//   - Sensitivity: pick the highest classification across all non-empty layers.
//     Order from least → most sensitive: open → internal → confidential → secret.
//
// If the workspace itself sets nothing, defaults are visibility=workspace,
// sensitivity=open. (Pure unrestricted access requires a deliberate "public"
// declaration somewhere in the chain.)
func (c PolicyChain) Resolve() EffectivePolicy {
	eff := EffectivePolicy{
		Visibility:  defaultVisibility(c.Workspace.Visibility),
		Sensitivity: defaultSensitivity(c.Workspace.Sensitivity),
	}
	for _, layer := range []LayerPolicy{c.Project, c.Folder, c.Resource} {
		if layer.Visibility != "" && visibilityRank(layer.Visibility) > visibilityRank(eff.Visibility) {
			eff.Visibility = layer.Visibility
		}
		if layer.Sensitivity != "" && sensitivityRank(layer.Sensitivity) > sensitivityRank(eff.Sensitivity) {
			eff.Sensitivity = layer.Sensitivity
		}
	}
	return eff
}

// AccessRequestChain is the same as AccessRequest but accepts a PolicyChain
// instead of a single Visibility/Sensitivity, and resolves before delegating
// to ResolveAccess.
type AccessRequestChain struct {
	UserRole        Role
	Chain           PolicyChain
	IsProjectMember bool
	IsOwner         bool
}

// ResolveAccessChain resolves the chain and runs the standard access check.
func ResolveAccessChain(req AccessRequestChain) AccessResult {
	eff := req.Chain.Resolve()
	return ResolveAccess(AccessRequest{
		UserRole:        req.UserRole,
		Visibility:      eff.Visibility,
		Sensitivity:     eff.Sensitivity,
		IsProjectMember: req.IsProjectMember,
		IsOwner:         req.IsOwner,
	})
}

// ----------------------------------------------------------------------------
// Ranking — higher number = more restrictive / sensitive
// ----------------------------------------------------------------------------

func visibilityRank(v Visibility) int {
	switch v {
	case VisibilityPublic:
		return 0
	case VisibilityWorkspace:
		return 1
	case VisibilityProject:
		return 2
	case VisibilityPrivate:
		return 3
	case VisibilityRestricted:
		return 4
	}
	return 1 // unknown → treat as workspace
}

func sensitivityRank(s Sensitivity) int {
	switch s {
	case SensitivityOpen:
		return 0
	case SensitivityInternal:
		return 1
	case SensitivityConfidential:
		return 2
	case SensitivitySecret:
		return 3
	}
	return 0
}

func defaultVisibility(v Visibility) Visibility {
	if v == "" {
		return VisibilityWorkspace
	}
	return v
}

func defaultSensitivity(s Sensitivity) Sensitivity {
	if s == "" {
		return SensitivityOpen
	}
	return s
}
