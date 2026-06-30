import { PageShell } from '@atoms/PageShell';
import { ModeView } from '@compounds/_shared';
import { SettingsView } from '@compounds/settings/SettingsView';
import { SettingsManagerView } from '@compounds/settings/SettingsManagerView';

// Engineer mode = the full settings console (unchanged). Manager mode
// = a governance/billing roll-up. Both lazy so neither loads until used.

export default function SettingsPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        engineer={<SettingsView />}
        manager={
          <div style={{ height: '100%', overflowY: 'auto' }}>
            <SettingsManagerView />
          </div>
        }
      />
    </PageShell>
  );
}
