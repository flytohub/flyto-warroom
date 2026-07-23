package ceplatform

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// AttackPath is a local, deterministic risk-chain hypothesis. Community
// Edition never labels this data as Flyto2-authoritative or cross-tenant
// comparable.
type AttackPath struct {
	ID         string    `json:"id"`
	ScanID     string    `json:"scan_id"`
	ProjectID  string    `json:"project_id"`
	RepoID     string    `json:"repo_id"`
	Title      string    `json:"title"`
	Severity   string    `json:"severity"`
	FindingIDs []string  `json:"finding_ids"`
	Summary    string    `json:"summary"`
	Confidence string    `json:"confidence"`
	CreatedAt  time.Time `json:"created_at"`
}

type Evidence struct {
	ID        string    `json:"id"`
	ScanID    string    `json:"scan_id"`
	ProjectID string    `json:"project_id"`
	RepoID    string    `json:"repo_id"`
	FindingID string    `json:"finding_id,omitempty"`
	Kind      string    `json:"kind"`
	Digest    string    `json:"digest"`
	Summary   string    `json:"summary"`
	CreatedAt time.Time `json:"created_at"`
}

type Remediation struct {
	ID                 string    `json:"id"`
	ProjectID          string    `json:"project_id"`
	RepoID             string    `json:"repo_id"`
	FindingID          string    `json:"finding_id"`
	Recommendation     string    `json:"recommendation"`
	Status             string    `json:"status"`
	VerificationStatus string    `json:"verification_status"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type Report struct {
	ID            string    `json:"id"`
	ScanID        string    `json:"scan_id"`
	ProjectID     string    `json:"project_id"`
	Format        string    `json:"format"`
	Body          string    `json:"-"`
	FindingCount  int       `json:"finding_count"`
	EvidenceCount int       `json:"evidence_count"`
	CreatedAt     time.Time `json:"created_at"`
}

type AnalysisWork struct {
	Scan     Scan
	Repo     Repository
	Findings []Finding
}

type ReportWork struct {
	Scan        Scan
	Project     Project
	Findings    []Finding
	AttackPaths []AttackPath
	Evidence    []Evidence
}

type WorkflowSummary struct {
	AttackPaths  []AttackPath  `json:"attack_paths"`
	Evidence     []Evidence    `json:"evidence"`
	Remediations []Remediation `json:"remediations"`
	Reports      []Report      `json:"reports"`
}

// EnqueueDueAutoScans is the CE scheduler boundary. It creates at most one
// active scan per repository and never resolves customer or provider
// credentials.
func (s *Store) EnqueueDueAutoScans(ctx context.Context, interval time.Duration, limit int) (int, error) {
	if interval < 15*time.Minute {
		interval = 24 * time.Hour
	}
	if limit < 1 || limit > 100 {
		limit = 25
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	rows, err := tx.Query(ctx, `
		SELECT r.id,r.project_id,r.full_name
		FROM ce_repositories r
		WHERE r.auto_scan=true
		  AND (r.last_scanned_at IS NULL OR r.last_scanned_at <= $1)
		  AND NOT EXISTS (
		    SELECT 1 FROM ce_scans s
		    WHERE s.repo_id=r.id AND s.status IN ('queued','running')
		  )
		ORDER BY r.last_scanned_at NULLS FIRST,r.created_at
		FOR UPDATE OF r SKIP LOCKED
		LIMIT $2`, time.Now().UTC().Add(-interval), limit)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	type dueRepo struct{ id, projectID, fullName string }
	due := make([]dueRepo, 0, limit)
	for rows.Next() {
		var repo dueRepo
		if err = rows.Scan(&repo.id, &repo.projectID, &repo.fullName); err != nil {
			return 0, err
		}
		due = append(due, repo)
	}
	if err = rows.Err(); err != nil {
		return 0, err
	}
	now := time.Now().UTC()
	for _, repo := range due {
		scanID := NewID("scan")
		if _, err = tx.Exec(ctx, `
			INSERT INTO ce_scans(id,project_id,repo_id,status,trigger_type,created_at)
			VALUES($1,$2,$3,'queued','scheduled',$4)`,
			scanID, repo.projectID, repo.id, now,
		); err != nil {
			return 0, err
		}
		if _, err = tx.Exec(ctx, `
			UPDATE ce_repositories
			SET last_scan_status='queued',last_scan_error=''
			WHERE id=$1`, repo.id,
		); err != nil {
			return 0, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return 0, err
	}
	return len(due), nil
}

func (s *Store) ClaimAnalysis(ctx context.Context) (AnalysisWork, bool, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return AnalysisWork{}, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var work AnalysisWork
	err = tx.QueryRow(ctx, `
		SELECT s.id,s.repo_id,s.project_id,r.full_name,s.status,s.trigger_type,
		       s.error,s.started_at,s.completed_at,s.created_at,
		       r.provider,r.provider_id,r.owner_name,r.repo_name,r.language,
		       r.is_private,r.html_url,r.clone_url,r.default_branch,r.auto_scan,
		       r.scan_mode,r.last_scanned_at,r.last_scan_status,r.last_scan_error,
		       r.created_at
		FROM ce_scans s
		JOIN ce_repositories r ON r.id=s.repo_id
		WHERE s.status='complete' AND s.analysis_status='pending'
		ORDER BY s.completed_at
		FOR UPDATE OF s SKIP LOCKED
		LIMIT 1`).Scan(
		&work.Scan.ID, &work.Scan.RepoID, &work.Scan.OrgID, &work.Scan.RepoName,
		&work.Scan.Status, &work.Scan.TriggerType, &work.Scan.Error,
		&work.Scan.StartedAt, &work.Scan.CompletedAt, &work.Scan.CreatedAt,
		&work.Repo.Provider, &work.Repo.ProviderID, &work.Repo.OwnerName,
		&work.Repo.RepoName, &work.Repo.Language, &work.Repo.IsPrivate,
		&work.Repo.HTMLURL, &work.Repo.CloneURL, &work.Repo.DefaultBranch,
		&work.Repo.AutoScan, &work.Repo.ScanMode, &work.Repo.LastScannedAt,
		&work.Repo.LastScanStatus, &work.Repo.LastScanError, &work.Repo.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return AnalysisWork{}, false, nil
	}
	if err != nil {
		return AnalysisWork{}, false, err
	}
	work.Repo.ID, work.Repo.OrgID, work.Repo.FullName = work.Scan.RepoID, work.Scan.OrgID, work.Scan.RepoName
	if _, err = tx.Exec(ctx, `
		UPDATE ce_scans
		SET analysis_status='running',analysis_error=''
		WHERE id=$1`, work.Scan.ID,
	); err != nil {
		return AnalysisWork{}, false, err
	}
	if err = tx.Commit(ctx); err != nil {
		return AnalysisWork{}, false, err
	}
	work.Findings, err = s.findingsForScan(ctx, work.Scan.ID)
	if err != nil {
		_ = s.FailAnalysis(ctx, work.Scan.ID, err)
		return AnalysisWork{}, false, err
	}
	return work, true, nil
}

func (s *Store) CompleteAnalysis(
	ctx context.Context,
	work AnalysisWork,
	paths []AttackPath,
	evidence []Evidence,
	remediations []Remediation,
) error {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	now := time.Now().UTC()
	for _, path := range paths {
		findingIDs, marshalErr := json.Marshal(path.FindingIDs)
		if marshalErr != nil {
			return marshalErr
		}
		if _, err = tx.Exec(ctx, `
			INSERT INTO ce_attack_paths(
			  id,scan_id,project_id,repo_id,title,severity,finding_ids,summary,confidence,created_at
			) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			ON CONFLICT(scan_id,title) DO UPDATE
			SET severity=excluded.severity,finding_ids=excluded.finding_ids,
			    summary=excluded.summary,confidence=excluded.confidence`,
			path.ID, work.Scan.ID, work.Scan.OrgID, work.Scan.RepoID, path.Title,
			path.Severity, string(findingIDs), path.Summary, path.Confidence, now,
		); err != nil {
			return err
		}
	}
	for _, item := range evidence {
		var findingID any
		if strings.TrimSpace(item.FindingID) != "" {
			findingID = item.FindingID
		}
		if _, err = tx.Exec(ctx, `
			INSERT INTO ce_evidence(
			  id,scan_id,project_id,repo_id,finding_id,kind,digest,summary,created_at
			) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
			ON CONFLICT(scan_id,digest) DO UPDATE
			SET kind=excluded.kind,summary=excluded.summary`,
			item.ID, work.Scan.ID, work.Scan.OrgID, work.Scan.RepoID, findingID,
			item.Kind, item.Digest, item.Summary, now,
		); err != nil {
			return err
		}
	}
	for _, remediation := range remediations {
		if _, err = tx.Exec(ctx, `
			INSERT INTO ce_remediations(
			  id,project_id,repo_id,finding_id,recommendation,status,
			  verification_status,created_at,updated_at
			) VALUES($1,$2,$3,$4,$5,'proposed','not_run',$6,$6)
			ON CONFLICT(finding_id) DO UPDATE
			SET recommendation=excluded.recommendation,updated_at=excluded.updated_at`,
			remediation.ID, work.Scan.OrgID, work.Scan.RepoID,
			remediation.FindingID, remediation.Recommendation, now,
		); err != nil {
			return err
		}
	}
	if _, err = tx.Exec(ctx, `
		UPDATE ce_remediations remediation
		SET verification_status=CASE
		      WHEN EXISTS (
		        SELECT 1
		        FROM ce_findings current_finding
		        WHERE current_finding.scan_id=$1
		          AND current_finding.fingerprint=original_finding.fingerprint
		      ) THEN 'still_present'
		      ELSE 'verified_fixed'
		    END,
		    status=CASE
		      WHEN EXISTS (
		        SELECT 1
		        FROM ce_findings current_finding
		        WHERE current_finding.scan_id=$1
		          AND current_finding.fingerprint=original_finding.fingerprint
		      ) THEN remediation.status
		      ELSE 'resolved'
		    END,
		    updated_at=$3
		FROM ce_findings original_finding
		WHERE remediation.finding_id=original_finding.id
		  AND remediation.repo_id=$2
		  AND remediation.verification_status='queued'`,
		work.Scan.ID, work.Scan.RepoID, now,
	); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `
		UPDATE ce_scans
		SET analysis_status='complete',analysis_error=''
		WHERE id=$1`, work.Scan.ID,
	); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) FailAnalysis(ctx context.Context, scanID string, cause error) error {
	message := boundedError(cause)
	_, err := s.pool.Exec(ctx, `
		UPDATE ce_scans
		SET analysis_status='failed',analysis_error=$2
		WHERE id=$1`, scanID, message)
	return err
}

func (s *Store) ClaimReport(ctx context.Context) (ReportWork, bool, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return ReportWork{}, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var work ReportWork
	err = tx.QueryRow(ctx, `
		SELECT s.id,s.repo_id,s.project_id,r.full_name,s.status,s.trigger_type,
		       s.error,s.started_at,s.completed_at,s.created_at,
		       p.name,p.slug,p.description,p.created_at,p.project_type,p.owner_user_id
		FROM ce_scans s
		JOIN ce_repositories r ON r.id=s.repo_id
		JOIN ce_projects p ON p.id=s.project_id
		WHERE s.status='complete'
		  AND s.analysis_status='complete'
		  AND s.report_status='pending'
		ORDER BY s.completed_at
		FOR UPDATE OF s SKIP LOCKED
		LIMIT 1`).Scan(
		&work.Scan.ID, &work.Scan.RepoID, &work.Scan.OrgID, &work.Scan.RepoName,
		&work.Scan.Status, &work.Scan.TriggerType, &work.Scan.Error,
		&work.Scan.StartedAt, &work.Scan.CompletedAt, &work.Scan.CreatedAt,
		&work.Project.Name, &work.Project.Slug, &work.Project.Description,
		&work.Project.CreatedAt, &work.Project.ProjectType, &work.Project.OwnerUserID,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return ReportWork{}, false, nil
	}
	if err != nil {
		return ReportWork{}, false, err
	}
	work.Project.ID = work.Scan.OrgID
	if _, err = tx.Exec(ctx, `
		UPDATE ce_scans SET report_status='running',report_error='' WHERE id=$1`,
		work.Scan.ID,
	); err != nil {
		return ReportWork{}, false, err
	}
	if err = tx.Commit(ctx); err != nil {
		return ReportWork{}, false, err
	}
	if work.Findings, err = s.findingsForScan(ctx, work.Scan.ID); err != nil {
		_ = s.FailReport(ctx, work.Scan.ID, err)
		return ReportWork{}, false, err
	}
	if work.AttackPaths, err = s.attackPathsForScan(ctx, work.Scan.ID); err != nil {
		_ = s.FailReport(ctx, work.Scan.ID, err)
		return ReportWork{}, false, err
	}
	if work.Evidence, err = s.evidenceForScan(ctx, work.Scan.ID); err != nil {
		_ = s.FailReport(ctx, work.Scan.ID, err)
		return ReportWork{}, false, err
	}
	return work, true, nil
}

func (s *Store) CompleteReport(ctx context.Context, work ReportWork, body string) error {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	now := time.Now().UTC()
	if _, err = tx.Exec(ctx, `
		INSERT INTO ce_reports(
		  id,scan_id,project_id,format,body,finding_count,evidence_count,created_at
		) VALUES($1,$2,$3,'html',$4,$5,$6,$7)
		ON CONFLICT(scan_id,format) DO UPDATE
		SET body=excluded.body,finding_count=excluded.finding_count,
		    evidence_count=excluded.evidence_count,created_at=excluded.created_at`,
		NewID("report"), work.Scan.ID, work.Scan.OrgID, body,
		len(work.Findings), len(work.Evidence), now,
	); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `
		UPDATE ce_scans SET report_status='complete',report_error='' WHERE id=$1`,
		work.Scan.ID,
	); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) FailReport(ctx context.Context, scanID string, cause error) error {
	message := boundedError(cause)
	_, err := s.pool.Exec(ctx, `
		UPDATE ce_scans SET report_status='failed',report_error=$2 WHERE id=$1`,
		scanID, message)
	return err
}

func (s *Store) ProjectWorkflow(ctx context.Context, userID, projectID string) (WorkflowSummary, error) {
	if _, err := s.Project(ctx, userID, projectID); err != nil {
		return WorkflowSummary{}, err
	}
	paths, err := s.projectAttackPaths(ctx, projectID)
	if err != nil {
		return WorkflowSummary{}, err
	}
	evidence, err := s.projectEvidence(ctx, projectID)
	if err != nil {
		return WorkflowSummary{}, err
	}
	remediations, err := s.projectRemediations(ctx, projectID)
	if err != nil {
		return WorkflowSummary{}, err
	}
	reports, err := s.projectReports(ctx, projectID)
	if err != nil {
		return WorkflowSummary{}, err
	}
	return WorkflowSummary{
		AttackPaths:  paths,
		Evidence:     evidence,
		Remediations: remediations,
		Reports:      reports,
	}, nil
}

func (s *Store) LatestReport(ctx context.Context, userID, projectID string) (Report, error) {
	if _, err := s.Project(ctx, userID, projectID); err != nil {
		return Report{}, err
	}
	var report Report
	err := s.pool.QueryRow(ctx, `
		SELECT id,scan_id,project_id,format,body,finding_count,evidence_count,created_at
		FROM ce_reports WHERE project_id=$1
		ORDER BY created_at DESC LIMIT 1`, projectID,
	).Scan(
		&report.ID, &report.ScanID, &report.ProjectID, &report.Format,
		&report.Body, &report.FindingCount, &report.EvidenceCount, &report.CreatedAt,
	)
	return report, mapNotFound(err)
}

func (s *Store) QueueRemediationVerification(
	ctx context.Context,
	userID, projectID, remediationID string,
) (Scan, error) {
	var repoID string
	err := s.pool.QueryRow(ctx, `
		SELECT remediation.repo_id
		FROM ce_remediations remediation
		JOIN ce_projects project ON project.id=remediation.project_id
		WHERE remediation.id=$1
		  AND remediation.project_id=$2
		  AND project.owner_user_id=$3`,
		remediationID, projectID, userID,
	).Scan(&repoID)
	if err != nil {
		return Scan{}, mapNotFound(err)
	}
	scan, err := s.CreateScan(ctx, userID, repoID)
	if err != nil {
		return Scan{}, err
	}
	now := time.Now().UTC()
	if _, err = s.pool.Exec(ctx, `
		UPDATE ce_remediations
		SET status='accepted',verification_status='queued',updated_at=$2
		WHERE id=$1`, remediationID, now,
	); err != nil {
		return Scan{}, err
	}
	_, _ = s.pool.Exec(ctx, `
		UPDATE ce_scans SET trigger_type='verification'
		WHERE id=$1 AND status='queued'`, scan.ID)
	scan.TriggerType = "verification"
	return scan, nil
}

func (s *Store) findingsForScan(ctx context.Context, scanID string) ([]Finding, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id,scan_id,project_id,repo_id,category,severity,rule_id,title,
		       file_path,line_no,detail,fingerprint,created_at
		FROM ce_findings WHERE scan_id=$1
		ORDER BY CASE severity
		  WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3
		END,created_at`, scanID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	findings := []Finding{}
	for rows.Next() {
		var finding Finding
		if err = rows.Scan(
			&finding.ID, &finding.ScanID, &finding.OrgID, &finding.RepoID,
			&finding.Category, &finding.Severity, &finding.RuleID, &finding.Name,
			&finding.File, &finding.Line, &finding.Detail, &finding.Fingerprint,
			&finding.CreatedAt,
		); err != nil {
			return nil, err
		}
		findings = append(findings, finding)
	}
	return findings, rows.Err()
}

