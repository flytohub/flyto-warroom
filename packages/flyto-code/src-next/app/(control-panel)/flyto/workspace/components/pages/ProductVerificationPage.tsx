import { PageShell } from '@atoms/PageShell'
import { ProductVerificationView } from '@compounds/product-verification/ProductVerificationView'

export default function ProductVerificationPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ProductVerificationView />
    </PageShell>
  )
}
