package permission

import "testing"

func TestOwnerCanAccessSecret(t *testing.T) {
	r := ResolveAccess(AccessRequest{UserRole: RoleOwner, Visibility: VisibilityWorkspace, Sensitivity: SensitivitySecret, IsOwner: true})
	if !r.CanAccess {
		t.Error("owner should access secret")
	}
	if !r.AuditRequired {
		t.Error("secret should require audit")
	}
}

func TestAdminCannotAccessSecret(t *testing.T) {
	r := ResolveAccess(AccessRequest{UserRole: RoleAdmin, Visibility: VisibilityWorkspace, Sensitivity: SensitivitySecret})
	if r.CanAccess {
		t.Error("admin should not access secret")
	}
}

func TestAdminCanAccessConfidential(t *testing.T) {
	r := ResolveAccess(AccessRequest{UserRole: RoleAdmin, Visibility: VisibilityWorkspace, Sensitivity: SensitivityConfidential})
	if !r.CanAccess {
		t.Error("admin should access confidential")
	}
}

func TestMemberCannotAccessConfidential(t *testing.T) {
	r := ResolveAccess(AccessRequest{UserRole: RoleMember, Visibility: VisibilityWorkspace, Sensitivity: SensitivityConfidential})
	if r.CanAccess {
		t.Error("member should not access confidential")
	}
}

func TestProjectVisibilityRequiresMembership(t *testing.T) {
	r := ResolveAccess(AccessRequest{UserRole: RoleMember, Visibility: VisibilityProject, Sensitivity: SensitivityOpen, IsProjectMember: false})
	if r.CanAccess {
		t.Error("should require project membership")
	}
	r2 := ResolveAccess(AccessRequest{UserRole: RoleMember, Visibility: VisibilityProject, Sensitivity: SensitivityOpen, IsProjectMember: true})
	if !r2.CanAccess {
		t.Error("project member should have access")
	}
}

func TestPrivateRequiresOwner(t *testing.T) {
	r := ResolveAccess(AccessRequest{UserRole: RoleAdmin, Visibility: VisibilityPrivate, Sensitivity: SensitivityOpen, IsOwner: false})
	if r.CanAccess {
		t.Error("private should require owner")
	}
}

func TestGuestPublicAccess(t *testing.T) {
	r := ResolveAccess(AccessRequest{UserRole: RoleGuest, Visibility: VisibilityPublic, Sensitivity: SensitivityOpen})
	if !r.CanAccess {
		t.Error("guest should access public")
	}
}

func TestHasPermission(t *testing.T) {
	if !HasPermission(RoleOwner, "resource.view_secret") {
		t.Error("owner should have resource.view_secret")
	}
	if HasPermission(RoleGuest, "resource.upload") {
		t.Error("guest should not have resource.upload")
	}
}
