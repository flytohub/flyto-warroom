import { PageShell } from '@atoms/PageShell';
import { TimelineCenterView } from '@compounds/timeline/TimelineCenterView';

// Layered L1–L4 audit timeline. The view owns its own full-height
// chrome + scroll, so the shell only constrains height (host scroll,
// no padding). Homepage lane wires the route + nav entry.

export default function TimelineCenterPage() {
  return (
    <PageShell padded={false} scroll="host">
      <TimelineCenterView />
    </PageShell>
  );
}
