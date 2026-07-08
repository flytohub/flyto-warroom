import { PageShell } from '@atoms/PageShell'
import { EnterpriseControlPlaneView } from '@compounds/system/EnterpriseControlPlaneView'

export default function EnterpriseControlPlanePage() {
  return (
    <PageShell padded={false} scroll="host">
      <EnterpriseControlPlaneView />
    </PageShell>
  )
}
