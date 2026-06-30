import { PageShell } from '@atoms/PageShell';
import { ModeView } from '@compounds/_shared';
import { ComplianceDashboardView } from '@compounds/scoring';
import { ComplianceManagerView } from '@compounds/scoring/ComplianceManagerView';

export default function CompliancePage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={<ComplianceManagerView />}
        engineer={<ComplianceDashboardView />}
      />
    </PageShell>
  );
}
