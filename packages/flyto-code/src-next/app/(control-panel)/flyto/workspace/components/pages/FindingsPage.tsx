import { PageShell } from '@atoms/PageShell';
import { ModeView } from '@compounds/_shared';
import { FindingsView } from '@compounds/exposure/FindingsView';
import { FindingsManagerView } from '@compounds/exposure/FindingsManagerView';

// Promoted out of warroom/exp-findings into a top-level route as
// part of the 2026-05-21 IA refactor. Backward-compat alias for
// the old URL is wired in route.tsx via a Navigate redirect.
//
// Engineer view = the existing Bitsight-parity per-asset table,
// unchanged. Manager view = the new posture-summary dashboard.

export default function FindingsPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={<FindingsManagerView />}
        engineer={<FindingsView />}
      />
    </PageShell>
  );
}
