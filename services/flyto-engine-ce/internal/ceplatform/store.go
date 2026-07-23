package ceplatform

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound        = errors.New("not found")
	ErrBootstrapClosed = errors.New("bootstrap registration is closed")
	ErrConflict        = errors.New("conflict")
	ErrInvalidInput    = errors.New("invalid input")
)

type Store struct {
	pool *pgxpool.Pool
}

func Open(ctx context.Context, dsn string) (*Store, error) {
	if strings.TrimSpace(dsn) == "" {
		return nil, errors.New("FLYTO_PG_URL is required")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse postgres url: %w", err)
	}
	cfg.MaxConns = 8
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}
	s := &Store{pool: pool}
	deadline := time.Now().Add(30 * time.Second)
	for {
		if err = pool.Ping(ctx); err == nil {
			break
		}
		if time.Now().After(deadline) {
			pool.Close()
			return nil, fmt.Errorf("postgres readiness: %w", err)
		}
		select {
		case <-ctx.Done():
			pool.Close()
			return nil, ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
	if _, err = pool.Exec(ctx, schemaSQL); err != nil {
		pool.Close()
		return nil, fmt.Errorf("migrate CE schema: %w", err)
	}
	return s, nil
}

func (s *Store) Close() { s.pool.Close() }

func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

func NewID(prefix string) string {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		panic("crypto/rand unavailable: " + err.Error())
	}
	return prefix + "_" + hex.EncodeToString(raw[:])
}

func (s *Store) BootstrapOpen(ctx context.Context) (bool, error) {
	var count int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM ce_users`).Scan(&count); err != nil {
		return false, err
	}
	return count == 0, nil
}

func (s *Store) Bootstrap(ctx context.Context, email, displayName, passwordHash string) (User, Project, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return User{}, Project{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(46022026)`); err != nil {
		return User{}, Project{}, err
	}
	var count int
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM ce_users`).Scan(&count); err != nil {
		return User{}, Project{}, err
	}
	if count != 0 {
		return User{}, Project{}, ErrBootstrapClosed
	}
	now := time.Now().UTC()
	user := User{ID: NewID("usr"), Email: strings.ToLower(strings.TrimSpace(email)), DisplayName: strings.TrimSpace(displayName), PasswordHash: passwordHash, CreatedAt: now}
	project := Project{ID: NewID("org"), Name: "My Warroom", Slug: "my-warroom", Description: "Community security workspace", CreatedAt: now, RepoCount: 0, MemberCount: 1, Role: "owner", IsAdmin: true, ProjectType: "all", OwnerUserID: user.ID}
	if _, err = tx.Exec(ctx, `INSERT INTO ce_users(id,email,display_name,password_hash,created_at) VALUES($1,$2,$3,$4,$5)`, user.ID, user.Email, user.DisplayName, user.PasswordHash, now); err != nil {
		return User{}, Project{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO ce_projects(id,owner_user_id,name,slug,description,project_type,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)`, project.ID, project.OwnerUserID, project.Name, project.Slug, project.Description, project.ProjectType, now); err != nil {
		return User{}, Project{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return User{}, Project{}, err
	}
	return user, project, nil
}

func (s *Store) UserByEmail(ctx context.Context, email string) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx, `SELECT id,email,display_name,password_hash,created_at FROM ce_users WHERE lower(email)=lower($1)`, strings.TrimSpace(email)).Scan(&u.ID, &u.Email, &u.DisplayName, &u.PasswordHash, &u.CreatedAt)
	return u, mapNotFound(err)
}

func (s *Store) UserByID(ctx context.Context, id string) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx, `SELECT id,email,display_name,password_hash,created_at FROM ce_users WHERE id=$1`, id).Scan(&u.ID, &u.Email, &u.DisplayName, &u.PasswordHash, &u.CreatedAt)
	return u, mapNotFound(err)
}

