import { PageShell } from '@atoms/PageShell';
import { ModeView } from '@compounds/_shared';
import { VAReportView, VAReportManagerView } from '@compounds/va-report';

// Engineer view = the full inline report artifact (iframe preview +
// download), preserved verbatim. Manager view = posture headline +
// one-click deliverable download, toggled via the top-bar switch.

export default function VAReportPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={<VAReportManagerView />}
        engineer={<VAReportView />}
      />
    </PageShell>
  );
}
