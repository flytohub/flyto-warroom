import { PageShell } from '@atoms/PageShell';
import { ModeView } from '@compounds/_shared';
import { ScoringView } from '@compounds/scoring';
import { ScoringManagerView } from '@compounds/scoring/ScoringManagerView';

// Engineer view = the existing Bitsight-style scoring overview
// (category breakdown, weight donut, grade circle, methodology),
// unchanged. The compound owns its own full-height scroll.

// Manager view = new executive grade/weights/methodology surface.

export default function ScoringPage() {
  return (
    <PageShell padded={false} scroll="host">
      <ModeView
        manager={<ScoringManagerView />}
        engineer={<ScoringView />}
      />
    </PageShell>
  );
}
