import { PageShell } from '@atoms/PageShell'
import { IdentityPostureView } from '@compounds/surface/IdentityPostureView';

/**
 * Identity Security surface. Backed by GET /identity/posture — MFA
 * coverage, account status, and at-risk accounts rolled up from a BYO IdP
 * (Okta / Entra) via the kernel's identity.* claims. Falls back to a
 * connect-your-IdP placeholder when nothing is wired.
 */
export default function IdentityPage() {
  return (
    <PageShell padded={false} scroll="host">
      <IdentityPostureView />
    </PageShell>
  )
}
