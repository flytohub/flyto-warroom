import { PageShell } from '@atoms/PageShell';
import { ModeView } from '@compounds/_shared';
import { PostureOverview } from '@compounds/exposure/PostureOverview';
import { PostureManagerView } from '@compounds/scoring/PostureManagerView';

export default function PostureOverviewPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={<PostureManagerView />}
        engineer={<PostureOverview />}
      />
    </PageShell>
  );
}
