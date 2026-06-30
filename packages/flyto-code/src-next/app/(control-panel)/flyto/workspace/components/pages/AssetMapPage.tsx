import { PageShell } from '@atoms/PageShell';
import { ModeView } from '@compounds/_shared';
import { AssetMapView } from '@compounds/asset-map/AssetMapView';
import { AssetMapManagerView } from '@compounds/asset-map/AssetMapManagerView';

// Engineer view = existing dense kernel asset map (cards + relationship
// inspector, unchanged). Manager view = new KPI/chart roll-up.

export default function AssetMapPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={<AssetMapManagerView />}
        engineer={<AssetMapView />}
      />
    </PageShell>
  );
}
