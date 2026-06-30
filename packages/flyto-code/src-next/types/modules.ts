/**
 * modules.ts — canonical list of all workspace top-level modules.
 *
 * Single source of truth consumed by:
 *   - app/(control-panel)/.../route.tsx
 *   - app/(control-panel)/.../components/WorkspaceSidebar.tsx
 *   - app/(control-panel)/.../components/WorkspaceLayout.tsx (full-bleed gate)
 *
 * Adding a new module:
 *   1. Add capability id to flyto-engine/internal/permission/capabilities.yaml
 *   2. Create the compound at src-next/components/compounds/<domain>/<View>.tsx
 *   3. Create a thin page wrapper at app/.../pages/<X>Page.tsx
 *   4. Add an entry below — order within group = nav order
 *   5. Add i18n key (en + zh-TW + zh-CN + ja minimum) to flyto-i18n
 *
 * Sidebar / route / full-bleed list update automatically from the
 * new entry. No more 5-file edit dance.
 */

import {
  // Overview
  LayoutDashboard, Activity, Workflow,
  // Assets
  GitBranch, Globe, MapPin, Network, ClipboardCheck,
  // Code
  Shield, Radar, Wand2, Boxes, ScanLine,
  // Exposure
  Gauge, ListChecks, Sparkles, Crosshair, ShieldCheck, Building2,
  // Verdict-first homepage + history/risk surfaces
  History, Grid3x3,
  // Cloud
  Cloud, CloudCog,
  // Container / Runtime / Identity
  Bot, Fingerprint,
  // Operations
  HeartPulse,
  // Darkweb
  Bug, Cpu, AlertTriangle, Database, Map, KeyRound,
  // Brand / coming-soon
  Share2, Smartphone, FileSearch, RadioTower, FlaskConical,
  // History / Scoring
  Clock, GitFork, Scale, BarChart3,
  // Admin
  FileText, Settings,
} from 'lucide-react'

import type { Module } from './Module'

