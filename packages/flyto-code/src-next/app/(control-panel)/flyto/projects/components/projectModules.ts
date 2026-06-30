/**
 * Project module catalogue — the single source of truth for the
 * create-project wizard (CreateProjectWizard.tsx).
 *
 * A project is a SET OF MODULES. Each module is two independent axes:
 *   1. enabled (free during preview — billing is not wired yet).
 *   2. sources: a MULTI-SELECT set, not an either-or. A module can feed
 *      from Flyto's own engine AND one or more external providers at the
 *      same time (e.g. External → Flyto scan + Bitsight + SecurityScorecard).
 *      The kernel fuses every source's evidence — picking only one would
 *      defeat the whole point.
 *
 * This replaces the old single-dialog "project type + flat checklist".
 * Module ids + their child feature ids match the engine's
 * capabilities.yaml so the backend page-gates resolve unchanged; the
 * source set is new metadata (BYO providers map to fusion
 * org_integrations; the ingestion/mapping is a later phase — here we
 * only capture the choice).
 *
 * Pure data + helpers only (no components) so importing it never trips
 * react-refresh/only-export-components.
 */
import type { ProjectType } from '@lib/engine'
import type { ModuleRegistryEntry } from '@lib/engine/platform/projectCapabilities'

export type ModuleSource = 'flyto' | 'byo'

export interface ByoProvider {
  id: string
  label: string
}

/**
 * Frontend readiness of a surface — drives honest UI (no dead ends):
 *   live — has a real destination page wired and working today.
 *   beta — usable but young / partial backend; shown, flagged "Beta".
 *   soon — advertised on the catalogue but no working UI/backend yet;
 *          badged "Coming soon", lands on a placeholder, never pretends.
 * Single source of truth — the wizard, coverage tiles, and (later) the
 * sidebar all read this instead of hardcoding which surfaces are real.
 */
export type SurfaceStatus = 'live' | 'beta' | 'soon'

export interface ProjectModule {
  /** Parent capability id (page-gate on the backend). */
  id: string
  /** Reuse existing (already-translated) i18n keys for the label. */
  titleKey: string
  titleFallback: string
  descKey: string
  descFallback: string
  /** Frontend readiness — see SurfaceStatus. Defaults to 'live' when omitted. */
  status?: SurfaceStatus
  /** Workspace route (relative path under /projects/:orgId/) the surface
   *  lands on once a project exists. Omit for `soon` surfaces that have
   *  no destination yet. */
  landingPath?: string
  /** Whether this module can also pull from external providers (in
   *  ADDITION to Flyto). Code is Flyto-only (you scan code with us). */
  sourceSelectable: boolean
  /** False = Flyto has no native engine for this domain, so it's
   *  BYO-only (e.g. Identity → Okta). Default true. */
  flytoNative?: boolean
  /** BYO providers offered (multi-select) when sourceSelectable. */
  byoProviders: ByoProvider[]
  /** Child feature ids sent to the backend when this module is on. */
  features: string[]
  /** True for the cross-cutting groups (Add-ons / Reporting) that are
   *  not a standalone "type" but layer onto the others. */
  crossCutting: boolean
  /** Billing tier from the registry (catalog.yaml). Empty/'free' = free
   *  (preview default), 'paid' = charged. Read via billingOf(). */
  billing?: string
}

const MODULE_ALIASES: Record<string, string> = {
  code_audit: 'code',
  ctem: 'external',
  cspm: 'cloud',
  mcp: 'ai_gate',
  darkweb: 'dark_web',
  darkweb_intel: 'dark_web',
}

export function canonicalModuleId(id: string): string {
  return MODULE_ALIASES[id] ?? id
}

export function modulesFromRegistry(registryModules: ModuleRegistryEntry[] | undefined): ProjectModule[] | null {
  if (!registryModules?.length) return null
  // 'core' is the always-on workspace shell (category: core) — it's not a
  // selectable monitoring target, so never list it in the create-project
  // wizard. The hardcoded PROJECT_MODULES fallback already omits it.
  return registryModules
    .filter((m) => m.category !== 'core')
    .map((m) => ({
    id: m.key,
    titleKey: m.title_key ?? `projects.module.${m.key}.title`,
    titleFallback: m.display_name,
    descKey: m.description_key ?? `projects.module.${m.key}.desc`,
    descFallback: m.description,
    status: normalizeStatus(m.status),
    landingPath: m.landing_path,
    sourceSelectable: m.source_selectable,
    flytoNative: m.flyto_native,
    byoProviders: m.providers ?? [],
    features: m.features?.length ? m.features : (m.gating_features ?? []),
    crossCutting: Boolean(m.cross_cutting) || ['action', 'verification', 'gate', 'program'].includes(m.category),
    billing: m.billing,
  }))
}