func (s *Store) ListProjects(ctx context.Context, userID string) ([]Project, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT p.id,p.name,p.slug,p.description,p.project_type,p.created_at,p.owner_user_id,
		       count(r.id)::int
		FROM ce_projects p LEFT JOIN ce_repositories r ON r.project_id=p.id
		WHERE p.owner_user_id=$1
		GROUP BY p.id ORDER BY p.created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Project{}
	for rows.Next() {
		var p Project
		if err = rows.Scan(&p.ID, &p.Name, &p.Slug, &p.Description, &p.ProjectType, &p.CreatedAt, &p.OwnerUserID, &p.RepoCount); err != nil {
			return nil, err
		}
		p.MemberCount, p.Role, p.IsAdmin = 1, "owner", true
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) Project(ctx context.Context, userID, id string) (Project, error) {
	var p Project
	err := s.pool.QueryRow(ctx, `
		SELECT p.id,p.name,p.slug,p.description,p.project_type,p.created_at,p.owner_user_id,count(r.id)::int
		FROM ce_projects p LEFT JOIN ce_repositories r ON r.project_id=p.id
		WHERE p.id=$1 AND p.owner_user_id=$2 GROUP BY p.id`, id, userID).Scan(&p.ID, &p.Name, &p.Slug, &p.Description, &p.ProjectType, &p.CreatedAt, &p.OwnerUserID, &p.RepoCount)
	p.MemberCount, p.Role, p.IsAdmin = 1, "owner", true
	return p, mapNotFound(err)
}

func (s *Store) CreateProject(ctx context.Context, userID, name, slug, projectType string) (Project, error) {
	now := time.Now().UTC()
	p := Project{ID: NewID("org"), Name: strings.TrimSpace(name), Slug: strings.ToLower(strings.TrimSpace(slug)), Description: "", ProjectType: projectType, CreatedAt: now, MemberCount: 1, Role: "owner", IsAdmin: true, OwnerUserID: userID}
	if p.ProjectType == "" {
		p.ProjectType = "all"
	}
	_, err := s.pool.Exec(ctx, `INSERT INTO ce_projects(id,owner_user_id,name,slug,description,project_type,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)`, p.ID, userID, p.Name, p.Slug, p.Description, p.ProjectType, now)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return Project{}, ErrConflict
		}
		return Project{}, err
	}
	return p, nil
}

func (s *Store) UpdateProject(ctx context.Context, userID, id, name, slug string) (Project, error) {
	if strings.TrimSpace(name) == "" || strings.TrimSpace(slug) == "" {
		return Project{}, fmt.Errorf("%w: name and slug are required", ErrInvalidInput)
	}
	ct, err := s.pool.Exec(ctx, `UPDATE ce_projects SET name=$1,slug=$2 WHERE id=$3 AND owner_user_id=$4`, strings.TrimSpace(name), strings.ToLower(strings.TrimSpace(slug)), id, userID)
	if err != nil {
		return Project{}, err
	}
	if ct.RowsAffected() == 0 {
		return Project{}, ErrNotFound
	}
	return s.Project(ctx, userID, id)
}

