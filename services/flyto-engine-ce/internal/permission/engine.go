package permission

// Role represents a workspace role
type Role string

const (
	RoleOwner  Role = "owner"
	RoleAdmin  Role = "admin"
	RoleMember Role = "member"
	// RoleViewer is read-only — sits between Member and Guest. Useful
	// for auditors, contractors, and execs who need to see findings
	// + export reports but should never trigger scans or change
	// state. Permissions enumerated in config/capabilities.yaml.
	RoleViewer Role = "viewer"
	RoleGuest  Role = "guest"
)

// Visibility levels for resources
type Visibility string

const (
	VisibilityPublic     Visibility = "public"
	VisibilityWorkspace  Visibility = "workspace"
	VisibilityProject    Visibility = "project"
	VisibilityPrivate    Visibility = "private"
	VisibilityRestricted Visibility = "restricted"
)

// Sensitivity levels
type Sensitivity string

const (
	SensitivityOpen         Sensitivity = "open"
	SensitivityInternal     Sensitivity = "internal"
	SensitivityConfidential Sensitivity = "confidential"
	SensitivitySecret       Sensitivity = "secret"
)

// AccessResult is returned by ResolveAccess
type AccessResult struct {
	CanAccess     bool
	AuditRequired bool
	Reason        string
}

// AccessRequest contains all context for an access check
type AccessRequest struct {
	UserRole        Role
	Visibility      Visibility
	Sensitivity     Sensitivity
	IsProjectMember bool
	IsOwner         bool
}

var roleHierarchy = map[Role]int{
	RoleOwner: 5, RoleAdmin: 4, RoleMember: 3, RoleViewer: 2, RoleGuest: 1,
}

// HasPermission checks if a role has a specific permission
func HasPermission(role Role, perm string) bool {
	perms, ok := rolePermissions[role]
	if !ok {
		return false
	}
	for _, p := range perms {
		if p == perm {
			return true
		}
	}
	return false
}

// ResolveAccess determines if a user can access a resource
func ResolveAccess(req AccessRequest) AccessResult {
	// Visibility gate
	switch req.Visibility {
	case VisibilityPublic:
		// Anyone can access
	case VisibilityWorkspace:
		if roleHierarchy[req.UserRole] < 1 {
			return AccessResult{CanAccess: false, Reason: "workspace member required"}
		}
	case VisibilityProject:
		if !req.IsProjectMember {
			return AccessResult{CanAccess: false, Reason: "project member required"}
		}
	case VisibilityPrivate:
		if !req.IsOwner {
			return AccessResult{CanAccess: false, Reason: "owner only"}
		}
	case VisibilityRestricted:
		if !req.IsOwner {
			return AccessResult{CanAccess: false, Reason: "restricted access"}
		}
	}

	// Sensitivity gate
	auditRequired := false
	switch req.Sensitivity {
	case SensitivityConfidential:
		auditRequired = true
		if !HasPermission(req.UserRole, "resource.view_confidential") {
			return AccessResult{CanAccess: false, AuditRequired: true, Reason: "confidential access denied"}
		}
	case SensitivitySecret:
		auditRequired = true
		if !HasPermission(req.UserRole, "resource.view_secret") {
			return AccessResult{CanAccess: false, AuditRequired: true, Reason: "secret access denied"}
		}
	}

	return AccessResult{CanAccess: true, AuditRequired: auditRequired}
}

var rolePermissions = map[Role][]string{
	RoleOwner: {
		"page.view", "page.create", "page.edit", "page.delete",
		"folder.create", "folder.edit", "folder.delete",
		"comment.view", "comment.create", "comment.edit", "comment.delete",
		"database.view", "database.create", "database.edit", "database.delete",
		"webhook.create", "webhook.edit", "webhook.delete",
		"member.invite", "member.remove",
		"workspace.settings", "workspace.delete", "workspace.transfer",
		"ai.use", "trash.view", "trash.restore",
		"resource.upload", "resource.classify", "resource.delete", "resource.share",
		"resource.view_confidential", "resource.view_secret",
		"project.create", "project.edit", "project.delete",
		"billing.manage", "audit.view",
	},
	RoleAdmin: {
		"page.view", "page.create", "page.edit", "page.delete",
		"folder.create", "folder.edit", "folder.delete",
		"comment.view", "comment.create", "comment.edit", "comment.delete",
		"database.view", "database.create", "database.edit", "database.delete",
		"webhook.create", "webhook.edit",
		"member.invite", "member.remove",
		"workspace.settings",
		"ai.use", "trash.view", "trash.restore",
		"resource.upload", "resource.classify", "resource.delete", "resource.share",
		"resource.view_confidential",
		"project.create", "project.edit",
		"audit.view",
	},
	RoleMember: {
		"page.view", "page.create", "page.edit",
		"folder.create", "folder.edit",
		"comment.view", "comment.create", "comment.edit",
		"database.view", "database.create", "database.edit",
		"ai.use", "trash.view",
		"resource.upload", "resource.share",
		"project.create",
	},
	RoleGuest: {
		"page.view", "comment.view", "database.view",
	},
}
