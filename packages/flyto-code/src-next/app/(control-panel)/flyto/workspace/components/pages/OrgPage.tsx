import { OrgTree } from '@compounds/organization';
import { PageShell } from '@atoms/PageShell';
import { ModeView } from '@compounds/_shared';
import { OrgManagerView } from '@compounds/organization/OrgManagerView';

// Manager surface is lazy so engineer-mode (the interactive org-chart
// canvas) carries no extra bundle weight when the user never switches.

export default function OrgPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        engineer={<OrgTree />}
        manager={
          <div style={{ height: '100%', overflowY: 'auto' }}>
            <OrgManagerView />
          </div>
        }
      />
    </PageShell>
  );
}