export const MODULES: Module[] = [
  // ── OVERVIEW ──────────────────────────────────────────────────
  // Legacy /exec route. Hidden from navigation; route.tsx redirects
  // the public URL back to /dashboard.
  {
    id: 'exec',
    path: 'exec',
    fullBleed: true,
    capability: 'dashboard',
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/DashboardPage'),
    sidebar: { group: 'hidden', labelKey: 'nav.exec', fallback: 'Executive', icon: LayoutDashboard },
  },
  // Verdict-first homepage — the war-room landing view. Leads with
  // Verified Attack Paths + Verified Safe (red/green duality) +
  // MTTV/MTTR, NOT a single Bitsight score. The workspace index route
  // points here. Ungated (always-on, like dashboard).
  {
    id: 'verdict',
    path: 'verdict',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/VerdictDashboardPage'),
    sidebar: { group: 'overview', labelKey: 'nav.verdict', fallback: 'Verdict', icon: ShieldCheck },
  },
  {
    id: 'dashboard',
    path: 'dashboard',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/DashboardPage'),
    sidebar: { group: 'overview', labelKey: 'quick.dashboard', fallback: 'Dashboard', icon: LayoutDashboard },
  },
  {
    id: 'pulse',
    path: 'pulse',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/PulsePage'),
    sidebar: { group: 'overview', labelKey: 'nav.pulse', fallback: 'Pulse', icon: Activity },
  },
  {
    id: 'footprint',
    path: 'footprint',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/FootprintPage'),
    sidebar: { group: 'overview', labelKey: 'nav.footprint', fallback: 'Footprint', icon: Workflow },
  },

  // ── ASSETS ────────────────────────────────────────────────────
  {
    id: 'repos',
    path: 'repos',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ReposPage'),
    sidebar: { group: 'assets', labelKey: 'nav.repos', fallback: 'Repositories', icon: GitBranch, count: 'repos' },
  },
  {
    id: 'domains',
    path: 'domains',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/DomainsPage'),
    sidebar: { group: 'assets', labelKey: 'nav.domains', fallback: 'Domains', icon: Globe, count: 'domains' },
  },
  {
    id: 'asset_map',
    path: 'asset-map',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/AssetMapPage'),
    sidebar: { group: 'assets', labelKey: 'item.assetMap', fallback: 'Asset Map', icon: MapPin },
  },
  {
    id: 'asset_coverage',
    path: 'asset-coverage',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/AssetCoveragePage'),
    sidebar: { group: 'assets', labelKey: 'nav.assetCoverage', fallback: 'Asset Coverage', icon: ClipboardCheck },
  },

  // ── CODE ──────────────────────────────────────────────────────
  {
    id: 'issues',
    path: 'issues',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/IssuesPage'),
    sidebar: { group: 'code', labelKey: 'nav.codeIssues', fallback: 'Code Issues', icon: Shield, count: 'issues' },
  },
  {
    id: 'pentest',
    path: 'pentest',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/PentestPage'),
    sidebar: { group: 'code', labelKey: 'nav.pentest', fallback: 'Pentest', icon: Radar },
  },
  {
    id: 'product_verification',
    path: 'product-verification',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ProductVerificationPage'),
    sidebar: { group: 'code', labelKey: 'nav.productVerification', fallback: 'Product Verification', icon: ClipboardCheck },
  },
  {
    id: 'autofix',
    path: 'autofix',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/AutofixPage'),
    sidebar: { group: 'code', labelKey: 'nav.autofix', fallback: 'AutoFix', icon: Wand2, count: 'autofix' },
  },
  // Architecture + Code Scans — the two deep technical surfaces that
  // used to live in the legacy below-the-divider war-room accordion.
  // Promoted to first-class modules 2026-06-05 (accordion removed,
  // single modern sidebar). Splat path carries the deep sub-section id
  // (/architecture/arch-deps) so each technical view deep-links; the
  // render engine is still WarRoomView + sectionRegistry. Capability
  // gate = the existing backend `warroom_architecture` / `warroom_security`
  // page ids (both require code_audit) — kept so old /warroom/:id
  // bookmarks and backend aliases keep resolving.
  {
    id: 'architecture',
    path: 'architecture/*',
    capability: 'warroom_architecture',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ArchitecturePage'),
    sidebar: { group: 'code', labelKey: 'section.architecture', fallback: 'Architecture', icon: Boxes },
  },
  {
    id: 'code-scans',
    path: 'code-scans/*',
    capability: 'warroom_security',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/CodeScansPage'),
    sidebar: { group: 'code', labelKey: 'section.codeScans', fallback: 'Code Scans', icon: ScanLine },
  },
  {
    // Container security — Trivy image + base-image CVEs. First-classed
    // out of the war-room Code Scans accordion. Gated on the `containers`
    // page id (NOT the `code_audit` feature — canSeePage checks pages, not
    // features); the backend only puts `containers` in visible_pages for
    // code-entitled orgs, so it stays hidden for external-only orgs.
    id: 'containers',
    path: 'containers',
    capability: 'containers',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ContainersPage'),
    sidebar: { group: 'code', labelKey: 'nav.containers', fallback: 'Containers', icon: Boxes },
  },
  // Vulnerability Management was a separate nav entry that rendered the
  // SAME IssuesView pre-filtered to type=cve — a duplicate of Code Issues
  // with identical data. Removed 2026-06-11; the CVE-only lens is still
  // reachable via the Code Issues type filter, and old /vulnerabilities
  // bookmarks redirect to /issues (see route.tsx).

  // ── EXPOSURE ──────────────────────────────────────────────────
  {
    id: 'posture_overview',
    path: 'posture-overview',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/PostureOverviewPage'),
    sidebar: { group: 'exposure', labelKey: 'nav.postureOverview', fallback: 'Posture Overview', icon: Gauge },
  },
  {
    id: 'findings',
    path: 'findings',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/FindingsPage'),
    sidebar: { group: 'exposure', labelKey: 'nav.findings', fallback: 'Findings', icon: ListChecks },
  },
  {
    id: 'ctem_actions',
    path: 'ctem-actions',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/CTEMActionsPage'),
    sidebar: { group: 'exposure', labelKey: 'nav.ctemActions', fallback: 'CTEM Actions', icon: Sparkles },
  },
  // ── CLOUD ──────────────────────────────────────────────────────────
  // Ungated (like attack_paths / audit_timeline) so picking a Cloud (CSPM)
  // project actually surfaces a UI. Previously gated on the `cspm` capability,
  // which only the code_ctem_cspm tier grants — so selecting Cloud created a
  // project but the nav stayed hidden ("I picked cloud but there's no UI").
  // The pages carry honest empty states when there's no cloud data yet. The
  // proper per-org "project_type=cloud auto-grants cspm" capability work
  // remains an operator-side follow-up; this keeps the surface reachable now.
  {
    id: 'cloud_posture',
    path: 'cloud-posture',
    // Gate on the real backend page-id `cspm` (capabilities.yaml) — NOT the
    // module id. Without this, canSeePage('cloud_posture') checks a page that
    // doesn't exist and the item is denied once capabilities load. Cloud
    // Posture IS the CSPM surface.
    capability: 'cspm',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/CloudPosturePage'),
    sidebar: { group: 'cloud', labelKey: 'nav.cloudPosture', fallback: 'Cloud Posture', icon: Cloud },
  },
  {
    id: 'cloud_findings',
    path: 'cloud-findings',
    capability: 'cspm',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/CloudFindingsPage'),
    sidebar: { group: 'cloud', labelKey: 'nav.cloudFindings', fallback: 'CSPM Findings', icon: CloudCog },
  },
  // ── AGENT FIREWALL (MCP transport) ──────────────────────────────────
  // Active Agent Firewall surface: setup/test connection, policy simulation,
  // rollout control, recent decisions, and egress-risk drilldowns. Gated on
  // the `mcp` page id so entitlement keeps matching backend capability state.
  {
    id: 'ai_security_center',
    path: 'agent-firewall/security-center',
    capability: 'mcp',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/AISecurityCenterPage'),
    sidebar: { group: 'runtime', labelKey: 'nav.aiSecurityCenter', fallback: 'AI Security Center', icon: RadioTower },
  },
  {
    id: 'agent_firewall_attack_lab',
    path: 'agent-firewall/attack-lab',
    capability: 'mcp',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/AgentFirewallAttackLabPage'),
    sidebar: { group: 'runtime', labelKey: 'nav.agentAttackLab', fallback: 'Attack Lab', icon: FlaskConical },
  },
  {
    id: 'ai_governance',
    path: 'agent-firewall/governance',
    capability: 'mcp',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/AIGovernancePage'),
    sidebar: { group: 'runtime', labelKey: 'nav.aiGovernance', fallback: 'AI Governance', icon: ClipboardCheck },
  },
  {
    id: 'mcp',
    path: 'mcp',
    capability: 'mcp',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/McpPage'),
    sidebar: { group: 'runtime', labelKey: 'nav.agentFirewall', fallback: 'Agent Firewall', icon: Bot },
  },
  {
    id: 'agent_firewall_activity',
    path: 'agent-firewall/activity',
    capability: 'mcp',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/AgentFirewallActivityPage'),
    sidebar: { group: 'runtime', labelKey: 'nav.agentActivity', fallback: 'Agent Activity', icon: Activity },
  },
  {
    id: 'shadow_ai',
    path: 'agent-firewall/shadow-ai',
    capability: 'mcp',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ShadowAIPage'),
    sidebar: { group: 'runtime', labelKey: 'nav.shadowAI', fallback: 'Shadow AI', icon: Smartphone },
  },
  {
    id: 'ai_dlp',
    path: 'agent-firewall/ai-dlp',
    capability: 'mcp',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/AIDLPPage'),
    sidebar: { group: 'runtime', labelKey: 'nav.aiDLP', fallback: 'AI DLP', icon: Database },
  },
  {
    id: 'ai_evidence_reports',
    path: 'agent-firewall/evidence',
    capability: 'mcp',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/EvidenceReportsPage'),
    sidebar: { group: 'runtime', labelKey: 'nav.aiEvidenceReports', fallback: 'Evidence Reports', icon: FileSearch },
  },
  // ── IDENTITY ────────────────────────────────────────────────────────
  // Bring-your-own-IdP surface; no Flyto-native engine yet. Placeholder
  // page points the user at Settings → Integrations. Gated on the
  // `identity` page id — dark until the backend resolves it.
  {
    id: 'identity',
    path: 'identity',
    capability: 'identity',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/IdentityPage'),
    sidebar: { group: 'identity', labelKey: 'nav.identity', fallback: 'Identity', icon: Fingerprint },
  },
  // ── OPERATIONS (operator plane v1) ──────────────────────────────────
  // Gated on its own `operations` page id. Operator-side one-liner to
  // light it up: add `pages: { operations: { requires: [] } }` to
  // capabilities.yaml (visible to all org members; the system-wiring
  // panel self-gates to platform-admins via /events/scope). Until then
  // it's dark — same gated-then-enabled pattern as cloud.
  {
    id: 'operations',
    path: 'operations',
    // Operator plane (connector/scan/system health + SLA budget). Gated on the
    // `operations` page-id — an always-on page the backend now resolves into
    // visible_pages (capabilities.yaml, added 2026-06-04). Org-wide read view.
    capability: 'operations',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/OperationsPage'),
    sidebar: { group: 'operations', labelKey: 'nav.operations', fallback: 'Operations', icon: HeartPulse },
  },
  {
    id: 'attack_paths',
    path: 'attack-paths',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/AttackPathsPage'),
    sidebar: { group: 'exposure', labelKey: 'nav.attack_paths', fallback: 'Attack Paths', icon: Crosshair },
  },
  {
    id: 'mitigations',
    path: 'mitigations',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/MitigationsPage'),
    sidebar: { group: 'exposure', labelKey: 'nav.mitigations', fallback: 'Mitigations', icon: ShieldCheck },
  },
  {
    id: 'vendor_risk',
    path: 'vendors',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/VendorRiskPage'),
    sidebar: { group: 'exposure', labelKey: 'nav.vendorRisk', fallback: 'Vendor Risk', icon: Building2 },
  },
  // 5×4 importance×severity risk matrix (evidence-gated good/bad cells,
  // honest zeros) — owned by the risk-matrix lane (RiskMatrixPage).
  // Gated on the backend `risk_matrix` page id (always-on; pageId derives
  // from the module id since no capability override is set).
  {
    id: 'risk_matrix',
    path: 'risk-matrix',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/RiskMatrixPage'),
    sidebar: { group: 'exposure', labelKey: 'nav.riskMatrix', fallback: 'Risk Matrix', icon: Grid3x3 },
  },

  // ── DARKWEB & THREAT INTEL ────────────────────────────────────
  {
    id: 'threat_actors',
    path: 'threat-actors',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ThreatActorsPage'),
    sidebar: { group: 'darkweb', labelKey: 'nav.threatActors', fallback: 'Threat Actors', icon: Bug },
  },
  {
    id: 'malware_families',
    path: 'malware-families',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/MalwareFamiliesPage'),
    sidebar: { group: 'darkweb', labelKey: 'nav.malwareFamilies', fallback: 'Malware Families', icon: Cpu },
  },
  {
    id: 'ransomware_incidents',
    path: 'ransomware-incidents',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/RansomwarePage'),
    sidebar: { group: 'darkweb', labelKey: 'nav.ransomware', fallback: 'Ransomware', icon: AlertTriangle },
  },
  {
    // Data Leaks — leaked-credential / breach exposure (HIBP). Promoted
    // from a buried Posture-Overview tab to a first-class page. Gated on the
    // existing `posture_overview` page id (external posture data) so no
    // backend change is needed.
    id: 'data_leaks',
    path: 'data-leaks',
    capability: 'posture_overview',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/DataLeaksPage'),
    sidebar: { group: 'darkweb', labelKey: 'nav.dataLeaks', fallback: 'Data Leaks', icon: KeyRound },
  },
  {
    id: 'ioc_lookup',
    path: 'ioc-lookup',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/IoCLookupPage'),
    sidebar: { group: 'darkweb', labelKey: 'nav.iocLookup', fallback: 'IoC Lookup', icon: Database },
  },
  {
    id: 'sensor_map',
    path: 'sensor-map',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/SensorMapPage'),
    sidebar: { group: 'darkweb', labelKey: 'nav.sensorMap', fallback: 'Sensor Map', icon: Map },
  },
  {
    id: 'brand_protection',
    path: 'brand-protection',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/BrandProtectionPage'),
    sidebar: { group: 'darkweb', labelKey: 'nav.brandProtection', fallback: 'Brand Protection', icon: Shield },
  },
  {
    // BotShield — botnet/C2 indicators (real: IoC view pinned to kind=c2).
    id: 'botshield', path: 'botshield', capability: 'ioc_lookup', fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/BotShieldPage'),
    sidebar: { group: 'darkweb', labelKey: 'botshield.title', fallback: 'BotShield', icon: Bug },
  },
  // ── Coming-soon surfaces (no backend yet — honest placeholders). All
  // route to the single ComingSoonPage, resolved by path via the
  // comingSoonSurfaces registry. They are kept routed for future wiring,
  // but hidden + gated on their own page ids until the backend can provide
  // real data. Borrowing `posture_overview`/`cspm` made users see nav rows
  // that only rendered placeholders, which lowered the workspace signal.
  {
    id: 'social_media', path: 'social-media', capability: 'social_media', fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ComingSoonPage'),
    sidebar: { group: 'hidden', labelKey: 'soon.socialMedia.title', fallback: 'Social Media Monitoring', icon: Share2 },
  },
  {
    id: 'mobile_apps', path: 'mobile-apps', capability: 'mobile_apps', fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ComingSoonPage'),
    sidebar: { group: 'hidden', labelKey: 'soon.mobileApps.title', fallback: 'Mobile App Monitoring', icon: Smartphone },
  },
  {
    id: 'newly_registered_domains', path: 'newly-registered-domains', capability: 'newly_registered_domains', fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ComingSoonPage'),
    sidebar: { group: 'hidden', labelKey: 'soon.nrd.title', fallback: 'Newly Registered Domains', icon: Globe },
  },
  {
    id: 'website_watermarking', path: 'website-watermarking', capability: 'website_watermarking', fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ComingSoonPage'),
    sidebar: { group: 'hidden', labelKey: 'soon.watermark.title', fallback: 'Website Watermarking', icon: ShieldCheck },
  },
  {
    id: 'detection_rules', path: 'detection-rules', capability: 'detection_rules', fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ComingSoonPage'),
    sidebar: { group: 'hidden', labelKey: 'soon.detectionRules.title', fallback: 'Threat Detection Rules', icon: FileSearch },
  },
  {
    id: 'cloud_storage_exposure', path: 'cloud-storage-exposure', capability: 'cloud_storage_exposure', fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ComingSoonPage'),
    sidebar: { group: 'hidden', labelKey: 'soon.cloudStorage.title', fallback: 'Cloud Storage Exposure', icon: Database },
  },

  // ── HISTORY ───────────────────────────────────────────────────
  {
    id: 'audit_timeline',
    path: 'audit-timeline',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/AuditTimelinePage'),
    sidebar: { group: 'history', labelKey: 'nav.auditTimeline', fallback: 'Audit Timeline', icon: Clock },
  },
  // Layered audit timeline (L1–L4) — the timeline-center surface owned
  // by the timeline lane (TimelineCenterPage). Always-on; gated on the
  // backend `timeline` page id (pageId derives from the module id since no
  // capability override is set), honest-empty when there's no history yet.
  {
    id: 'timeline',
    path: 'timeline',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/TimelineCenterPage'),
    sidebar: { group: 'history', labelKey: 'nav.timeline', fallback: 'Timeline', icon: History },
  },

  // ── SCORING ───────────────────────────────────────────────────
  // ScoringView (the Bitsight-style category breakdown + weight donut
  // + methodology) was orphaned during the Phase 3 module-manifest
  // refactor — sectionRegistry kept it at `scoring-overview` but no
  // top-level route picked it up. Restored 2026-05-22 (operator:
  // "之前不是有一個評分表嗎 怎麼不見了").
  {
    id: 'scoring',
    path: 'scoring',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ScoringPage'),
    sidebar: { group: 'scoring', labelKey: 'nav.scoringOverview', fallback: 'Scoring Overview', icon: BarChart3 },
  },
  {
    id: 'score_trends',
    path: 'score-trends',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ScoreTrendsPage'),
    sidebar: { group: 'scoring', labelKey: 'nav.scoreTrends', fallback: 'Score Trends', icon: GitFork },
  },
  {
    id: 'compliance',
    path: 'compliance',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/CompliancePage'),
    sidebar: { group: 'scoring', labelKey: 'nav.compliance', fallback: 'Compliance', icon: Scale },
  },

  // ── ADMIN (bottom of sidebar) ─────────────────────────────────
  {
    id: 'reports',
    path: 'reports',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ReportsPage'),
    sidebar: { group: 'admin', labelKey: 'nav.reports', fallback: 'Reports', icon: FileText },
  },
  {
    id: 'va_report',
    path: 'va-report',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/VAReportPage'),
    sidebar: { group: 'admin', labelKey: 'nav.vaReport', fallback: 'VA Report', icon: FileText },
  },
  {
    id: 'settings',
    path: 'settings',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/SettingsPage'),
    sidebar: { group: 'admin', labelKey: 'settings.title', fallback: 'Settings', icon: Settings },
  },

  // ── HIDDEN (routed but not in sidebar) ────────────────────────
  // Org chart — pulled from nav 2026-05-21 per operator
  // ("組織那一塊 就是架構圖 可以拔掉"). URL kept so direct
  // bookmarks survive.
  {
    id: 'org',
    path: 'org',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/OrgPage'),
    sidebar: { group: 'hidden', labelKey: 'nav.orgChart', fallback: 'Org Chart', icon: Network },
  },
  // Repo detail — drilled into from Repos list.
  {
    id: 'repo_detail',
    path: 'repos/:repoId',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/RepoDetailPage'),
    // No sidebar entry — accessed via Repos list row click.
  },
]

