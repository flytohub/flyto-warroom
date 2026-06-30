import { PageShell } from '@atoms/PageShell';
import { CloudPostureView } from '@compounds/cloud/CloudPostureView';

export default function CloudPosturePage() {
  return (
    <PageShell padded={false} scroll="host">
      <CloudPostureView />
    </PageShell>
  );
}