function normalizeStatus(status: string | undefined): SurfaceStatus {
  if (status === 'beta' || status === 'soon') return status
  return 'live'
}

export const PROJECT_MODULES: ProjectModule[] = [
  {
    id: 'code_audit',
    titleKey: 'projects.feature.codeAudit', titleFallback: 'Code Audit',
    descKey: 'projects.feature.codeAuditDesc',
    descFallback: 'Scan source code for vulnerabilities, secrets, and infra-as-code issues.',
    status: 'live', landingPath: 'issues',
    sourceSelectable: true, // e.g. bring your own Aikido/Snyk via Custom
    byoProviders: [],
    // `surface_code` is the access-v2 surface-entitlement feature the
    // engine's code endpoints gate on (requireSurfaceRead(SurfaceCode)).
    // It MUST ride in customFeatures for project_type=custom projects, or
    // code endpoints (e.g. /github/user-repos) 403 even though the repos
    // page — gated on `code_audit` — is visible. (Bug: 403 on repo picker.)
    // `scoring_unified` is the entitlement the computed-score endpoint
    // requires (requireOrgAccess RequiredFeature). Without it in a custom
    // project's customFeatures, the dashboard score 403s and disappears —
    // the same name-drift class as surface_code. Every scoreable surface
    // module must carry it.
    features: ['surface_code', 'scoring_unified', 'asset_map', 'code_audit', 'sast', 'sca', 'secrets', 'iac', 'reachability', 'ai_fix_plan'],
    crossCutting: false,
  },
  {
    id: 'product_verification',
    titleKey: 'projects.feature.productVerification', titleFallback: 'Product Verification',
    descKey: 'projects.feature.productVerificationDesc',
    descFallback: 'Deterministic browser replay, state-model verification, and evidence packs for this workspace.',
    status: 'live', landingPath: 'product-verification',
    sourceSelectable: false,
    byoProviders: [],
    // Product Verification is a code-workspace surface today: the page gate
    // needs the product_verification page feature, while its engine endpoints
    // still fail closed on code read / scan trigger entitlements.
    features: ['surface_code', 'code_audit', 'product_verification'],
    crossCutting: true,
  },
  {
    id: 'ctem',
    titleKey: 'projects.feature.ctem', titleFallback: 'Attack Surface (CTEM)',
    descKey: 'projects.feature.ctemDesc',
    descFallback: 'External posture — domains, SSL, DNS, WAF, exposed services.',
    status: 'live', landingPath: 'posture-overview',
    sourceSelectable: true,
    // Certified fusion providers for the external_posture source type
    // (EF-17). Catalog will become dynamic once we read it from the
    // backend; cyble/tenable/okta belong to other source types.
    byoProviders: [
      { id: 'bitsight', label: 'Bitsight' },
    ],
    features: ['surface_external', 'scoring_unified', 'ctem', 'attack_surface', 'posture_scoring', 'threat_feed', 'supply_chain', 'mttr_tracking', 'continuous_monitoring', 'brand_protection'],
    crossCutting: false,
  },
  {
    id: 'cspm',
    titleKey: 'projects.feature.cspm', titleFallback: 'Cloud Security (CSPM)',
    descKey: 'projects.feature.cspmDesc',
    descFallback: 'AWS / GCP / Azure asset inventory + cloud misconfiguration (CSPM) checks.',
    status: 'beta', landingPath: 'cloud-posture',
    // No certified cloud provider seeded yet, but Custom (bring your own
    // API + per-project mapping) is always available — never vendor-locked.
    sourceSelectable: true,
    byoProviders: [],
    features: ['surface_cloud', 'scoring_unified', 'cspm', 'cloud_inventory', 'cloud_findings', 'cloud_scoring'],
    crossCutting: false,
  },
  {
    id: 'container',
    titleKey: 'projects.feature.container', titleFallback: 'Container Security',
    descKey: 'projects.feature.containerDesc',
    descFallback: 'Container image CVEs + base-image scanning (Trivy).',
    status: 'beta', landingPath: 'containers',
    sourceSelectable: true, // Flyto (Trivy) + Custom (e.g. Wiz/Aqua) via BYO
    byoProviders: [],
    features: ['surface_container', 'container', 'container_findings'],
    crossCutting: false,
  },
  {
    id: 'mcp',
    titleKey: 'projects.feature.agentFirewall', titleFallback: 'Agent Firewall',
    descKey: 'projects.feature.agentFirewallDesc',
    descFallback: 'Runtime control for agent tool calls, sensitive-data egress, and dangerous side effects.',
    // Active Agent Firewall loop: connection test, overview, policy simulation,
    // rollout control, and egress-risk drilldowns. Kept Beta while gateway
    // integrations vary by customer deployment.
    status: 'beta', landingPath: 'mcp',
    sourceSelectable: true,
    byoProviders: [],
    features: ['mcp', 'mcp_guardian'],
    crossCutting: false,
  },
  {
    id: 'dark_web',
    titleKey: 'projects.feature.darkWeb', titleFallback: 'Dark Web & Threat Intel',
    descKey: 'projects.feature.darkWebDesc',
    descFallback: 'Leaked credentials, ransomware, IoCs — Warroom feeds + external providers.',
    status: 'live', landingPath: 'ioc-lookup',
    sourceSelectable: true,
    byoProviders: [{ id: 'cyble', label: 'Cyble' }],
    features: ['dark_web', 'threat_intel'],
    crossCutting: false,
  },
  {
    id: 'vuln_mgmt',
    titleKey: 'projects.feature.vulnMgmt', titleFallback: 'Vulnerability Management',
    descKey: 'projects.feature.vulnMgmtDesc',
    descFallback: 'CVE / scan findings — Warroom VA/PT engine + external scanner.',
    // A lens over CVE findings rather than a distinct backend domain —
    // lands on the unified Findings view filtered to CVEs.
    status: 'live', landingPath: 'findings',
    sourceSelectable: true,
    byoProviders: [{ id: 'tenable', label: 'Tenable' }],
    features: ['vuln_mgmt'],
    crossCutting: false,
  },
  {
    id: 'identity',
    titleKey: 'projects.feature.identity', titleFallback: 'Identity Security',
    descKey: 'projects.feature.identityDesc',
    descFallback: 'IdP posture & access risk — bring your own identity provider.',
    // Posture read shipped (GET /identity/posture); Beta until more IdP
    // providers + write paths land.
    status: 'beta', landingPath: 'identity',
    sourceSelectable: true,
    flytoNative: false, // no Flyto-native identity engine — BYO-only
    byoProviders: [{ id: 'okta', label: 'Okta' }],
    features: ['identity'],
    crossCutting: false,
  },
  {
    id: 'addons',
    titleKey: 'projects.feature.addons', titleFallback: 'Add-ons',
    descKey: 'projects.feature.addonsDesc',
    descFallback: 'Optional capabilities that work across code and CTEM.',
    status: 'live',
    sourceSelectable: false,
    byoProviders: [],
    features: ['autofix', 'red_team', 'runtime_protection'],
    crossCutting: true,
  },
  {
    id: 'reporting',
    titleKey: 'projects.feature.reporting', titleFallback: 'Compliance & Reporting',
    descKey: 'projects.feature.reportingDesc',
    descFallback: 'Mapping to industry frameworks and executive output.',
    status: 'live', landingPath: 'reports',
    sourceSelectable: false,
    byoProviders: [],
    features: ['compliance', 'executive_report'],
    crossCutting: true,
  },
]

