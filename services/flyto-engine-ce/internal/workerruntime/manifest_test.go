package workerruntime

import "testing"

func TestResolveModeKeepsSchedulerFailClosedForQueueOnly(t *testing.T) {
	mode, err := ResolveMode("queue-only", true)
	if err != nil {
		t.Fatalf("ResolveMode: %v", err)
	}
	if !mode.QueueOnly {
		t.Fatalf("QueueOnly = false")
	}
	if mode.SchedulesEnabled {
		t.Fatalf("SchedulesEnabled = true, want false")
	}
	if mode.Oneshot {
		t.Fatalf("Oneshot = true")
	}
	if !mode.QueueEnabled {
		t.Fatalf("QueueEnabled = false")
	}
}

func TestResolveModeOneshotKeepsSchedulesEnabledForRunOnceRegistry(t *testing.T) {
	mode, err := ResolveMode("oneshot", true)
	if err != nil {
		t.Fatalf("ResolveMode: %v", err)
	}
	if !mode.Oneshot {
		t.Fatalf("Oneshot = false")
	}
	if !mode.SchedulesEnabled {
		t.Fatalf("SchedulesEnabled = false, want true")
	}
}

func TestResolveModeSchedulerOnlyDisablesQueue(t *testing.T) {
	mode, err := ResolveMode("scheduler-only", true)
	if err != nil {
		t.Fatalf("ResolveMode: %v", err)
	}
	if !mode.SchedulerOnly || !mode.SchedulesEnabled || mode.QueueEnabled {
		t.Fatalf("unexpected scheduler-only mode: %+v", mode)
	}
}

func TestResolveModeRejectsUnknownAndContradictoryModes(t *testing.T) {
	for _, tc := range []struct {
		raw              string
		schedulerEnabled bool
	}{
		{raw: "typo", schedulerEnabled: true},
		{raw: "scheduler-only", schedulerEnabled: false},
		{raw: "oneshot", schedulerEnabled: false},
	} {
		if _, err := ResolveMode(tc.raw, tc.schedulerEnabled); err == nil {
			t.Fatalf("ResolveMode(%q, %v) accepted invalid configuration", tc.raw, tc.schedulerEnabled)
		}
	}
}

func TestResolveScannerModules(t *testing.T) {
	all, err := ResolveScannerModules("")
	if err != nil || len(all) != 6 {
		t.Fatalf("all modules = %v, %v", all, err)
	}
	selected, err := ResolveScannerModules("core, verification,core")
	if err != nil {
		t.Fatalf("ResolveScannerModules: %v", err)
	}
	if len(selected) != 2 || !selected[ScannerModuleCore] || !selected[ScannerModuleVerification] {
		t.Fatalf("selected modules = %v", selected)
	}
	if _, err := ResolveScannerModules("core,typo"); err == nil {
		t.Fatal("unknown scanner module was accepted")
	}
}

func TestParseWorkspaceListTrimsDropsEmptyAndDedupes(t *testing.T) {
	got := ParseWorkspaceList(" ws-1, ,ws-2,ws-1 ,, ws-3 ")
	want := []string{"ws-1", "ws-2", "ws-3"}
	if len(got) != len(want) {
		t.Fatalf("len = %d, want %d (%v)", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got[%d] = %q, want %q (%v)", i, got[i], want[i], got)
		}
	}
}

func TestParseScannerIDsTrimsDropsEmptyAndDedupes(t *testing.T) {
	got := ParseScannerIDs(" footprint_auto,ctem_verify,footprint_auto ")
	if len(got) != 2 || got[0] != "footprint_auto" || got[1] != "ctem_verify" {
		t.Fatalf("ParseScannerIDs = %v", got)
	}
}

func TestValidateLoopManifest(t *testing.T) {
	valid := LoopManifest{
		ID:      "ctem_verify",
		Surface: "exposure",
		Mode:    LoopModeScheduled,
		Edition: "enterprise",
	}
	if !ValidateLoopManifest(valid) {
		t.Fatalf("valid manifest rejected")
	}
	invalid := valid
	invalid.Mode = "forever"
	if ValidateLoopManifest(invalid) {
		t.Fatalf("invalid mode accepted")
	}
	invalid = valid
	invalid.Edition = ""
	if ValidateLoopManifest(invalid) {
		t.Fatalf("missing edition accepted")
	}
}
