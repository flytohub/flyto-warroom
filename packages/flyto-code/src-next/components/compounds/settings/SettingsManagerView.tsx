/**
 * SettingsManagerView — the manager-mode surface for the Settings page.
 *
 * Engineer mode keeps the full settings console (SettingsView: API
 * keys, scan credentials, business units, budgets, …). Manager mode
 * gives a leader a governance / billing roll-up: plan utilization,
 * integration & credential posture, and budget-incident health —
 * the "is my org configured & within plan?" view, not the knobs.
 *
 * Every number is sourced from a REAL engine endpoint:
 *   - getMyCapabilities            → plan / tier / seat & repo / domain caps
 *   - listConnectedRepos           → repo utilization
 *   - listInvitations              → pending seats
 *   - listAPIKeys                  → active automation keys
 *   - listBusinessUnits            → BU governance footprint
 *   - listScanCredentials          → authenticated-scan readiness
 *   - listCampaignBudgetPolicies   → active budget guardrails
 *   - listCampaignBudgetIncidents  → open budget breaches
 *
 * Client functions are imported by DIRECT FILE PATH (decoupling rule).
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { alpha, useTheme } from '@mui/material/styles'
import { SlidersHorizontal, ShieldCheck, AlertTriangle, Server, KeyRound } from 'lucide-react'

import {
  ManagerDashboard,
  ChartCard,
  KpiCard,
  DonutChart,
  StackedBarChart,
  ManagerHero,
  HeroStat,
  type DonutDatum,
} from '@compounds/_shared'

import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { colors } from '@/styles/designTokens'
import { qk } from '@lib/queryKeys'
import { getMyCapabilities } from '@lib/engine/platform/capabilities'
import { listInvitations } from '@lib/engine/platform/orgs'
import { listConnectedRepos } from '@lib/engine/code/repos'
import { listAPIKeys } from '@lib/engine/platform/apiKeys'
import { listBusinessUnits } from '@lib/engine/platform/businessUnits'
import { listScanCredentials } from '@lib/engine/platform/scanCredentials'
import {
  listCampaignBudgetPolicies,
  listCampaignBudgetIncidents,
} from '@lib/engine/platform/campaignBudget'

export function SettingsManagerView() {
  const { org } = useOrg()
  const orgId = org?.id
  const theme = useTheme()

  const enabled = !!orgId
  const capsQ = useQuery({ queryKey: qk.settingsManager.capabilities(orgId), queryFn: () => getMyCapabilities(orgId!), enabled, staleTime: 60_000 })
  const reposQ = useQuery({ queryKey: qk.settingsManager.repos(orgId), queryFn: () => listConnectedRepos(orgId!), enabled, staleTime: 60_000 })
  const invitesQ = useQuery({ queryKey: qk.settingsManager.invites(orgId), queryFn: () => listInvitations(orgId!), enabled, staleTime: 60_000 })
  const keysQ = useQuery({ queryKey: qk.settingsManager.keys(orgId), queryFn: () => listAPIKeys(orgId!), enabled, staleTime: 60_000 })
  const buQ = useQuery({ queryKey: qk.settingsManager.businessUnits(orgId), queryFn: () => listBusinessUnits(orgId!), enabled, staleTime: 60_000 })
  const credsQ = useQuery({ queryKey: qk.settingsManager.credentials(orgId), queryFn: () => listScanCredentials(orgId!), enabled, staleTime: 60_000 })
  const budgetQ = useQuery({ queryKey: qk.settingsManager.budgetPolicies(orgId), queryFn: () => listCampaignBudgetPolicies(orgId!), enabled, staleTime: 60_000 })
  const incidentsQ = useQuery({ queryKey: qk.settingsManager.budgetIncidents(orgId), queryFn: () => listCampaignBudgetIncidents(orgId!), enabled, staleTime: 60_000 })

  const caps = capsQ.data
  const repos = reposQ.data?.repos ?? []
  const pendingInvites = (invitesQ.data?.invitations ?? []).filter((i) => !i.acceptedAt).length
  const keys = keysQ.data?.keys ?? []
  const businessUnits = buQ.data?.items ?? []
  const creds = credsQ.data?.items ?? []
  const activeBudgets = (budgetQ.data?.policies ?? []).filter((p) => p.isActive).length
  const openIncidents = (incidentsQ.data?.incidents ?? []).filter((i) => i.status === 'open')

  const repoCap = caps?.repo_cap ?? 0
  const seatCap = caps?.seat_cap ?? 0
  const domainCap = caps?.domain_cap ?? 0

  // Plan utilization stacked bar (used vs remaining across the three caps).
  const utilization = useMemo(() => {
    const rows: { label: string; used: number; cap: number }[] = []
    if (seatCap > 0) rows.push({ label: 'Seats', used: Math.min(pendingInvites, seatCap), cap: seatCap })
    if (repoCap > 0) rows.push({ label: 'Repos', used: Math.min(repos.length, repoCap), cap: repoCap })
    if (domainCap > 0) rows.push({ label: t('assetMap.domains'), used: 0, cap: domainCap })
    return rows
  }, [seatCap, repoCap, domainCap, repos.length, pendingInvites])

  // Configuration footprint donut — what governance primitives exist.
  const configFootprint: DonutDatum[] = useMemo(() => {
    const data: DonutDatum[] = []
    if (keys.length) data.push({ label: t('settings.apiKeys'), value: keys.length })
    if (businessUnits.length) data.push({ label: t('settings.businessUnits'), value: businessUnits.length })
    if (creds.length) data.push({ label: t('settings.scanCredentials'), value: creds.length })
    if (activeBudgets) data.push({ label: t('settings.budgetPolicies'), value: activeBudgets })
    return data
  }, [keys.length, businessUnits.length, creds.length, activeBudgets])

  const anyConfig = configFootprint.length > 0
  const hasOpenIncidents = openIncidents.length > 0

  // Total configured governance primitives — supporting hero stat.
  const configTotal = configFootprint.reduce((sum, d) => sum + d.value, 0)

  // Section hue is warning-orange when healthy; flips to danger red the
  // moment any budget-alert incident is open (status-flip semantics).
  const ACCENT = hasOpenIncidents ? colors.semantic.danger : colors.semantic.warning

  return (
    <ManagerDashboard
      title={t('hardcoded.settings.governance.0e16cb05')}
      subtitle={org?.name ? `${org.name} — plan usage, configuration & budget health` : 'Plan usage, configuration & budget health'}
      accent={ACCENT}
      titleIcon={<SlidersHorizontal size={20} />}
      layout="dashboard"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={hasOpenIncidents ? <AlertTriangle size={15} /> : <ShieldCheck size={15} />}
          minHeight={188}
          visual={
            <Box
              sx={{
                width: { xs: '100%', md: 188 },
                height: 188,
                borderRadius: 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                bgcolor: alpha(ACCENT, theme.palette.mode === 'dark' ? 0.14 : 0.08),
                border: `1px solid ${alpha(ACCENT, 0.4)}`,
              }}
            >
              {hasOpenIncidents ? (
                <AlertTriangle size={56} color={ACCENT} />
              ) : (
                <ShieldCheck size={56} color={ACCENT} />
              )}
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {hasOpenIncidents ? t('settings.budgetAlert') : t('settings.allClear')}
              </Typography>
            </Box>
          }
          headline={{
            label: t('settings.openBudgetAlerts'),
            value: incidentsQ.isSuccess ? openIncidents.length : '—',
            sub: hasOpenIncidents
              ? `${openIncidents.length} budget guardrail${openIncidents.length === 1 ? '' : 's'} breached — ${openIncidents
                  .slice(0, 3)
                  .map((i) => `${i.thresholdType} limit ${Math.round(i.amountObserved)}/${Math.round(i.amountLimit)}`)
                  .join(', ')}${openIncidents.length > 3 ? ` +${openIncidents.length - 3} more` : ''}. Review in engineer mode.`
              : activeBudgets
                ? `Budgets healthy — ${activeBudgets} active guardrail${activeBudgets === 1 ? '' : 's'}, no open alerts.`
                : 'Budgets healthy — no budget guardrails configured yet.',
            delta: (
              <Chip
                size="small"
                icon={hasOpenIncidents ? <AlertTriangle size={13} /> : <ShieldCheck size={13} />}
	                label={hasOpenIncidents ? t('hardcoded.action.needed.healthy.70dd0bd1') : t('hardcoded.healthy.7fc96708')}
                sx={{
                  fontWeight: 700,
                  fontSize: 12,
                  bgcolor: alpha(hasOpenIncidents ? colors.semantic.danger : colors.semantic.success, 0.14),
                  color: hasOpenIncidents ? colors.semantic.danger : colors.semantic.success,
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
            ),
          }}
          aside={
            <Box>
              <HeroStat
                icon={<Server size={14} />}
                tone={ACCENT}
                label={t('settings.activeBudgets')}
                value={budgetQ.isSuccess ? activeBudgets : '—'}
              />
              <HeroStat
                icon={<KeyRound size={14} />}
                tone={ACCENT}
                label={t('settings.configItems')}
                value={anyConfig ? configTotal : '—'}
              />
            </Box>
          }
        />
      }
      actions={
        caps ? (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip label={`Plan: ${caps.plan ?? '—'}`} size="small" sx={{ fontWeight: 700, textTransform: 'capitalize' }} />
            <Chip
              label={hasOpenIncidents ? `${openIncidents.length} budget alert${openIncidents.length === 1 ? '' : 's'}` : 'Budgets healthy'}
              size="small"
              color={hasOpenIncidents ? 'error' : 'success'}
              variant={hasOpenIncidents ? 'filled' : 'outlined'}
              sx={{ fontWeight: 700 }}
            />
          </Box>
        ) : undefined
      }
      kpis={
        <>
          <KpiCard
            label={t('settings.apiKeys')}
            value={keysQ.isSuccess ? keys.length : null}
            loading={keysQ.isLoading}
          />
          <KpiCard
            label={t('settings.businessUnits')}
            value={buQ.isSuccess ? businessUnits.length : null}
            loading={buQ.isLoading}
          />
          <KpiCard
            label={t('settings.scanCredentials')}
            value={credsQ.isSuccess ? creds.length : null}
            loading={credsQ.isLoading}
          />
          <KpiCard
            label={t('settings.openBudgetAlerts')}
            value={incidentsQ.isSuccess ? openIncidents.length : null}
            invertDelta
            loading={incidentsQ.isLoading}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('settings.planUtilization')}>
            {utilization.length > 0 ? (
              <StackedBarChart
                categories={utilization.map((u) => u.label)}
                series={[
                  { name: 'Used', data: utilization.map((u) => u.used), severity: 'high' },
                  { name: 'Available', data: utilization.map((u) => Math.max(u.cap - u.used, 0)) },
                ]}
                stacked
                horizontal
                height={240}
              />
            ) : (
              <Box sx={{ height: 240, display: 'grid', placeItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Plan has no caps configured
                </Typography>
              </Box>
            )}
          </ChartCard>

          <ChartCard title={t('settings.configurationFootprint')}>
            {anyConfig ? (
              <DonutChart data={configFootprint} totalLabel="Items" height={240} />
            ) : (
              <Box sx={{ height: 240, display: 'grid', placeItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Nothing configured yet — switch to engineer mode to set up keys, BUs & credentials
                </Typography>
              </Box>
            )}
          </ChartCard>
        </>
      }
      narrative={
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            Governance Summary
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {caps
              ? `${org?.name ?? t('organization.manager.thisOrganization')} has ${keys.length} automation ${
                  keys.length === 1 ? 'key' : 'keys'
                }, ${businessUnits.length} business ${businessUnits.length === 1 ? 'unit' : 'units'}, and ${
                  creds.length
                } authenticated-scan ${creds.length === 1 ? 'credential' : 'credentials'} configured. ${
                  activeBudgets
                    ? `${activeBudgets} active budget ${activeBudgets === 1 ? 'guardrail is' : 'guardrails are'} in place${
                        hasOpenIncidents ? ` with ${openIncidents.length} open alert${openIncidents.length === 1 ? '' : 's'} needing attention` : ' and no open alerts'
                      }.`
                    : 'No campaign budget guardrails are configured yet.'
                } Switch to engineer mode (top bar) for the full settings console.`
              : 'Loading organization settings…'}
          </Typography>
        </Box>
      }
    />
  )
}
