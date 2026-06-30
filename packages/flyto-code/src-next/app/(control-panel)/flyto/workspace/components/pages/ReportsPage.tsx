import { PageShell } from '@atoms/PageShell';
import { ReportsView } from '@compounds/reports/ReportsView';

export default function ReportsPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ReportsView />
    </PageShell>
  );
}
