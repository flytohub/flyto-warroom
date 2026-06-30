import { PageShell } from '@atoms/PageShell';
import { RiskMatrixView } from '@compounds/risk-matrix/RiskMatrixView';

export default function RiskMatrixPage() {
  // RiskMatrixView owns its own header + scrollable body (full-height
  // grid), so PageShell yields scroll/padding to the compound.
  return (
    <PageShell padded={false} scroll="host">
      <RiskMatrixView />
    </PageShell>
  );
}
