import { PageShell } from '@atoms/PageShell'
import { ModeView } from '@compounds/_shared'
import { AssetCoverageManagerView, AssetCoverageEngineerView } from '@compounds/asset-coverage/AssetCoverageView';

export default function AssetCoveragePage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={<AssetCoverageManagerView />}
        engineer={<AssetCoverageEngineerView />}
      />
    </PageShell>
  )
}