func (s *Store) DeleteProject(ctx context.Context, userID, id string) error {
	ct, err := s.pool.Exec(ctx, `DELETE FROM ce_projects WHERE id=$1 AND owner_user_id=$2`, id, userID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) ListRepositories(ctx context.Context, userID, projectID string) ([]Repository, error) {
	if _, err := s.Project(ctx, userID, projectID); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `SELECT id,project_id,provider,provider_id,full_name,owner_name,repo_name,language,is_private,html_url,clone_url,default_branch,auto_scan,scan_mode,last_scanned_at,last_scan_status,last_scan_error,created_at FROM ce_repositories WHERE project_id=$1 ORDER BY created_at`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Repository{}
	for rows.Next() {
		var repo Repository
		if err = scanRepository(rows, &repo); err != nil {
			return nil, err
		}
		out = append(out, repo)
	}
	return out, rows.Err()
}

func (s *Store) ConnectRepository(ctx context.Context, userID, projectID string, repo Repository) (Repository, error) {
	if _, err := s.Project(ctx, userID, projectID); err != nil {
		return Repository{}, err
	}
	if err := ValidatePublicCloneURL(repo.CloneURL); err != nil {
		return Repository{}, err
	}
	repo.ID, repo.OrgID, repo.CreatedAt = NewID("repo"), projectID, time.Now().UTC()
	if repo.Provider == "" {
		repo.Provider = "git"
	}
	if repo.ProviderID == "" {
		repo.ProviderID = repo.FullName
	}
	if repo.DefaultBranch == "" {
		repo.DefaultBranch = "main"
	}
	if repo.ScanMode == "" {
		repo.ScanMode = "cloud"
	}
	repo.AutoScan = true
	_, err := s.pool.Exec(ctx, `INSERT INTO ce_repositories(id,project_id,provider,provider_id,full_name,owner_name,repo_name,language,is_private,html_url,clone_url,default_branch,auto_scan,scan_mode,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, repo.ID, projectID, repo.Provider, repo.ProviderID, repo.FullName, repo.OwnerName, repo.RepoName, repo.Language, repo.IsPrivate, repo.HTMLURL, repo.CloneURL, repo.DefaultBranch, repo.AutoScan, repo.ScanMode, repo.CreatedAt)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return Repository{}, ErrConflict
		}
		return Repository{}, err
	}
	return repo, nil
}

func (s *Store) DeleteRepository(ctx context.Context, userID, repoID string) error {
	ct, err := s.pool.Exec(ctx, `DELETE FROM ce_repositories r USING ce_projects p WHERE r.id=$1 AND r.project_id=p.id AND p.owner_user_id=$2`, repoID, userID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) Repository(ctx context.Context, userID, repoID string) (Repository, error) {
	row := s.pool.QueryRow(ctx, `SELECT r.id,r.project_id,r.provider,r.provider_id,r.full_name,r.owner_name,r.repo_name,r.language,r.is_private,r.html_url,r.clone_url,r.default_branch,r.auto_scan,r.scan_mode,r.last_scanned_at,r.last_scan_status,r.last_scan_error,r.created_at FROM ce_repositories r JOIN ce_projects p ON p.id=r.project_id WHERE r.id=$1 AND p.owner_user_id=$2`, repoID, userID)
	var repo Repository
	err := mapNotFound(scanRepository(row, &repo))
	return repo, err
}

func (s *Store) CreateScan(ctx context.Context, userID, repoID string) (Scan, error) {
	repo, err := s.Repository(ctx, userID, repoID)
	if err != nil {
		return Scan{}, err
	}
	var active string
	err = s.pool.QueryRow(ctx, `SELECT id FROM ce_scans WHERE repo_id=$1 AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1`, repoID).Scan(&active)
	if err == nil {
		return s.Scan(ctx, userID, active)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Scan{}, err
	}
	now := time.Now().UTC()
	scan := Scan{ID: NewID("scan"), RepoID: repoID, OrgID: repo.OrgID, RepoName: repo.FullName, Status: "queued", TriggerType: "manual", CreatedAt: now}
	_, err = s.pool.Exec(ctx, `INSERT INTO ce_scans(id,project_id,repo_id,status,trigger_type,created_at) VALUES($1,$2,$3,$4,$5,$6)`, scan.ID, scan.OrgID, scan.RepoID, scan.Status, scan.TriggerType, now)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			if lookupErr := s.pool.QueryRow(ctx, `SELECT id FROM ce_scans WHERE repo_id=$1 AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1`, repoID).Scan(&active); lookupErr == nil {
				return s.Scan(ctx, userID, active)
			}
		}
		return Scan{}, err
	}
	_, _ = s.pool.Exec(ctx, `UPDATE ce_repositories SET last_scan_status='queued',last_scan_error='' WHERE id=$1`, repoID)
	return scan, nil
}

func (s *Store) Scan(ctx context.Context, userID, scanID string) (Scan, error) {
	var scan Scan
	err := s.pool.QueryRow(ctx, `SELECT s.id,s.repo_id,s.project_id,r.full_name,s.status,s.trigger_type,s.error,s.started_at,s.completed_at,s.created_at FROM ce_scans s JOIN ce_repositories r ON r.id=s.repo_id JOIN ce_projects p ON p.id=s.project_id WHERE s.id=$1 AND p.owner_user_id=$2`, scanID, userID).Scan(&scan.ID, &scan.RepoID, &scan.OrgID, &scan.RepoName, &scan.Status, &scan.TriggerType, &scan.Error, &scan.StartedAt, &scan.CompletedAt, &scan.CreatedAt)
	return scan, mapNotFound(err)
}

func (s *Store) ListRepoScans(ctx context.Context, userID, repoID string, limit int) ([]Scan, error) {
	if _, err := s.Repository(ctx, userID, repoID); err != nil {
		return nil, err
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	rows, err := s.pool.Query(ctx, `SELECT s.id,s.repo_id,s.project_id,r.full_name,s.status,s.trigger_type,s.error,s.started_at,s.completed_at,s.created_at FROM ce_scans s JOIN ce_repositories r ON r.id=s.repo_id WHERE s.repo_id=$1 ORDER BY s.created_at DESC LIMIT $2`, repoID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Scan{}
	for rows.Next() {
		var scan Scan
		if err = rows.Scan(&scan.ID, &scan.RepoID, &scan.OrgID, &scan.RepoName, &scan.Status, &scan.TriggerType, &scan.Error, &scan.StartedAt, &scan.CompletedAt, &scan.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, scan)
	}
	return out, rows.Err()
}

func (s *Store) ClaimScan(ctx context.Context) (Scan, Repository, bool, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return Scan{}, Repository{}, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var scan Scan
	var repo Repository
	err = tx.QueryRow(ctx, `
		SELECT s.id,s.repo_id,s.project_id,r.full_name,s.status,s.trigger_type,s.error,s.started_at,s.completed_at,s.created_at,
		       r.provider,r.provider_id,r.owner_name,r.repo_name,r.language,r.is_private,r.html_url,r.clone_url,r.default_branch,r.auto_scan,r.scan_mode,r.last_scanned_at,r.last_scan_status,r.last_scan_error,r.created_at
		FROM ce_scans s JOIN ce_repositories r ON r.id=s.repo_id
		WHERE s.status='queued' ORDER BY s.created_at FOR UPDATE OF s SKIP LOCKED LIMIT 1`).Scan(
		&scan.ID, &scan.RepoID, &scan.OrgID, &scan.RepoName, &scan.Status, &scan.TriggerType, &scan.Error, &scan.StartedAt, &scan.CompletedAt, &scan.CreatedAt,
		&repo.Provider, &repo.ProviderID, &repo.OwnerName, &repo.RepoName, &repo.Language, &repo.IsPrivate, &repo.HTMLURL, &repo.CloneURL, &repo.DefaultBranch, &repo.AutoScan, &repo.ScanMode, &repo.LastScannedAt, &repo.LastScanStatus, &repo.LastScanError, &repo.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Scan{}, Repository{}, false, nil
	}
	if err != nil {
		return Scan{}, Repository{}, false, err
	}
	repo.ID, repo.OrgID, repo.FullName = scan.RepoID, scan.OrgID, scan.RepoName
	now := time.Now().UTC()
	if _, err = tx.Exec(ctx, `UPDATE ce_scans SET status='running',started_at=$2 WHERE id=$1`, scan.ID, now); err != nil {
		return Scan{}, Repository{}, false, err
	}
	if _, err = tx.Exec(ctx, `UPDATE ce_repositories SET last_scan_status='running',last_scan_error='' WHERE id=$1`, scan.RepoID); err != nil {
		return Scan{}, Repository{}, false, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Scan{}, Repository{}, false, err
	}
	scan.Status, scan.StartedAt = "running", &now
	return scan, repo, true, nil
}

func (s *Store) CompleteScan(ctx context.Context, scan Scan, findings []Finding) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	for _, f := range findings {
		_, err = tx.Exec(ctx, `INSERT INTO ce_findings(id,scan_id,project_id,repo_id,category,severity,rule_id,title,file_path,line_no,detail,fingerprint,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(scan_id,fingerprint) DO NOTHING`, f.ID, scan.ID, scan.OrgID, scan.RepoID, f.Category, f.Severity, f.RuleID, f.Name, f.File, f.Line, f.Detail, f.Fingerprint, f.CreatedAt)
		if err != nil {
			return err
		}
	}
	now := time.Now().UTC()
	if _, err = tx.Exec(ctx, `UPDATE ce_scans SET status='complete',completed_at=$2,error='' WHERE id=$1`, scan.ID, now); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `UPDATE ce_repositories SET last_scan_status='complete',last_scan_error='',last_scanned_at=$2 WHERE id=$1`, scan.RepoID, now); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) FailScan(ctx context.Context, scan Scan, cause error) error {
	message := strings.TrimSpace(cause.Error())
	if len(message) > 500 {
		message = message[:500]
	}
	now := time.Now().UTC()
	_, err := s.pool.Exec(ctx, `UPDATE ce_scans SET status='failed',completed_at=$2,error=$3 WHERE id=$1`, scan.ID, now, message)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, `UPDATE ce_repositories SET last_scan_status='failed',last_scan_error=$2 WHERE id=$1`, scan.RepoID, message)
	return err
}

func (s *Store) RepoFindings(ctx context.Context, userID, repoID string) ([]Finding, error) {
	if _, err := s.Repository(ctx, userID, repoID); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `SELECT DISTINCT ON (fingerprint) id,scan_id,project_id,repo_id,category,severity,rule_id,title,file_path,line_no,detail,fingerprint,created_at FROM ce_findings WHERE repo_id=$1 ORDER BY fingerprint,created_at DESC`, repoID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Finding{}
	for rows.Next() {
		var f Finding
		if err = rows.Scan(&f.ID, &f.ScanID, &f.OrgID, &f.RepoID, &f.Category, &f.Severity, &f.RuleID, &f.Name, &f.File, &f.Line, &f.Detail, &f.Fingerprint, &f.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (s *Store) ProjectFindings(ctx context.Context, userID, projectID string) ([]Finding, error) {
	if _, err := s.Project(ctx, userID, projectID); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `SELECT DISTINCT ON (repo_id,fingerprint) id,scan_id,project_id,repo_id,category,severity,rule_id,title,file_path,line_no,detail,fingerprint,created_at FROM ce_findings WHERE project_id=$1 ORDER BY repo_id,fingerprint,created_at DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Finding{}
	for rows.Next() {
		var f Finding
		if err = rows.Scan(&f.ID, &f.ScanID, &f.OrgID, &f.RepoID, &f.Category, &f.Severity, &f.RuleID, &f.Name, &f.File, &f.Line, &f.Detail, &f.Fingerprint, &f.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (s *Store) ScanLog(ctx context.Context, userID, projectID string, limit int) ([]ScanLogEntry, error) {
	if _, err := s.Project(ctx, userID, projectID); err != nil {
		return nil, err
	}
	if limit < 1 || limit > 500 {
		limit = 200
	}
	rows, err := s.pool.Query(ctx, `SELECT s.id,s.repo_id,r.full_name,s.status,s.trigger_type,NULLIF(s.error,''),COALESCE(string_agg(DISTINCT f.category,','),''),s.started_at,s.completed_at,s.created_at FROM ce_scans s JOIN ce_repositories r ON r.id=s.repo_id LEFT JOIN ce_findings f ON f.scan_id=s.id WHERE s.project_id=$1 GROUP BY s.id,r.full_name ORDER BY s.created_at DESC LIMIT $2`, projectID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ScanLogEntry{}
	for rows.Next() {
		var e ScanLogEntry
		if err = rows.Scan(&e.ID, &e.RepoID, &e.RepoName, &e.Status, &e.TriggerType, &e.Error, &e.Categories, &e.StartedAt, &e.CompletedAt, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (s *Store) HealthSummary(ctx context.Context, userID, projectID string) (HealthSummary, error) {
	repos, err := s.ListRepositories(ctx, userID, projectID)
	if err != nil {
		return HealthSummary{}, err
	}
	summary := HealthSummary{Repos: []HealthRow{}, TotalCount: len(repos), Aggregated: HealthAggregated{GradeDist: map[string]int{"A": 0, "B": 0, "C": 0, "D": 0, "F": 0}, TopRisks: []RiskRow{}}}
	for _, repo := range repos {
		findings, ferr := s.RepoFindings(ctx, userID, repo.ID)
		if ferr != nil {
			return HealthSummary{}, ferr
		}
		row := HealthRow{RepoID: repo.ID, ProjectType: "code", ScannedAt: repo.LastScannedAt}
		for _, f := range findings {
			row.TotalCount++
			if f.Category == "secret" {
				row.SecretCount++
			}
			if f.Category == "sast" || f.Category == "iac" {
				row.SecurityFindings++
			}
			switch f.Severity {
			case "critical":
				row.CriticalCount++
				summary.Aggregated.CriticalCount++
			case "high":
				row.HighCount++
				summary.Aggregated.HighCount++
			}
		}
		if repo.LastScannedAt != nil {
			summary.ScannedCount++
		}
		row.DisplayScore, row.Grade = scoreGrade(findings)
		summary.Aggregated.GradeDist[row.Grade]++
		if row.Grade == "D" || row.Grade == "F" {
			summary.Aggregated.AtRiskCount++
		} else if row.Grade == "A" || row.Grade == "B" {
			summary.Aggregated.SecureCount++
		}
		summary.Aggregated.TopRisks = append(summary.Aggregated.TopRisks, RiskRow{RepoID: repo.ID, Grade: row.Grade, Score: row.DisplayScore})
		summary.Aggregated.AvgScore += row.DisplayScore
		summary.Repos = append(summary.Repos, row)
	}
	if len(repos) > 0 {
		summary.Aggregated.AvgScore /= len(repos)
		_, summary.Aggregated.AvgGrade = scoreToGrade(summary.Aggregated.AvgScore)
	}
	sort.Slice(summary.Aggregated.TopRisks, func(i, j int) bool {
		return summary.Aggregated.TopRisks[i].Score < summary.Aggregated.TopRisks[j].Score
	})
	if len(summary.Aggregated.TopRisks) > 5 {
		summary.Aggregated.TopRisks = summary.Aggregated.TopRisks[:5]
	}
	_ = s.pool.QueryRow(ctx, `SELECT count(*) FROM ce_scans WHERE project_id=$1 AND status IN ('queued','running')`, projectID).Scan(&summary.ActiveScanCount)
	return summary, nil
}

func scoreGrade(findings []Finding) (int, string) {
	score := 900
	for _, f := range findings {
		switch f.Severity {
		case "critical":
			score -= 100
		case "high":
			score -= 55
		case "medium":
			score -= 25
		default:
			score -= 8
		}
	}
	if score < 250 {
		score = 250
	}
	return scoreGradeValue(score)
}

func scoreGradeValue(score int) (int, string) { _, grade := scoreToGrade(score); return score, grade }
func scoreToGrade(score int) (int, string) {
	switch {
	case score >= 800:
		return score, "A"
	case score >= 700:
		return score, "B"
	case score >= 600:
		return score, "C"
	case score >= 500:
		return score, "D"
	default:
		return score, "F"
	}
}

func ValidatePublicCloneURL(raw string) error {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return fmt.Errorf("%w: invalid clone URL", ErrInvalidInput)
	}
	if u.Scheme != "https" || u.User != nil {
		return fmt.Errorf("%w: CE repository URL must be credential-free HTTPS", ErrInvalidInput)
	}
	host := strings.ToLower(u.Hostname())
	allowed := map[string]bool{"github.com": true, "gitlab.com": true, "codeberg.org": true, "bitbucket.org": true}
	if !allowed[host] {
		return fmt.Errorf("%w: unsupported CE public repository host", ErrInvalidInput)
	}
	if strings.TrimSpace(u.Path) == "" || u.Path == "/" {
		return fmt.Errorf("%w: repository path is required", ErrInvalidInput)
	}
	return nil
}

type rowScanner interface{ Scan(dest ...any) error }

func scanRepository(row rowScanner, repo *Repository) error {
	return row.Scan(&repo.ID, &repo.OrgID, &repo.Provider, &repo.ProviderID, &repo.FullName, &repo.OwnerName, &repo.RepoName, &repo.Language, &repo.IsPrivate, &repo.HTMLURL, &repo.CloneURL, &repo.DefaultBranch, &repo.AutoScan, &repo.ScanMode, &repo.LastScannedAt, &repo.LastScanStatus, &repo.LastScanError, &repo.CreatedAt)
}
func mapNotFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}
