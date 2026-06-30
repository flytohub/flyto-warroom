import { PageShell } from '@atoms/PageShell';
import { ModeView } from '@compounds/_shared';
import { BrandProtectionView } from '@compounds/exposure/BrandProtectionView';
import { BrandProtectionManagerView } from '@compounds/exposure/BrandProtectionManagerView';

export default function BrandProtectionPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView manager={<BrandProtectionManagerView />} engineer={<BrandProtectionView />} />
    </PageShell>
  );
}