/** Pseudo-parent ids that are UI grouping helpers, not real backend
 *  features — never sent as a feature id (mirrors ProjectsPage). */
const PSEUDO_PARENT_IDS = new Set(['addons', 'reporting'])

/** Per-module source selection — MULTI-select. `flyto`, any number of
 *  certified `providers`, and `custom` (bring-your-own arbitrary API +
 *  per-project mapping) can all be on at the same time. The platform is
 *  never locked to one vendor. */
export interface ModuleConfig {
  flyto: boolean
  providers: string[]
  /** "Bring your own" — an arbitrary external API mapped into the kernel
   *  via a per-project mapping (configured in Settings → Integrations).
   *  Always available regardless of the certified catalog. */
  custom: boolean
}

/** Default config for a freshly-enabled module: Flyto's own engine on
 *  (when it has one), no external/custom sources yet. */
export function defaultModuleConfig(flytoNative = true): ModuleConfig {
  return { flyto: flytoNative, providers: [], custom: false }
}

/** Resolve the live config for a module, falling back to its default
 *  (Flyto on iff the module has a native engine). */
export function configFor(cfg: Record<string, ModuleConfig>, m: ProjectModule): ModuleConfig {
  return cfg[m.id] ?? defaultModuleConfig(m.flytoNative !== false)
}

