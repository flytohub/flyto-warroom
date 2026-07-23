# Flyto2 Warroom CE Frontend Source Boundary

This package is the physically independent Community Edition frontend exported
from `flyto-code/src-ce`. It does not copy or prune the private unified cockpit.

Included Community product loop:

- one-time local administrator creation and local JWT sign-in;
- projects and credential-free public repository connections;
- scan queue/activity, findings, evidence, and transparent risk hypotheses;
- remediation guidance with finding-fingerprint re-verification;
- local portable HTML reports;
- built-in language selection and light/dark/system themes.

Commercial correlation models, authoritative ratings, managed provider
credentials, live remediation/approval/rollback orchestration, and the
SaaS/Enterprise control plane remain outside this source package.

Paid editions compose these capabilities as reviewed build-time overlays on a
pinned CE commit. This public package must not ship enterprise control-plane implementation.
