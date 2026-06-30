import { PageShell } from '@atoms/PageShell';
import { ModeView } from '@compounds/_shared';
import { ThreatActorsView } from '@compounds/threat-intel/ThreatActorsView';
import { ThreatActorsManagerView } from '@compounds/threat-intel/ThreatActorsManagerView';

export default function ThreatActorsPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={<ThreatActorsManagerView />}
        engineer={<ThreatActorsView />}
      />
    </PageShell>
  );
}