/** Derive the backend ProjectType from the enabled module set, so
 *  capability page-gating keeps working exactly as before. */
export function deriveProjectType(enabled: Set<string>): ProjectType {
  const normalized = new Set(Array.from(enabled).map(canonicalModuleId))
  const core = ['code', 'external', 'cloud'].filter((id) => normalized.has(id))
  // container/mcp have no dedicated engine ProjectType yet, so any of
  // these "extras" being on forces `custom` (their feature ids ride in
  // customFeatures; unknown ones are ignored by the resolver, not errors).
  const extrasOn = ['product_verification', 'addons', 'reporting', 'container', 'ai_gate', 'dark_web', 'vuln_mgmt', 'identity', 'autofix', 'red_team'].some((id) => normalized.has(id))
  if (!extrasOn && core.length === 1) {
    if (core[0] === 'code') return 'code'
    if (core[0] === 'external') return 'ctem'
    if (core[0] === 'cloud') return 'cloud'
  }
  if (!extrasOn && core.length === 3) return 'all'
  return 'custom'
}

/** Expand enabled modules into the flat feature-id list the backend
 *  expects (real parent id + all children). */
export function deriveCustomFeatures(enabled: Set<string>, modules: ProjectModule[] = PROJECT_MODULES): string[] {
  const out = new Set<string>()
  const normalized = new Set(Array.from(enabled).map(canonicalModuleId))
  for (const m of modules) {
    if (!normalized.has(canonicalModuleId(m.id))) continue
    for (const f of m.features) {
      if (PSEUDO_PARENT_IDS.has(f)) continue
      out.add(f)
    }
  }
  return Array.from(out)
}

/** Wire-shape for the `module_sources` payload — one row per (module,
 *  source). A module with Flyto + 2 providers emits 3 rows. */
export interface ModuleSourcePayload {
  module: string
  source: ModuleSource
  provider?: string
}

export function buildModuleSources(
  enabled: Set<string>,
  cfg: Record<string, ModuleConfig>,
  modules: ProjectModule[] = PROJECT_MODULES,
): ModuleSourcePayload[] {
  const out: ModuleSourcePayload[] = []
  const normalized = new Set(Array.from(enabled).map(canonicalModuleId))
  for (const m of modules) {
    const moduleId = canonicalModuleId(m.id)
    if (!normalized.has(moduleId)) continue
    if (!m.sourceSelectable) {
      out.push({ module: moduleId, source: 'flyto' })
      continue
    }
    const c = configFor(cfg, m)
    if (c.flyto) out.push({ module: moduleId, source: 'flyto' })
    for (const p of c.providers) out.push({ module: moduleId, source: 'byo', provider: p })
    if (c.custom) out.push({ module: moduleId, source: 'byo', provider: 'custom' })
  }
  return out
}

/** Count of distinct sources configured across all enabled modules —
 *  the headline the wizard shows in place of a price total. */
export function totalSources(enabled: Set<string>, cfg: Record<string, ModuleConfig>): number {
  return buildModuleSources(enabled, cfg).length
}

/* ── Billing (registry-driven) ──────────────────────────────────────────
 * Billing comes from the backend catalog: each module carries a `billing`
 * field (catalog.yaml → ModuleRegistryEntry.billing → ProjectModule.billing).
 * A module with no billing set is free (preview default). The wizard's price
 * badge reads billingOf(module) off the registry — charging for a capability
 * later is a catalog.yaml change (`billing: paid`), never a frontend edit. */
export type BillingStatus = 'free' | 'paid'

export function billingOf(m: ProjectModule): BillingStatus {
  return m.billing === 'paid' ? 'paid' : 'free'
}
