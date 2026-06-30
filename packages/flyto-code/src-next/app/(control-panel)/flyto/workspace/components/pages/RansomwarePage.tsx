import { PageShell } from '@atoms/PageShell';
import { ModeView } from '@compounds/_shared';
import { RansomwareView } from '@compounds/threat-intel/RansomwareView';
import { RansomwareManagerView } from '@compounds/threat-intel/RansomwareManagerView';

export default function RansomwarePage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={<RansomwareManagerView />}
        engineer={<RansomwareView />}
      />
    </PageShell>
  );
}
