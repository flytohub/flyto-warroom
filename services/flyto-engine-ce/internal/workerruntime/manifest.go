package workerruntime

import (
	"fmt"
	"sort"
	"strings"
)

const (
	ModeDefault       = ""
	ModeAll           = "all"
	ModeOneshot       = "oneshot"
	ModeQueueOnly     = "queue-only"
	ModeSchedulerOnly = "scheduler-only"

	LoopModeOneshot    = "oneshot"
	LoopModeScheduled  = "scheduled"
	LoopModeContinuous = "continuous"
)

type Mode struct {
	Raw              string
	Oneshot          bool
	QueueOnly        bool
	SchedulerOnly    bool
	QueueEnabled     bool
	SchedulesEnabled bool
}

type LoopManifest struct {
	ID              string
	Surface         string
	Mode            string
	Requires        []string
	Edition         string
	EvidenceOutputs []string
}

func ResolveMode(raw string, schedulerEnabled bool) (Mode, error) {
	trimmed := strings.ToLower(strings.TrimSpace(raw))
	mode := Mode{
		Raw:           trimmed,
		Oneshot:       trimmed == ModeOneshot,
		QueueOnly:     trimmed == ModeQueueOnly,
		SchedulerOnly: trimmed == ModeSchedulerOnly,
	}
	switch trimmed {
	case ModeDefault, ModeAll:
		mode.QueueEnabled = true
		mode.SchedulesEnabled = schedulerEnabled
	case ModeQueueOnly:
		mode.QueueEnabled = true
	case ModeSchedulerOnly:
		if !schedulerEnabled {
			return Mode{}, fmt.Errorf("worker mode %q requires scheduler enablement", trimmed)
		}
		mode.SchedulesEnabled = true
	case ModeOneshot:
		if !schedulerEnabled {
			return Mode{}, fmt.Errorf("worker mode %q requires scheduler enablement", trimmed)
		}
		mode.QueueEnabled = true
		mode.SchedulesEnabled = true
	default:
		return Mode{}, fmt.Errorf("unsupported worker mode %q", trimmed)
	}
	return mode, nil
}

const (
	ScannerModuleCore         = "core"
	ScannerModulePosture      = "posture"
	ScannerModuleMonitoring   = "monitoring"
	ScannerModuleIdentity     = "identity"
	ScannerModuleThreat       = "threat"
	ScannerModuleVerification = "verification"
)

var scannerModules = map[string]struct{}{
	ScannerModuleCore:         {},
	ScannerModulePosture:      {},
	ScannerModuleMonitoring:   {},
	ScannerModuleIdentity:     {},
	ScannerModuleThreat:       {},
	ScannerModuleVerification: {},
}

// ResolveScannerModules returns an explicit registration boundary for a
// scheduler deployment. Empty or "all" selects every public module. Unknown
// names are rejected so a typo cannot silently start an incomplete scanner.
func ResolveScannerModules(raw string) (map[string]bool, error) {
	selected := make(map[string]bool, len(scannerModules))
	trimmed := strings.ToLower(strings.TrimSpace(raw))
	if trimmed == "" || trimmed == ModeAll {
		for module := range scannerModules {
			selected[module] = true
		}
		return selected, nil
	}
	for _, part := range strings.Split(trimmed, ",") {
		module := strings.TrimSpace(part)
		if module == "" {
			continue
		}
		if _, ok := scannerModules[module]; !ok {
			allowed := make([]string, 0, len(scannerModules))
			for candidate := range scannerModules {
				allowed = append(allowed, candidate)
			}
			sort.Strings(allowed)
			return nil, fmt.Errorf("unsupported scanner module %q (allowed: %s)", module, strings.Join(allowed, ","))
		}
		selected[module] = true
	}
	if len(selected) == 0 {
		return nil, fmt.Errorf("scanner module selection is empty")
	}
	return selected, nil
}

func ParseWorkspaceList(raw string) []string {
	return parseList(raw)
}

func ParseScannerIDs(raw string) []string {
	return parseList(raw)
}

func parseList(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	seen := map[string]struct{}{}
	for _, part := range parts {
		ws := strings.TrimSpace(part)
		if ws == "" {
			continue
		}
		if _, ok := seen[ws]; ok {
			continue
		}
		seen[ws] = struct{}{}
		out = append(out, ws)
	}
	return out
}

func ValidateLoopManifest(m LoopManifest) bool {
	if strings.TrimSpace(m.ID) == "" || strings.TrimSpace(m.Surface) == "" {
		return false
	}
	switch m.Mode {
	case LoopModeOneshot, LoopModeScheduled, LoopModeContinuous:
	default:
		return false
	}
	if strings.TrimSpace(m.Edition) == "" {
		return false
	}
	return true
}
