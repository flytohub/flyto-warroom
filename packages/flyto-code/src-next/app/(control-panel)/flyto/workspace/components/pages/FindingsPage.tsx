import { PageShell } from '@atoms/PageShell';
import { ModeView } from '@compounds/_shared';
import { DomainsManagerView } from '@compounds/domains/DomainsManagerView';

// Promoted out of warroom/exp-findings into a top-level route as
// part of the 2026-05-21 IA refactor. Backward-compat alias for
// the old URL is wired in route.tsx via a Navigate redirect.
//
// Keep findings aligned with the domain findings workbench so both modes use
// the same dense table, filters, column picker, and detail interaction model.

export default function FindingsPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={<DomainsManagerView findingsTitle="Findings" />}
        engineer={<DomainsManagerView findingsTitle="Findings" />}
      />
    </PageShell>
  );
}
