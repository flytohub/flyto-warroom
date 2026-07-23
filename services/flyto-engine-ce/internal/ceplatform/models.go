// Package ceplatform implements the durable, provider-free Community Edition
// product runtime.  It intentionally owns only local authentication, projects,
// repositories, scans, findings, and reports; hosted and commercial providers
// compose outside this package.
package ceplatform

import "time"

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	DisplayName  string    `json:"displayName"`
	PhotoURL     *string   `json:"photoURL,omitempty"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Project struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Slug        string    `json:"slug"`
	LogoURL     string    `json:"logoUrl,omitempty"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"createdAt"`
	RepoCount   int       `json:"repoCount"`
	MemberCount int       `json:"memberCount"`
	Role        string    `json:"role"`
	IsAdmin     bool      `json:"isAdmin"`
	ProjectType string    `json:"projectType"`
	OwnerUserID string    `json:"-"`
}

type Repository struct {
	ID             string     `json:"id"`
	OrgID          string     `json:"orgId"`
	Provider       string     `json:"provider"`
	ProviderID     string     `json:"providerId"`
	FullName       string     `json:"fullName"`
	OwnerName      string     `json:"ownerName"`
	RepoName       string     `json:"repoName"`
	Language       string     `json:"language,omitempty"`
	IsPrivate      bool       `json:"isPrivate"`
	HTMLURL        string     `json:"htmlUrl"`
	CloneURL       string     `json:"-"`
	DefaultBranch  string     `json:"defaultBranch,omitempty"`
	AutoScan       bool       `json:"autoScan"`
	ScanMode       string     `json:"scanMode"`
	LastScannedAt  *time.Time `json:"lastScannedAt,omitempty"`
	LastScanStatus string     `json:"lastScanStatus,omitempty"`
	LastScanError  string     `json:"lastScanError,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
}

type Scan struct {
	ID          string     `json:"id"`
	RepoID      string     `json:"repoId"`
	OrgID       string     `json:"orgId,omitempty"`
	RepoName    string     `json:"repoName,omitempty"`
	Status      string     `json:"status"`
	TriggerType string     `json:"triggerType"`
	Error       string     `json:"error,omitempty"`
	StartedAt   *time.Time `json:"startedAt,omitempty"`
	CompletedAt *time.Time `json:"completedAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
}

type Finding struct {
	ID          string    `json:"id"`
	ScanID      string    `json:"scan_id,omitempty"`
	OrgID       string    `json:"org_id,omitempty"`
	RepoID      string    `json:"repo_id,omitempty"`
	Category    string    `json:"type"`
	Severity    string    `json:"severity"`
	RuleID      string    `json:"rule,omitempty"`
	Name        string    `json:"name"`
	File        string    `json:"file"`
	Line        int       `json:"line,omitempty"`
	Detail      string    `json:"detail,omitempty"`
	Fingerprint string    `json:"fingerprint"`
	CreatedAt   time.Time `json:"created_at,omitempty"`
}

type HealthRow struct {
	RepoID           string     `json:"repo_id"`
	ProjectType      string     `json:"project_type"`
	ScannedAt        *time.Time `json:"scanned_at,omitempty"`
	SecretCount      int        `json:"secret_count"`
	SecurityFindings int        `json:"security_findings"`
	CriticalCount    int        `json:"cve_critical"`
	HighCount        int        `json:"cve_high"`
	TotalCount       int        `json:"cve_total"`
	DisplayScore     int        `json:"display_score,omitempty"`
	Grade            string     `json:"grade,omitempty"`
}

type HealthSummary struct {
	Repos           []HealthRow      `json:"repos"`
	ScannedCount    int              `json:"scanned_count"`
	TotalCount      int              `json:"total_count"`
	ActiveScanCount int              `json:"active_scan_count"`
	Aggregated      HealthAggregated `json:"aggregated"`
}

type HealthAggregated struct {
	AvgScore      int            `json:"avg_score"`
	AvgGrade      string         `json:"avg_grade"`
	GradeDist     map[string]int `json:"grade_dist"`
	AtRiskCount   int            `json:"at_risk_count"`
	SecureCount   int            `json:"secure_count"`
	CriticalCount int            `json:"critical_count"`
	HighCount     int            `json:"high_count"`
	TopRisks      []RiskRow      `json:"top_risks"`
}

type RiskRow struct {
	RepoID string `json:"repo_id"`
	Grade  string `json:"grade"`
	Score  int    `json:"score"`
}

type ScanLogEntry struct {
	ID          string     `json:"id"`
	RepoID      string     `json:"repo_id"`
	RepoName    string     `json:"repo_name"`
	Status      string     `json:"status"`
	TriggerType string     `json:"trigger_type"`
	Error       *string    `json:"error"`
	Categories  string     `json:"categories"`
	StartedAt   *time.Time `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at"`
	CreatedAt   time.Time  `json:"created_at"`
}