func (s *Store) attackPathsForScan(ctx context.Context, scanID string) ([]AttackPath, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id,scan_id,project_id,repo_id,title,severity,finding_ids,summary,
		       confidence,created_at
		FROM ce_attack_paths WHERE scan_id=$1 ORDER BY created_at`, scanID)
	return scanAttackPaths(ctx, rows, err)
}

func (s *Store) evidenceForScan(ctx context.Context, scanID string) ([]Evidence, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id,scan_id,project_id,repo_id,COALESCE(finding_id,''),kind,digest,
		       summary,created_at
		FROM ce_evidence WHERE scan_id=$1 ORDER BY created_at`, scanID)
	return scanEvidence(ctx, rows, err)
}

func (s *Store) projectAttackPaths(ctx context.Context, projectID string) ([]AttackPath, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT ON (repo_id,title)
		       id,scan_id,project_id,repo_id,title,severity,finding_ids,summary,
		       confidence,created_at
		FROM ce_attack_paths WHERE project_id=$1
		ORDER BY repo_id,title,created_at DESC`, projectID)
	return scanAttackPaths(ctx, rows, err)
}

func (s *Store) projectEvidence(ctx context.Context, projectID string) ([]Evidence, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id,scan_id,project_id,repo_id,COALESCE(finding_id,''),kind,digest,
		       summary,created_at
		FROM ce_evidence WHERE project_id=$1
		ORDER BY created_at DESC LIMIT 500`, projectID)
	return scanEvidence(ctx, rows, err)
}

