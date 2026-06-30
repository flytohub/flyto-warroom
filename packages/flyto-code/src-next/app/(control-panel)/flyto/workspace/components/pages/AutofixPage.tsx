import Box from '@mui/material/Box';
import { PageShell } from '@atoms/PageShell';
import { WorkspaceRouteFallback } from '@atoms/WorkspaceRouteFallback';
import { useParams } from 'react-router';
import { ModeView } from '@compounds/_shared';
import { AutofixManagerView } from '@compounds/autofix/AutofixManagerView';
import { AutofixView } from '@compounds/autofix/AutofixView';

export default function AutofixPage() {
  const { orgId } = useParams<{ orgId: string }>();
  if (!orgId) return <WorkspaceRouteFallback />;

  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={
          <Box sx={{ height: '100%', overflow: 'auto' }}>
            <AutofixManagerView orgId={orgId} />
          </Box>
        }
        engineer={<AutofixView />}
      />
    </PageShell>
  );
}
