import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import { useTheme } from '@mui/material/styles'
import { Settings, ShieldAlert } from 'lucide-react'
import { MONO, BRAND, techGrid, TechEyebrow } from '@atoms/techConsole'
import { t } from '@lib/i18n';
import { getEventScope } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { SettingsNav } from './SettingsNav'
import { type SettingsCategory, getCategoryMeta } from './categories'
import { GeneralTab } from './GeneralTab'
import { AdminLaunchpadTab } from './AdminLaunchpadTab'
import { SourceControlTab } from './SourceControlTab'
import { DataSourcesTab } from './DataSourcesTab'
import { RolesAccessTab } from './RolesAccessTab'
import { LocalUploadTab } from './LocalUploadTab'
import { ScanningTab } from './ScanningTab'
import { NotificationsTab } from './NotificationsTab'
import { APIKeysTab } from './APIKeysTab'
import { ScanLogTab } from './ScanLogTab'
import { SystemEventsTab } from './SystemEventsTab'
import { MembersTab } from './MembersTab'
import { CIGateTab } from './CIGateTab'
import { BudgetPoliciesTab } from './BudgetPoliciesTab'
// Phase A consolidation tabs (added 2026-05-18). These let the
// operator configure the things that make the new CTEM signals
// actually work — without these tabs, BU scoping, DAST approval,
// authenticated scanning, and visual similarity are invisible.
import { BusinessUnitsTab } from './BusinessUnitsTab'
import { ScanApprovalsTab } from './ScanApprovalsTab'
import { ScanCredentialsTab } from './ScanCredentialsTab'
import { CanonicalLoginTab } from './CanonicalLoginTab'
import { SLAPoliciesTab } from './SLAPoliciesTab'
import { ScoringConfigTab } from './ScoringConfigTab'
import { BudgetGovernanceTab } from './BudgetGovernanceTab'
import { AuditTrailTab } from './AuditTrailTab'
// System/admin surfaces wired to previously-dormant engine endpoints.
// These give a UI to platform credential inventory, scheduler controls,
// compliance (audit export / residency / legal holds), SCIM, SSO, RBAC,
// system notifications, CSPM rules, MCP Guardian, and identity posture.
import { ComplianceTab } from './ComplianceTab'
import { SCIMTab } from './SCIMTab'
import { SSOTab } from './SSOTab'
import { RBACTab } from './RBACTab'
import { SystemNotificationsTab } from './SystemNotificationsTab'
import { CSPMRulesTab } from './CSPMRulesTab'
import { CredentialInventoryTab } from './CredentialInventoryTab'
import { SchedulerTab } from './SchedulerTab'
import { MCPGuardianTab } from './MCPGuardianTab'
import { IdentityTab } from './IdentityTab'

const CATEGORY_COMPONENTS: Record<SettingsCategory, () => React.JSX.Element> = {
  'general': GeneralTab,
  'launchpad': AdminLaunchpadTab,
  'members': MembersTab,
  'roles-access': RolesAccessTab,
  'source-control': SourceControlTab,
  'data-sources': DataSourcesTab,
  'notifications': NotificationsTab,
  'local-upload': LocalUploadTab,
  'scanning': ScanningTab,
  'ci-gate': CIGateTab,
  'budget-policies': BudgetPoliciesTab,
  'api-keys': APIKeysTab,
  'scan-log': ScanLogTab,
  'business-units': BusinessUnitsTab,
  'scan-approvals': ScanApprovalsTab,
  'scan-credentials': ScanCredentialsTab,
  'canonical-login': CanonicalLoginTab,
  'sla-policies': SLAPoliciesTab,
  'scoring-config': ScoringConfigTab,
  'system-events': SystemEventsTab,
  'cost-budget': BudgetGovernanceTab,
  'audit-trail': AuditTrailTab,
  'compliance': ComplianceTab,
  'scim': SCIMTab,
  'sso': SSOTab,
  'rbac': RBACTab,
  'system-notifications': SystemNotificationsTab,
  'cspm-rules': CSPMRulesTab,
  'credentials': CredentialInventoryTab,
  'scheduler': SchedulerTab,
  'mcp-guardian': MCPGuardianTab,
  'identity': IdentityTab,
}

const SETTINGS_CATEGORY_IDS = new Set<SettingsCategory>(
  Object.keys(CATEGORY_COMPONENTS) as SettingsCategory[],
)

function normalizeSettingsTab(raw: string | null): SettingsCategory | null {
  if (!raw) return null
  if (raw === 'integrations') return 'source-control'
  return SETTINGS_CATEGORY_IDS.has(raw as SettingsCategory) ? raw as SettingsCategory : null
}

/** Tabs that require org admin/owner role to modify. */
const ADMIN_ONLY: Set<SettingsCategory> = new Set([
  'general', 'launchpad', 'api-keys', 'budget-policies', 'ci-gate', 'scoring-config',
  'cost-budget',
  // System/admin surfaces — most of these write authoritative platform state
  // (roles, SSO, SCIM tokens, residency, legal holds, MCP policy, scheduler).
  'compliance', 'scim', 'sso', 'rbac', 'system-notifications',
  'credentials', 'scheduler', 'mcp-guardian',
])

