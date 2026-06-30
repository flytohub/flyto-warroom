import {
  Building2, Users, GitBranch, Bell, Upload,
  Scan, ShieldCheck, Coins, Key, FileText,
  Network, KeyRound, Image, Clock, Sliders, Plug,
  Gauge, ScrollText,
  Scale, Lock, Cloud, UserCheck, Shield, PackageCheck,
  type LucideIcon,
} from 'lucide-react'
import { t } from '@lib/i18n';

export type SettingsCategory =
  | 'general'
  | 'launchpad'
  | 'members'
  | 'roles-access'
  | 'source-control'
  | 'data-sources'
  | 'notifications'
  | 'local-upload'
  | 'scanning'
  | 'ci-gate'
  | 'budget-policies'
  | 'api-keys'
  | 'scan-log'
  // ── Phase A operator-config tabs (added 2026-05-18) ───────
  | 'business-units'      // per-team scoping
  | 'scan-approvals'      // active DAST consent gate
  | 'scan-credentials'    // authenticated DAST secrets
  | 'canonical-login'     // visual phishing reference image
  | 'sla-policies'        // per-(BU, severity) error budgets
  | 'scoring-config'      // unified score weight tuning
  | 'system-events'       // operator-facing diagnostic log viewer
  | 'cost-budget'         // generic per-org cost-budget governance (USD)
  | 'audit-trail'         // tamper-evident hash-chained audit log viewer
  // ── System/admin surfaces wired to dormant engine endpoints ───────
  | 'compliance'          // audit export + data residency + legal holds
  | 'scim'                // SCIM provisioning tokens + group mappings
  | 'sso'                 // SAML 2.0 SSO config
  | 'rbac'                // roles & permissions admin
  | 'system-notifications'// platform alert-routing channels + rules
  | 'cspm-rules'          // cloud posture rule catalog
  | 'credentials'         // platform credential inventory
  | 'scheduler'           // scheduled scanner job pause/resume
  | 'mcp-guardian'        // Agent Firewall overview + policy
  | 'identity'            // identity security posture + access graph

export interface SettingsCategoryItem {
  id: SettingsCategory
  label: () => string
  icon: LucideIcon
}

export interface SettingsCategoryGroup {
  key: string
  label: () => string
  items: SettingsCategoryItem[]
}

export const SETTINGS_GROUPS: SettingsCategoryGroup[] = [
  {
    key: 'workspace',
    label: () => t('settings.group.workspace'),
    items: [
      { id: 'general', label: () => t('settings.cat.general'), icon: Building2 },
      { id: 'launchpad', label: () => t('settings.cat.launchpad'), icon: PackageCheck },
      { id: 'members', label: () => t('settings.cat.members'), icon: Users },
      { id: 'roles-access', label: () => t('settings.cat.rolesAccess'), icon: ShieldCheck },
    ],
  },
  {
    key: 'integrations',
    label: () => t('settings.group.integrations'),
    items: [
      { id: 'source-control', label: () => t('settings.cat.sourceControl'), icon: GitBranch },
      { id: 'data-sources', label: () => t('settings.cat.dataSources'), icon: Plug },
      { id: 'notifications', label: () => t('settings.cat.notifications'), icon: Bell },
      { id: 'local-upload', label: () => t('settings.cat.localUpload'), icon: Upload },
    ],
  },
  {
    key: 'security',
    label: () => t('settings.group.security'),
    items: [
      { id: 'scanning', label: () => t('settings.cat.scanning'), icon: Scan },
      { id: 'ci-gate', label: () => t('settings.cat.ciGate'), icon: ShieldCheck },
      { id: 'budget-policies', label: () => t('settings.cat.budgetPolicies'), icon: Coins },
      // ── Phase A operator-config (added 2026-05-18) ──────
      { id: 'scan-approvals', label: () => t('settings.cat.scanApprovals'), icon: ShieldCheck },
      { id: 'scan-credentials', label: () => t('settings.cat.scanCredentials'), icon: KeyRound },
      { id: 'canonical-login', label: () => t('settings.cat.canonicalLogin'), icon: Image },
      { id: 'sla-policies', label: () => t('settings.cat.slaPolicies'), icon: Clock },
      { id: 'scoring-config', label: () => t('settings.cat.scoringConfig'), icon: Sliders },
      // ── SSO / provisioning / roles (system/admin) ──────
      { id: 'sso', label: () => t('settings.cat.sso'), icon: Lock },
      { id: 'scim', label: () => t('settings.cat.scim'), icon: KeyRound },
      { id: 'rbac', label: () => t('settings.cat.rbac'), icon: ShieldCheck },
      { id: 'credentials', label: () => t('settings.cat.credentials'), icon: Key },
    ],
  },
  {
    key: 'governance',
    label: () => t('settings.group.governance'),
    items: [
      { id: 'business-units', label: () => t('settings.cat.businessUnits'), icon: Network },
      { id: 'cost-budget', label: () => t('settings.cat.costBudget'), icon: Gauge },
      { id: 'audit-trail', label: () => t('settings.cat.auditTrail'), icon: ScrollText },
      // ── Compliance (audit export, residency, legal holds) ──
      { id: 'compliance', label: () => t('settings.cat.compliance'), icon: Scale },
    ],
  },
  {
    key: 'platform',
    label: () => t('settings.group.platform'),
    items: [
      { id: 'identity', label: () => t('settings.cat.identity'), icon: UserCheck },
      { id: 'mcp-guardian', label: () => t('settings.cat.agentFirewall'), icon: Shield },
      { id: 'cspm-rules', label: () => t('settings.cat.cspmRules'), icon: Cloud },
      { id: 'system-notifications', label: () => t('settings.cat.systemNotifications'), icon: Bell },
      { id: 'scheduler', label: () => t('settings.cat.scheduler'), icon: Clock },
    ],
  },
  {
    key: 'developer',
    label: () => t('settings.group.developer'),
    items: [
      { id: 'api-keys', label: () => t('settings.cat.apiKeys'), icon: Key },
      { id: 'scan-log', label: () => t('settings.cat.scanLog'), icon: FileText },
      { id: 'system-events', label: () => t('settings.cat.systemEvents'), icon: FileText },
    ],
  },
]

export function getCategoryMeta(id: SettingsCategory) {
  for (const group of SETTINGS_GROUPS) {
    const item = group.items.find(i => i.id === id)
    if (item) return { group, item }
  }
  return undefined
}
