import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Switch from '@mui/material/Switch'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import TextField from '@mui/material/TextField'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import { Coins, Plus, Trash2, Zap } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listCampaignBudgetPolicies,
  upsertCampaignBudgetPolicy,
  deleteCampaignBudgetPolicy,
  type CampaignBudgetMetric,
} from '@lib/engine'
import EmptyStateGuide from '@atoms/EmptyStateGuide'
import InlineErrorNotice from '@atoms/InlineErrorNotice'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { sectionTitleSx, accentCardSx, rowSx, iconBoxSx, selectSx, switchSx } from './shared'

export function BudgetPoliciesTab() {
  const { org } = useOrg()
  const qc = useQueryClient()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.platform.budgetPolicies(org?.id),
    queryFn: () => listCampaignBudgetPolicies(org!.id),
    enabled: !!org,
    staleTime: 60_000,
  })

  const policies = data?.policies ?? []

  const [metric, setMetric] = useState<CampaignBudgetMetric>('total_tokens')
  const [windowDays, setWindowDays] = useState('30')
  const [amount, setAmount] = useState('')
  const [warnPercent, setWarnPercent] = useState('80')
  const [hardStop, setHardStop] = useState(true)

  const createMutation = useMutation({
    mutationFn: () => upsertCampaignBudgetPolicy(org!.id, {
      metric,
      window_days: Number(windowDays),
      amount: Number(amount),
      warn_percent: Number(warnPercent),
      hard_stop_enabled: hardStop,
      is_active: true,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.platform.budgetPolicies(org?.id) })
      setAmount('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (policyId: string) => deleteCampaignBudgetPolicy(org!.id, policyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.platform.budgetPolicies(org?.id) }),
  })

  const metricLabels: Record<CampaignBudgetMetric, string> = {
    input_tokens: t('settings.budget.metricInput'),
    output_tokens: t('settings.budget.metricOutput'),
    total_tokens: t('settings.budget.metricTotal'),
  }

  if (isLoading) {
    return <LoadingState variant="spinner" py={6} />
  }

  if (isError) {
    return <QueryError error={error} onRetry={refetch} label={t('settings.budget.title')} compact />
  }

  return (
    <>
      <Box sx={sectionTitleSx}>
        <Coins size={15} style={{ color: '#fbbf24', opacity: 0.9 }} />
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', fontSize: 12 }}>
          {t('settings.budget.title')}
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mb: 2, lineHeight: 1.5 }}>
        {t('settings.budget.desc')}
      </Typography>

      {/* Existing policies */}
      {policies.length === 0 && (
        <EmptyStateGuide icon={<Coins size={28} />} title={t('settings.budget.addNew')} py={4} />
      )}
      {policies.length > 0 && (
        <Box sx={{ ...accentCardSx, mb: 3 }}>
          {policies.map(p => (
            <Box key={p.id} sx={rowSx}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                <Box sx={iconBoxSx('#fbbf24')}>
                  <Zap size={15} style={{ color: '#fbbf24' }} />
                </Box>
                <Box>
                  <Typography variant="body2" fontWeight={600} color="text.primary">
                    {metricLabels[p.metric as CampaignBudgetMetric] ?? p.metric}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    {Number(p.amount).toLocaleString()} {t('settings.budget.amountFormat')} {p.windowDays}d
                    {' · '}{t('settings.budget.warnAtFormat')} {p.warnPercent}%
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {p.hardStopEnabled && (
                  <Chip label={t('settings.budget.hardStop')} size="small" sx={{ height: 22, fontSize: 12, fontWeight: 600, bgcolor: 'rgba(248,113,113,0.1)', color: '#ef4444' }} />
                )}
                <Chip
                  label={p.isActive ? t('settings.budget.active') : t('settings.budget.inactive')}
                  size="small"
                  sx={{ height: 22, fontSize: 12, fontWeight: 600, bgcolor: p.isActive ? 'rgba(52,211,153,0.1)' : 'action.hover', color: p.isActive ? '#34d399' : 'text.secondary' }}
                />
                <IconButton
                  size="small"
                  onClick={() => deleteMutation.mutate(p.id)}
                  aria-label={t('common.delete')}
                  title={t('common.delete')}
                  sx={{ color: 'text.secondary', '&:hover': { color: '#ef4444' } }}
                >
                  <Trash2 size={14} />
                </IconButton>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* Add new policy */}
      <Box sx={accentCardSx('#fb923c')}>
        <Box sx={{ px: 2.5, py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" fontWeight={600} color="text.primary">
            {t('settings.budget.addNew')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <Select value={metric} onChange={e => setMetric(e.target.value as CampaignBudgetMetric)} size="small" sx={selectSx}>
                <MenuItem value="total_tokens">{t('settings.budget.metricTotal')}</MenuItem>
                <MenuItem value="input_tokens">{t('settings.budget.metricInput')}</MenuItem>
                <MenuItem value="output_tokens">{t('settings.budget.metricOutput')}</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              placeholder={t('settings.budget.amountPlaceholder')}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              type="number"
              sx={{ width: 120, '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: 13 } }}
            />
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <Select value={windowDays} onChange={e => setWindowDays(e.target.value)} size="small" sx={selectSx}>
                <MenuItem value="1">{t('settings.budget.window1d')}</MenuItem>
                <MenuItem value="7">{t('settings.budget.window7d')}</MenuItem>
                <MenuItem value="30">{t('settings.budget.window30d')}</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              placeholder={t('settings.budget.warnPercentPlaceholder')}
              value={warnPercent}
              onChange={e => setWarnPercent(e.target.value)}
              type="number"
              sx={{ width: 80, '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: 13 } }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary">{t('settings.budget.hardStop')}</Typography>
              <Switch size="small" checked={hardStop} onChange={e => setHardStop(e.target.checked)} sx={switchSx} />
            </Box>
          </Box>
          {createMutation.isError && (
            <InlineErrorNotice error={createMutation.error} title={t('settings.budget.add')} />
          )}
          {deleteMutation.isError && (
            <InlineErrorNotice error={deleteMutation.error} title={t('common.delete')} />
          )}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} />}
              onClick={() => createMutation.mutate()}
              disabled={!amount || createMutation.isPending}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 2,
                px: 2.5,
                background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)', boxShadow: 'none',
                '&:hover': { background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', boxShadow: 'none' },
              }}
            >
              {t('settings.budget.add')}
            </Button>
          </Box>
        </Box>
      </Box>
    </>
  )
}
