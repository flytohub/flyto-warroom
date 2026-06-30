/**
 * AutofixView — AutoFix surface, findings-driven.
 */

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import { TabBar } from '@atoms/TabBar'
import { qk } from '@lib/queryKeys'
import { t, tOr } from '@lib/i18n';
import { useOrg } from '@hooks/useOrg'
import { listAutofixFindings, listAutofixRules } from '@lib/engine'
import { AutofixFindingsView } from '@compounds/_shared/AutofixFindingsView'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { useFixQueue } from '@/contexts/FixQueueContext'
import Button from '@mui/material/Button'
import { Wand2 } from 'lucide-react'
import { colors } from '@/styles/designTokens'
import { type RuleRow, type Tab as TabId, TABS } from './_shared'
import { RunButton } from './RunButton'
import { AuditTab } from './AuditTab'
import { PromotionTab } from './PromotionTab'
import { SettingsTab } from './SettingsTab'
import { RemediationCenter } from './RemediationCenter'
import { querySucceeded, resolvedList } from '@lib/queryState'

export function AutofixView() {
  const { org } = useOrg()
  const qc = useQueryClient()
  const fixQueue = useFixQueue()
  const isAdmin = org?.isAdmin ?? false

  const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin)
  const [tab, setTab] = useState<TabId>('dependencies')
  const safeTab: TabId = visibleTabs.some(t => t.id === tab) ? tab : 'dependencies'

  const findingsQ = useQuery({
    queryKey: qk.autofix.findings(org?.id),
    queryFn: () => listAutofixFindings(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
    retry: false,
  })
  const findingsReady = querySucceeded(findingsQ, !!org?.id)
  const allFindings = useMemo(() => {
    const raw = resolvedList(findingsQ.data?.findings, findingsQ, !!org?.id)
    // Same filter as AutofixFindingsView — exclude tier2-ai no_preview
    // so badge counts match what the child actually shows.
    return raw.filter(f => !(f.rule_id === 'tier2-ai' && f.patch_status === 'no_preview'))
  }, [findingsQ.data?.findings, findingsQ, org?.id])
  const categoryCounts = useMemo(() => {
    const c: Record<string, number> = {
      dependencies: 0, sast: 0, iac: 0, pentest: 0, containers: 0,
    }
    for (const f of allFindings) {
      const k = f.rule_category || ''
      if (k in c) c[k]++
    }
    return c
  }, [allFindings])

  const rulesQ = useQuery({
    queryKey: qk.autofix.rules(org?.id),
    queryFn: () => listAutofixRules(org!.id),
    enabled: !!org?.id && (safeTab === 'settings'),
    staleTime: 60_000,
  })
  const allRules: RuleRow[] = resolvedList(rulesQ.data?.rules, rulesQ, !!org?.id && safeTab === 'settings')

  const currentCategory = TABS.find(t => t.id === safeTab)?.category
  const totalFindings = allFindings.length

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', p: 3 }}>
      {/* Section accent rail — keeps engineer mode visually aligned with
          the manager view (both keyed off colors.tech). Hue-only; the
          surface stays theme palette so it works in light + dark. */}
      <Box sx={{ borderLeft: `3px solid ${colors.tech}`, pl: 2, mb: 2 }}>
      <FlytoPageHeader
        title={t('autofix.tab')}
        subtitle={t('autofix.subtitle')}
        count={
          <Chip
            label={findingsReady ? totalFindings : '…'}
            size="small"
            sx={{
              fontWeight: 700,
              bgcolor: findingsReady && totalFindings > 0 ? 'warning.main' : 'action.selected',
              color: findingsReady && totalFindings > 0
                ? (theme) => theme.palette.warning.contrastText
                : 'text.secondary',
            }}
          />
        }
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {/* Fix Queue entry — same drawer the dashboard / pulse /
                CTEM / Issues use. Filter scoped to autofix so the
                queue only shows what's approvable here. */}
            {findingsReady && totalFindings > 0 && (
              <Button
                size="small"
                variant="contained"
                color="inherit"
                disableElevation
                startIcon={<Wand2 size={14} />}
                onClick={() => fixQueue.open({ filter: 'autofix' })}
                sx={{
                  textTransform: 'none', fontWeight: 700,
                  // Brand violet is dark enough that white text is the
                  // intentional, accessible pairing in both light + dark.
                  bgcolor: colors.brandDeep, color: '#fff', boxShadow: 'none',
                  '&:hover': { bgcolor: colors.brandDarkest, boxShadow: 'none' },
                  '&:active': { bgcolor: colors.brandDarkest, boxShadow: 'none' },
                }}
              >
                {t('autofix.openFixQueue')}
              </Button>
            )}
            {isAdmin && currentCategory !== undefined && (
              <RunButton
                orgId={org?.id}
                onRunComplete={() => {
                  qc.invalidateQueries({ queryKey: qk.autofix.findings(org?.id) })
                  qc.invalidateQueries({ queryKey: qk.autofix.findingsCount(org?.id) })
                  qc.invalidateQueries({ queryKey: qk.autofix.runs(org?.id) })
                }}
              />
            )}
          </Box>
        }
        bottomGap={0}
      />
      </Box>

      {/* Tabs */}
      <Box sx={{ flexShrink: 0, mb: 2 }}>
        <TabBar
          value={safeTab}
          onChange={(v) => setTab(v as TabId)}
          noDivider
          items={visibleTabs.map(tabDef => {
            const Icon = tabDef.icon
            const count = tabDef.category ? categoryCounts[tabDef.category] : undefined
            return {
              value: tabDef.id,
              label: tOr(`autofix.warroom.${tabDef.labelKey}`, tabDef.defaultLabel),
              icon: <Icon size={14} />,
              count: typeof count === 'number' ? count : undefined,
            }
          })}
        />
      </Box>

      {/* Content — scrollable */}
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {currentCategory !== undefined && (
          <AutofixFindingsView category={currentCategory} />
        )}
        {safeTab === 'remediation' && <RemediationCenter orgId={org?.id} />}
        {safeTab === 'audit' && <AuditTab orgId={org?.id} />}
        {safeTab === 'promotion' && <PromotionTab orgId={org?.id} />}
        {safeTab === 'settings' && (
          <SettingsTab
            rules={allRules}
            orgId={org?.id}
            onChanged={() => qc.invalidateQueries({ queryKey: qk.autofix.rules(org?.id) })}
          />
        )}
      </Box>
    </Box>
  )
}