/** Ordered list of sidebar groups for rendering. Groups not listed
 *  here (notably `hidden`) are filtered out of the sidebar. */
export const SIDEBAR_GROUP_ORDER: { id: Exclude<import('./Module').ModuleGroup, 'hidden'>; headerKey: string; headerFallback: string; showHeader: boolean }[] = [
  { id: 'overview', headerKey: '',                    headerFallback: '',                   showHeader: false },
  { id: 'assets',   headerKey: 'nav.assets',          headerFallback: 'Assets',             showHeader: true  },
  { id: 'code',     headerKey: 'nav.codeSection',     headerFallback: 'Code',               showHeader: true  },
  { id: 'exposure', headerKey: 'nav.exposureSection', headerFallback: 'Exposure',           showHeader: true  },
  { id: 'cloud',    headerKey: 'nav.cloudSection',    headerFallback: 'Cloud',              showHeader: true  },
  { id: 'runtime',  headerKey: 'nav.agentFirewallSection', headerFallback: 'Agent Firewall', showHeader: true  },
  { id: 'identity', headerKey: 'nav.identitySection', headerFallback: 'Identity',           showHeader: true  },
  { id: 'darkweb',  headerKey: 'nav.darkwebSection',  headerFallback: 'Darkweb & Threat Intel', showHeader: true  },
  { id: 'history',  headerKey: 'nav.historySection',  headerFallback: 'History',            showHeader: true  },
  { id: 'scoring',  headerKey: 'nav.scoringSection',  headerFallback: 'Scoring',            showHeader: true  },
  { id: 'operations', headerKey: 'nav.operationsSection', headerFallback: 'Operations',     showHeader: true  },
  { id: 'admin',    headerKey: '',                    headerFallback: '',                   showHeader: false },
]

/** Strip dynamic suffixes (`/:repoId`, `/*` splat) from a module path,
 *  yielding the stable nav/base segment. `repos/:repoId` → `repos`,
 *  `architecture/*` → `architecture`, `dashboard` → `dashboard`. */
export function navPath(path: string): string {
  return path.replace(/\/(:|\*).*$/, '')
}

/** Lookup: paths needing `overflow: hidden` outer shell.
 *  Derived from MODULES so adding a new entry auto-populates. */
export function getFullBleedPaths(): string[] {
  return MODULES.filter(m => m.fullBleed).map(m => '/' + navPath(m.path))
}

/** Lookup: paths exposing the workspace Manager / Engineer switch.
 *  Derived from MODULES for the same reason as full-bleed paths:
 *  page metadata should not drift into toolbar-specific lists. */
export function getDualModePaths(): string[] {
  return MODULES.filter(m => m.dualMode).map(m => '/' + navPath(m.path))
}

/** Lookup: modules by sidebar group (drops hidden entries). */
export function getModulesByGroup(group: import('./Module').ModuleGroup): Module[] {
  return MODULES.filter(m => m.sidebar?.group === group)
}
