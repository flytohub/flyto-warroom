import { PageShell } from '@atoms/PageShell';
import { CloudFindingsView } from '@compounds/cloud/CloudFindingsView';

export default function CloudFindingsPage() {
  return (
    <PageShell padded={false} scroll="host">
      <CloudFindingsView />
    </PageShell>
  );
}
