package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/flytohub/flyto-engine/internal/ceplatform"
	"github.com/flytohub/flyto-engine/internal/obs"
)

func newRuntimeWorker(ctx context.Context) (*workerServer, func(), error) {
	store, err := ceplatform.Open(ctx, os.Getenv("FLYTO_PG_URL"))
	if err != nil {
		return nil, nil, err
	}
	worker := newWorkerServer(time.Now)
	worker.store = store
	return worker, store.Close, nil
}

func (s *workerServer) runScanLoop(ctx context.Context) {
	ticker := time.NewTicker(400 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			scan, repo, ok, err := s.store.ClaimScan(ctx)
			if err != nil {
				if !errors.Is(err, context.Canceled) {
					obs.Default().Error("CE worker claim failed", "error", err)
				}
				continue
			}
			if !ok {
				continue
			}
			s.runClaimedScan(ctx, scan, repo)
		}
	}
}

func (s *workerServer) runClaimedScan(parent context.Context, scan ceplatform.Scan, repo ceplatform.Repository) {
	ctx, cancel := context.WithTimeout(parent, 3*time.Minute)
	defer cancel()
	if err := ceplatform.ValidatePublicCloneURL(repo.CloneURL); err != nil {
		_ = s.store.FailScan(parent, scan, err)
		return
	}
	root, err := os.MkdirTemp("", "flyto-warroom-ce-scan-")
	if err != nil {
		_ = s.store.FailScan(parent, scan, err)
		return
	}
	defer os.RemoveAll(root)
	destination := root + string(os.PathSeparator) + "repo"
	cmd := exec.CommandContext(ctx, "git", "-c", "credential.helper=", "clone", "--depth", "1", "--no-tags", "--single-branch", repo.CloneURL, destination)
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0", "GIT_ASKPASS=/bin/false")
	output, err := cmd.CombinedOutput()
	if err != nil {
		message := strings.TrimSpace(string(output))
		if len(message) > 300 {
			message = message[len(message)-300:]
		}
		_ = s.store.FailScan(parent, scan, fmt.Errorf("public repository clone failed: %s", message))
		return
	}
	findings, err := ceplatform.ScanDirectory(ctx, destination, scan.OrgID, scan.RepoID, scan.ID)
	if err != nil {
		_ = s.store.FailScan(parent, scan, err)
		return
	}
	if err = s.store.CompleteScan(parent, scan, findings); err != nil {
		obs.Default().Error("CE scan persistence failed", "scan_id", scan.ID, "error", err)
		return
	}
	obs.Default().Info("CE source scan completed", "scan_id", scan.ID, "repo_id", scan.RepoID, "findings", len(findings))
}
