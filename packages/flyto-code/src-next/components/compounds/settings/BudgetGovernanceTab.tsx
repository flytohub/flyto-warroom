/**
 * BudgetGovernanceTab — generic per-org cost-budget governance.
 *
 * Wires the platform-native cost-budget surface (handlers_budget.go):
 *   - getBudgetOverview   → spend / limit / utilization / block status
 *   - listBudgetPolicies  → existing cost-budget policies
 *   - upsertBudgetPolicy  → author a monthly USD budget with hard-stop
 *
 * Distinct from BudgetPoliciesTab, which wires the *campaign* token-cap
 * surface. Amounts here are USD cost (engine stores integer cents). In
 * this product the org id IS the workspace id.
 *
 * Client fns imported by DIRECT FILE PATH per the decoupling rule.
 */
import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import { Coins, Plus, Gauge, Ban } from 'lucide-react'
import { useSnackbar } from 'notistack'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import {
  getBudgetOverview,
  listBudgetPolicies,
  upsertBudgetPolicy,
} from '@lib/engine/platform/budgets'
import EmptyStateGuide from '@atoms/EmptyStateGuide'
import InlineErrorNotice from '@atoms/InlineErrorNotice'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { sectionTitleSx, accentCardSx, rowSx, iconBoxSx, switchSx } from './shared'

