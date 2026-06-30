import { PageShell } from '@atoms/PageShell';
import { ModeView } from '@compounds/_shared';
import { IoCLookupView } from '@compounds/threat-intel/IoCLookupView';
import { IoCManagerView } from '@compounds/threat-intel/IoCManagerView';

export default function IoCLookupPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView manager={<IoCManagerView />} engineer={<IoCLookupView />} />
    </PageShell>
  );
}
