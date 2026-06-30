import { PageShell } from '@atoms/PageShell';
import { ModeView } from '@compounds/_shared';
import { DomainsView } from '@compounds/domains/DomainsView';
import { DomainsManagerView } from '@compounds/domains/DomainsManagerView';

// Engineer view = existing domain inventory (import / scan / validate
// lifecycle, unchanged). Manager view = new KPI/chart posture summary.

export default function DomainsPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={<DomainsManagerView />}
        engineer={<DomainsView />}
      />
    </PageShell>
  );
}
