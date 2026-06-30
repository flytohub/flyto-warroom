import { useParams } from 'react-router';
import { PageShell } from '@atoms/PageShell';
import { WorkspaceRouteFallback } from '@atoms/WorkspaceRouteFallback';
import { ModeView } from '@compounds/_shared';
import { VendorRiskView, VendorRiskManagerView } from '@compounds/vendor-risk';

// Engineer view = today's editable vendor register, preserved verbatim.
// Manager view = the vendor-risk summary dashboard, toggled via the
// top-bar manager/engineer switch.

export default function VendorRiskPage() {
  const { orgId } = useParams<{ orgId: string }>();
  if (!orgId) return <WorkspaceRouteFallback />;
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={<VendorRiskManagerView orgId={orgId} />}
        engineer={<VendorRiskView orgId={orgId} />}
      />
    </PageShell>
  );
}
