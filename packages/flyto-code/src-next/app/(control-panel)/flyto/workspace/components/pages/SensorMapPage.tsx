import { PageShell } from '@atoms/PageShell';
import { ModeView } from '@compounds/_shared';
import { SensorMapView } from '@compounds/threat-intel/SensorMapView';
import { SensorMapManagerView } from '@compounds/threat-intel/SensorMapManagerView';

export default function SensorMapPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={<SensorMapManagerView />}
        engineer={<SensorMapView />}
      />
    </PageShell>
  );
}
