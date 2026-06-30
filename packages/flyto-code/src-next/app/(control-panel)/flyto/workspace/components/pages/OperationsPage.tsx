import { PageShell } from '@atoms/PageShell';
import { OperationsView } from '@compounds/operations/OperationsView';

export default function OperationsPage() {
  return (
    <PageShell padded={false} scroll="host">
      <OperationsView />
    </PageShell>
  );
}
