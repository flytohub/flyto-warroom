import { PageShell } from '@atoms/PageShell'
import { ContainerScanView } from '@compounds/scanning/Container';

/**
 * Containers surface — first-classes the existing container scan view
 * (Trivy image + base-image CVEs) as a top-level destination instead of
 * burying it inside the war-room Code Scans accordion.
 */
export default function ContainersPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ContainerScanView />
    </PageShell>
  )
}