func (s *Store) projectRemediations(ctx context.Context, projectID string) ([]Remediation, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id,project_id,repo_id,finding_id,recommendation,status,
		       verification_status,created_at,updated_at
		FROM ce_remediations WHERE project_id=$1
		ORDER BY updated_at DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Remediation{}
	for rows.Next() {
		var remediation Remediation
		if err = rows.Scan(
			&remediation.ID, &remediation.ProjectID, &remediation.RepoID,
			&remediation.FindingID, &remediation.Recommendation, &remediation.Status,
			&remediation.VerificationStatus, &remediation.CreatedAt,
			&remediation.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, remediation)
	}
	return out, rows.Err()
}

func (s *Store) projectReports(ctx context.Context, projectID string) ([]Report, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id,scan_id,project_id,format,finding_count,evidence_count,created_at
		FROM ce_reports WHERE project_id=$1
		ORDER BY created_at DESC LIMIT 50`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Report{}
	for rows.Next() {
		var report Report
		if err = rows.Scan(
			&report.ID, &report.ScanID, &report.ProjectID, &report.Format,
			&report.FindingCount, &report.EvidenceCount, &report.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, report)
	}
	return out, rows.Err()
}

type queryRows interface {
	Next() bool
	Scan(dest ...any) error
	Err() error
	Close()
}

func scanAttackPaths(_ context.Context, rows queryRows, err error) ([]AttackPath, error) {
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AttackPath{}
	for rows.Next() {
		var path AttackPath
		var findingIDs string
		if err = rows.Scan(
			&path.ID, &path.ScanID, &path.ProjectID, &path.RepoID, &path.Title,
			&path.Severity, &findingIDs, &path.Summary, &path.Confidence,
			&path.CreatedAt,
		); err != nil {
			return nil, err
		}
		if jsonErr := json.Unmarshal([]byte(findingIDs), &path.FindingIDs); jsonErr != nil {
			return nil, jsonErr
		}
		out = append(out, path)
	}
	return out, rows.Err()
}

func scanEvidence(_ context.Context, rows queryRows, err error) ([]Evidence, error) {
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Evidence{}
	for rows.Next() {
		var item Evidence
		if err = rows.Scan(
			&item.ID, &item.ScanID, &item.ProjectID, &item.RepoID,
			&item.FindingID, &item.Kind, &item.Digest, &item.Summary,
			&item.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func boundedError(cause error) string {
	if cause == nil {
		return "unknown error"
	}
	message := strings.TrimSpace(cause.Error())
	if len(message) > 500 {
		message = message[:500]
	}
	return message
}
