import type { LucideIcon } from 'lucide-react'
import {
  Network, GitFork, GitBranch, Plug, Trash2, Zap, Layers, Code2,
  ShieldCheck, Scale, Target, FileCode, Swords,
  Bug, Cloud, Activity,
  Shield,
  GitCompare,
  Boxes,
} from 'lucide-react'

export interface SectionItem {
  id: string
  icon: LucideIcon
  labelKey: string
  fallback: string
  /** Feature flags this sub-item requires. ALL listed flags must be
   *  in the user's `capabilities.features` for the item to render.
   *  Omit (or empty) = inherits the parent section's gate.
   *
   *  Keep names in lockstep with the backend's
   *  `internal/permission/capabilities.yaml` — sidebar shows what
   *  the user is paying for, no more, no less. */
  requires?: string[]
}

export interface Section {
  id: string
  titleKey: string
  /** Legacy per-section accent. Kept on the data model but UNUSED by
   *  the sidebar after the 2026-05-19 de-rainbow pass — section
   *  identity is now carried by `headerIcon` shape, not colour. */
  color: string
  /** Distinctive Lucide icon rendered before the section title in the
   *  sidebar. Differentiates sections by shape so the nav doesn't read
   *  as monotonous lavender when all section headers share text.secondary
   *  colour (defaultNavbar's text.secondary IS lavender #c4b5fd, which
   *  is intentional brand chrome, just bad for differentiation if
   *  nothing else varies). Pair with the per-item `icon` field which
   *  differentiates rows WITHIN each section. */
  headerIcon: LucideIcon
  items: SectionItem[]
}

export const sections: Section[] = [
  // ── Architecture — bird's-eye view of the codebase ──
  {
    id: 'architecture',
    titleKey: 'section.architecture',
    color: '#a78bfa',
    headerIcon: Network,
    items: [
      { id: 'arch-overview', icon: Network, labelKey: 'item.archOverview', fallback: 'Overview' },
      { id: 'arch-repos', icon: GitBranch, labelKey: 'item.archRepos', fallback: 'Repositories' },
      { id: 'arch-dead-code', icon: Trash2, labelKey: 'item.deadCode', fallback: 'Dead Code' },
      // 'arch-duplicates' hidden 2026-06-04 — its endpoint (GET /orgs/{id}/
      // duplicates) isn't implemented on the backend (404 → empty view).
      // Restore this line when the route ships (tracked in apiPathContract
      // KNOWN_MISSING).
      { id: 'arch-complexity', icon: Zap, labelKey: 'item.complexity', fallback: 'Complexity' },
      { id: 'arch-frameworks', icon: Layers, labelKey: 'item.frameworks', fallback: 'Frameworks' },
      { id: 'arch-imports', icon: Code2, labelKey: 'item.imports', fallback: 'Imports' },
      { id: 'arch-deps', icon: GitFork, labelKey: 'item.dependencies', fallback: 'Dependencies' },
      { id: 'arch-api', icon: Plug, labelKey: 'item.apiList', fallback: 'API' },
      { id: 'arch-scan-diff', icon: GitCompare, labelKey: 'item.scanDiff', fallback: 'Scan Diff' },
    ],
  },
  {
    // Renamed 2026-05-21: "Security" → "Code Scans". The sub-items
    // here are all code-scan dimensions (IaC / License / Malware /
    // CSPM / Runtime / Reachability / Red Team / News). Calling
    // them "Security" collided with the top-level CODE group's
    // Issues / Pentest / AutoFix workflow + the EXPOSURE group's
    // external Findings — operator couldn't tell which "Security"
    // a finding belonged to.
    id: 'security',
    titleKey: 'section.codeScans',
    color: '#f87171',
    headerIcon: Shield,
    items: [
      { id: 'sec-overview', icon: ShieldCheck, labelKey: 'item.securityOverview', fallback: 'Overview' },
      { id: 'sec-iac', icon: FileCode, labelKey: 'item.iacScan', fallback: 'IaC' },
      { id: 'sec-license', icon: Scale, labelKey: 'item.licenseScan', fallback: 'License' },
      { id: 'sec-malware', icon: Bug, labelKey: 'item.malwareScan', fallback: 'Malware' },
      // Container image scan (Trivy base-image CVEs). Also first-classed
      // as the top-level `containers` module, but kept here so it's
      // reachable from the Code Scans drill-down sub-nav alongside its
      // sibling scan dimensions (the inner-nav entry was missing, which
      // left the deep /code-scans/sec-container route unreachable from UI).
      { id: 'sec-container', icon: Boxes, labelKey: 'item.containerScan', fallback: 'Containers' },
      { id: 'sec-cspm', icon: Cloud, labelKey: 'item.cspmScan', fallback: 'Cloud posture', requires: ['cspm'] },
      { id: 'sec-runtime', icon: Activity, labelKey: 'item.runtimeEvents', fallback: 'Runtime', requires: ['runtime_protection'] },
      { id: 'sec-reachability', icon: Target, labelKey: 'item.reachability', fallback: 'Reachability', requires: ['reachability'] },
      { id: 'sec-redteam', icon: Swords, labelKey: 'item.redTeam', fallback: 'Red Team', requires: ['red_team'] },
      { id: 'sec-news', icon: Activity, labelKey: 'item.securityNews', fallback: 'News' },
    ],
  },
  // CI/CD section pulled from sidebar 2026-05-21 — operator said
  // "沒屁用". cicd-pr (PRActivity) and cicd-gate (CIGate) compounds
  // still exist on disk and the routes still resolve via
  // sectionRegistry, but they're no longer in the default nav. PR
  // signal is already covered by the ContextStrip on every finding
  // row + Pulse's "open PR touching this file" segment, which is the
  // join most operators actually wanted out of these views.
  // IA refactor 2026-05-21 — Exposure / History / Scoring sections
  // pulled out of the war-room accordion entirely. Their sub-items
  // (Posture Overview / Findings / CTEM Actions / Brand Protection /
  // Mitigations / Vendor Risk / Attack Paths / Audit Timeline /
  // Score Trends / VA Report / Compliance) are now top-level
  // routes registered in `app/(control-panel)/.../workspace/route.tsx`
  // and surface as flat sidebar entries in WorkspaceSidebar.tsx
  // under EXPOSURE + INSIGHTS groups. Old warroom/<id> paths
  // still resolve via WarRoomDispatch in route.tsx (308-style
  // Navigate redirect), so deep-links and customer bookmarks
  // survive. War-room is now just the Architecture + Security
  // deep-drill accordion (10 + 12 sub-items) where grouping
  // genuinely helps.
]
