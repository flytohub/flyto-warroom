import { PageShell } from '@atoms/PageShell'
import { DataLeaksView } from '@compounds/exposure/DataLeaksView';

export default function DataLeaksPage() {
  return (
    <PageShell padded={false} scroll="host">
      <DataLeaksView />
    </PageShell>
  )
}