const PLATFORM_ONLY: Set<SettingsCategory> = new Set([
  'compliance',
  'scim',
  'sso',
  'rbac',
  'system-notifications',
  'credentials',
  'scheduler',
  'mcp-guardian',
  'cspm-rules',
  'identity',
])

export function SettingsView() {
  const { org } = useOrg()
  const [searchParams, setSearchParams] = useSearchParams()
  const [active, setActiveState] = useState<SettingsCategory>(
    () => normalizeSettingsTab(searchParams.get('tab')) ?? 'general',
  )
  const { data: scopeData } = useQuery({
    queryKey: qk.platform.eventScope(),
    queryFn: getEventScope,
    staleTime: 5 * 60_000,
  })
  const isPlatformAdmin = !!scopeData?.is_platform_admin
  const hiddenCategories = isPlatformAdmin ? undefined : PLATFORM_ONLY

  const setActive = useCallback((nextTab: SettingsCategory) => {
    setActiveState(nextTab)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', nextTab)
      return next
    }, { replace: true })
  }, [setSearchParams])

  useEffect(() => {
    const rawTab = searchParams.get('tab')
    const nextTab = normalizeSettingsTab(rawTab)
    if (nextTab && nextTab !== active) {
      setActiveState(nextTab)
    }
    if (nextTab && rawTab !== nextTab) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', nextTab)
        return next
      }, { replace: true })
    }
  }, [active, searchParams, setSearchParams])

  useEffect(() => {
    if (hiddenCategories?.has(active)) setActive('general')
  }, [active, hiddenCategories])

  const ActiveComponent = CATEGORY_COMPONENTS[active]
  const meta = getCategoryMeta(active)
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const isAdmin = isPlatformAdmin || org?.role === 'owner' || org?.role === 'admin' || org?.isAdmin === true
  const needsAdmin = ADMIN_ONLY.has(active) && !isAdmin

  return (
    // ONE surface, split into a nav rail + content by a single divider — no
    // card-inside-a-card. The workspace shell already frames this region, so a
    // second nested border read as visual "double framing" (重影).
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        height: '100%',
        overflow: 'hidden',
        m: 1.5,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {/* Left nav rail */}
      <Box
        sx={{
          width: { xs: '100%', md: 248 },
          minWidth: { xs: 0, md: 248 },
          maxHeight: { xs: 260, md: 'none' },
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRight: { xs: 0, md: '1px solid' },
          borderBottom: { xs: '1px solid', md: 0 },
          borderColor: 'divider',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            height: 56,
            flexShrink: 0,
            borderTop: `2px solid ${BRAND}`,
            borderBottom: '1px solid',
            borderColor: 'divider',
            ...techGrid(dark),
            '& > *': { position: 'relative', zIndex: 1 },
          }}
        >
          <Settings size={16} style={{ color: BRAND, opacity: 0.9 }} />
          <Typography variant="subtitle2" fontWeight={800} color="text.primary" sx={{ fontFamily: MONO, letterSpacing: '0.04em' }}>
            {t('settings.title')}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <SettingsNav active={active} onSelect={setActive} hiddenCategories={hiddenCategories} />
        </Box>
      </Box>

      {/* Right content */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 3,
            height: 56,
            flexShrink: 0,
            borderTop: `2px solid ${BRAND}`,
            borderBottom: '1px solid',
            borderColor: 'divider',
            ...techGrid(dark),
            '& > *': { position: 'relative', zIndex: 1 },
          }}
        >
          {meta && (
            <>
              <meta.item.icon size={20} style={{ color: BRAND, opacity: 0.85 }} />
              <Box>
                <Typography component="h1" variant="subtitle1" fontWeight={700} color="text.primary" lineHeight={1.2} sx={{ fontFamily: MONO, letterSpacing: '0.02em' }}>
                  {meta.item.label()}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {meta.group.label()}
                </Typography>
              </Box>
              <Box sx={{ ml: 'auto' }}>
                <TechEyebrow icon={<Settings size={12} />}>{t('hardcoded.control.plane.7609f5e2')}</TechEyebrow>
              </Box>
            </>
          )}
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {/* Left-aligned, wide content. Was maxWidth:760 + mx:auto which
              crammed every tab into a narrow centred column and wasted the
              whole right half of the panel (operator 2026-06-11). Now uses
              the available width with a comfortable reading cap. */}
          <Box sx={{ maxWidth: 1180, p: { xs: 2, md: 4 } }}>
            {needsAdmin && (
              <Alert severity="warning" icon={<ShieldAlert size={18} />} sx={{ mb: 3, borderRadius: 2 }}>
                {t('settings.adminOnly')}
              </Alert>
            )}
            <ActiveComponent />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