const fmtUsd = (cents: number) =>
  (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' })

export function BudgetGovernanceTab() {
  const { org } = useOrg()
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const wsId = org?.id
  const enabled = !!wsId

  const overviewQ = useQuery({
    queryKey: qk.platform.budgetGovernanceOverview(wsId),
    queryFn: () => getBudgetOverview(wsId!),
    enabled,
    staleTime: 30_000,
  })
  const policiesQ = useQuery({
    queryKey: qk.platform.budgetGovernancePolicies(wsId),
    queryFn: () => listBudgetPolicies(wsId!),
    enabled,
    staleTime: 30_000,
  })

  const [amountUsd, setAmountUsd] = useState('')
  const [warnPercent, setWarnPercent] = useState('80')
  const [hardStop, setHardStop] = useState(true)

  const upsertMut = useMutation({
    mutationFn: () =>
      upsertBudgetPolicy({
        workspaceId: wsId!,
        amount: Math.round(Number(amountUsd) * 100),
        warnPercent: Number(warnPercent),
        hardStopEnabled: hardStop,
        scopeType: 'workspace',
        windowKind: 'calendar_month_utc',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.platform.budgetGovernancePolicies(wsId) })
      qc.invalidateQueries({ queryKey: qk.platform.budgetGovernanceOverview(wsId) })
      setAmountUsd('')
      enqueueSnackbar(t('settings.costBudget.saved'), { variant: 'success' })
    },
    onError: (e) => enqueueSnackbar(String((e as Error)?.message ?? e), { variant: 'error' }),
  })

  const overview = overviewQ.data
  const policies = policiesQ.data?.policies ?? []
  const util = overview ? Math.round((overview.utilization ?? 0) * 100) : 0
  const utilColor = util >= 100 ? '#ef4444' : util >= 80 ? '#fbbf24' : '#22c55e'

  if (!enabled) {
    return (
      <Box sx={{ ...accentCardSx('#fbbf24'), p: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {t('settings.costBudget.noOrg')}
        </Typography>
      </Box>
    )
  }

  return (
    <>
      {/* ── Overview ── */}
      <Box sx={sectionTitleSx}>
        <Gauge size={15} style={{ color: '#fbbf24', opacity: 0.9 }} />
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', fontSize: 12 }}>
          {t('settings.costBudget.overviewTitle')}
        </Typography>
        {overview?.isBlocked && (
          <Chip
            icon={<Ban size={12} />}
            label={t('settings.costBudget.blocked')}
            size="small"
            sx={{ height: 22, fontSize: 12, fontWeight: 600, ml: 1, bgcolor: 'rgba(239,68,68,0.12)', color: '#ef4444' }}
          />
        )}
      </Box>

      {overviewQ.isLoading && (
        <LoadingState variant="spinner" py={4} />
      )}
      {overviewQ.isError && (
        <Box sx={{ mb: 3 }}>
          <QueryError error={overviewQ.error} onRetry={overviewQ.refetch} label={t('settings.costBudget.overviewTitle')} compact />
        </Box>
      )}
      {overview && (
        <Box sx={{ ...accentCardSx(utilColor), p: 2.5, mb: 3 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4, mb: overview.currentLimitCents > 0 ? 2 : 0 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">{t('settings.costBudget.spend')}</Typography>
              <Typography variant="h6" fontWeight={700} color="text.primary">{fmtUsd(overview.currentSpendCents)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">{t('settings.costBudget.limit')}</Typography>
              <Typography variant="h6" fontWeight={700} color="text.primary">
                {overview.currentLimitCents > 0 ? fmtUsd(overview.currentLimitCents) : '—'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">{t('settings.costBudget.utilization')}</Typography>
              <Typography variant="h6" fontWeight={700} sx={{ color: utilColor }}>{util}%</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">{t('settings.costBudget.openIncidents')}</Typography>
              <Typography variant="h6" fontWeight={700} color="text.primary">{overview.activeIncidents?.length ?? 0}</Typography>
            </Box>
          </Box>
          {overview.currentLimitCents > 0 && (
            <LinearProgress
              variant="determinate"
              value={Math.min(util, 100)}
              sx={{ height: 8, borderRadius: 4, bgcolor: 'action.hover', '& .MuiLinearProgress-bar': { bgcolor: utilColor } }}
            />
          )}
        </Box>
      )}

      {/* ── Existing policies ── */}
      <Box sx={sectionTitleSx}>
        <Coins size={15} style={{ color: '#fbbf24', opacity: 0.9 }} />
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', fontSize: 12 }}>
          {t('settings.costBudget.policiesTitle')}
        </Typography>
      </Box>

      {policiesQ.isLoading && (
        <LoadingState variant="spinner" py={3} />
      )}
      {policiesQ.isError && (
        <Box sx={{ mb: 3 }}>
          <QueryError error={policiesQ.error} onRetry={policiesQ.refetch} label={t('settings.costBudget.policiesTitle')} compact />
        </Box>
      )}
      {!policiesQ.isLoading && !policiesQ.isError && policies.length === 0 && (
        <EmptyStateGuide icon={<Coins size={28} />} title={t('settings.costBudget.noPolicies')} py={4} />
      )}
      {!policiesQ.isError && policies.length > 0 && (
        <Box sx={{ ...accentCardSx('#fbbf24'), mb: 3 }}>
          {policies.map((p) => (
            <Box key={p.id} sx={rowSx}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, minWidth: 0 }}>
                <Box sx={iconBoxSx('#fbbf24')}>
                  <Coins size={15} style={{ color: '#fbbf24' }} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} color="text.primary">
                    {fmtUsd(p.amount)} / {p.windowKind === 'lifetime' ? t('settings.costBudget.lifetime') : t('settings.costBudget.month')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    {t('settings.costBudget.scope')}: {p.scopeType} · {t('settings.costBudget.warnAt')} {p.warnPercent}%
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {p.hardStopEnabled && (
                  <Chip label={t('settings.costBudget.hardStop')} size="small" sx={{ height: 22, fontSize: 12, fontWeight: 600, bgcolor: 'rgba(239,68,68,0.1)', color: '#ef4444' }} />
                )}
                <Chip
                  label={p.isActive ? t('settings.costBudget.active') : t('settings.costBudget.inactive')}
                  size="small"
                  sx={{ height: 22, fontSize: 12, fontWeight: 600, bgcolor: p.isActive ? 'rgba(34,197,94,0.1)' : 'action.hover', color: p.isActive ? '#22c55e' : 'text.secondary' }}
                />
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* ── Author / update policy ── */}
      <Box sx={accentCardSx('#fb923c')}>
        <Box sx={{ px: 2.5, py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" fontWeight={600} color="text.primary">
            {t('settings.costBudget.setMonthly')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              size="small"
              label={t('settings.costBudget.amountUsd')}
              value={amountUsd}
              onChange={(e) => setAmountUsd(e.target.value)}
              type="number"
              sx={{ width: 160, '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: 13 } }}
            />
            <TextField
              size="small"
              label={t('settings.costBudget.warnPct')}
              value={warnPercent}
              onChange={(e) => setWarnPercent(e.target.value)}
              type="number"
              sx={{ width: 100, '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: 13 } }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary">{t('settings.costBudget.hardStop')}</Typography>
              <Switch size="small" checked={hardStop} onChange={(e) => setHardStop(e.target.checked)} sx={switchSx} />
            </Box>
          </Box>
          {upsertMut.isError && (
            <InlineErrorNotice error={upsertMut.error} title={t('settings.costBudget.save')} />
          )}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} />}
              onClick={() => upsertMut.mutate()}
              disabled={!amountUsd || Number(amountUsd) <= 0 || upsertMut.isPending}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 2,
                px: 2.5,
                background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                '&:hover': { background: 'linear-gradient(135deg, #f59e0b, #d97706)' },
              }}
            >
              {t('settings.costBudget.save')}
            </Button>
          </Box>
        </Box>
      </Box>
    </>
  )
}
