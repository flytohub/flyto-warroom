import { PageShell } from '@atoms/PageShell';
import { ModeView } from '@compounds/_shared';
import { ScoreTrendsView } from '@compounds/scoring';
import { ScoreTrendsManagerView } from '@compounds/scoring/ScoreTrendsManagerView';

// Engineer view = the existing Score Trends view, unchanged.

// Manager view = momentum + 30-day forecast + grade-change ledger.

export default function ScoreTrendsPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={<ScoreTrendsManagerView />}
        engineer={<ScoreTrendsView />}
      />
    </PageShell>
  );
}
