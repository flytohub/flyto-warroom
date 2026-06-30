import { PageShell } from '@atoms/PageShell';
import { ExecOverviewView } from '@compounds/exec/ExecOverviewView';

// Executive overview — manager-mode landing. Owns its own scroll via
// ManagerDashboard, so PageShell only hosts height.

export default function ExecOverviewPage() {
  return (
    <PageShell padded={false} scroll="self">
      <ExecOverviewView />
    </PageShell>
  );
}
