/**
 * CampaignBudgetPanel — per-org red team token budget manager.
 *
 * Two sections:
 *   1. Open incidents — soft/hard breach rows with a Resolve button
 *   2. Token caps — list + inline edit (one row per metric × window)
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import LinearProgress from '@mui/material/LinearProgress'
import IconButton from '@mui/material/IconButton'
import {
  AlertTriangle, CheckCircle2, Gauge, Loader2, Plus, Trash2, X, Pencil,
} from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import {
  listCampaignBudgetPolicies, upsertCampaignBudgetPolicy,
  deleteCampaignBudgetPolicy,
  listCampaignBudgetIncidents, resolveCampaignBudgetIncident,
  type CampaignBudgetPolicy, type CampaignBudgetMetric,
} from '@lib/engine/platform/campaignBudget'

const DEFAULT_POLICY = {
  metric: 'total_tokens' as CampaignBudgetMetric,
  window_days: 30,
  amount: 1_000_000,
  warn_percent: 80,
  hard_stop_enabled: true,
  is_active: true,
}

function metricLabel(m: CampaignBudgetMetric): string {
  switch (m) {
    case 'input_tokens':  return t('warroom.budgetMetricInput')
    case 'output_tokens': return t('warroom.budgetMetricOutput')
    case 'total_tokens':  return t('warroom.budgetMetricTotal')
  }
}

export function CampaignBudgetPanel() {
  const { org } = useOrg()
  const qc = useQueryClient()
  const orgId = org?.id ?? null
  const [editing, setEditing] = useState<null | { id?: string } & typeof DEFAULT_POLICY>(null)

  const { data: policiesResp } = useQuery({
    queryKey: qk.pentest.campaignBudgetPolicies(orgId),
    queryFn: () => listCampaignBudgetPolicies(orgId!),
    enabled: !!orgId,
  })
  const { data: incidentsResp } = useQuery({
    queryKey: qk.pentest.campaignBudgetIncidents(orgId),
    queryFn: () => listCampaignBudgetIncidents(orgId!),
    enabled: !!orgId,
  })

  const saveMut = useMutation({
    mutationFn: (body: typeof DEFAULT_POLICY & { id?: string }) =>
      upsertCampaignBudgetPolicy(orgId!, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.pentest.campaignBudgetPolicies(orgId) })
      setEditing(null)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCampaignBudgetPolicy(orgId!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.pentest.campaignBudgetPolicies(orgId) }),
  })

  const resolveMut = useMutation({
    mutationFn: (id: string) => resolveCampaignBudgetIncident(orgId!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.pentest.campaignBudgetIncidents(orgId) }),
  })

  const policies = policiesResp?.policies ?? []
  const incidents = incidentsResp?.incidents ?? []

  if (!orgId) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {t('warroom.budgetNoOrg')}
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Incidents section */}
      <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: 1, borderColor: incidents.length > 0 ? 'warning.main' : 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <AlertTriangle size={14} style={{ color: incidents.length > 0 ? '#f97316' : undefined }} />
          <Typography variant="subtitle2" fontWeight={600}>
            {t('warroom.budgetIncidentsHeader')}
          </Typography>
          <Chip
            label={incidents.length}
            size="small"
            color={incidents.length > 0 ? 'warning' : 'default'}
            sx={{ height: 20, fontSize: 13, fontWeight: 700 }}
          />
        </Box>
        {incidents.length === 0 ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2, justifyContent: 'center', opacity: 0.6 }}>
            <CheckCircle2 size={18} style={{ color: '#22c55e' }} />
            <Typography variant="body2">{t('warroom.budgetIncidentsEmpty')}</Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {incidents.map(inc => {
              const pct = inc.amountLimit > 0
                ? Math.round((inc.amountObserved / inc.amountLimit) * 100)
                : 0
              const isHard = inc.thresholdType === 'hard'
              const meta = t('warroom.budgetIncidentMeta')
                .replace('{policyId}', inc.policyId.slice(0, 8))
                .replace('{when}', new Date(inc.createdAt).toLocaleString())
              return (
                <Paper
                  key={inc.id}
                  elevation={0}
                  sx={{
                    p: 1.5, borderRadius: 1.5, display: 'flex', alignItems: 'center', gap: 2,
                    border: 1, borderColor: isHard ? 'error.main' : 'warning.main',
                    bgcolor: isHard ? 'rgba(239,68,68,0.04)' : 'rgba(249,115,22,0.04)',
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Chip
                        label={isHard ? t('warroom.budgetHardBreach') : t('warroom.budgetSoftWarn')}
                        size="small"
                        color={isHard ? 'error' : 'warning'}
                        sx={{ height: 22, fontSize: 13, fontWeight: 600 }}
                      />
                      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                        {inc.amountObserved.toLocaleString()} / {inc.amountLimit.toLocaleString()} · <b>{pct}%</b>
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
                      {meta}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(pct, 100)}
                      color={isHard ? 'error' : 'warning'}
                      sx={{ mt: 1, height: 4, borderRadius: 2 }}
                    />
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={resolveMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                    onClick={() => resolveMut.mutate(inc.id)}
                    disabled={resolveMut.isPending}
                    sx={{ textTransform: 'none', fontSize: 13, flexShrink: 0 }}
                  >
                    {t('warroom.budgetResolve')}
                  </Button>
                </Paper>
              )
            })}
          </Box>
        )}
      </Paper>

      {/* Policies section */}
      <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Gauge size={14} />
          <Typography variant="subtitle2" fontWeight={600}>
            {t('warroom.budgetPoliciesHeader')}
          </Typography>
          <Chip label={policies.length} size="small" sx={{ height: 20, fontSize: 13, fontWeight: 700 }} />
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            variant="contained"
            startIcon={<Plus size={12} />}
            onClick={() => setEditing({ ...DEFAULT_POLICY })}
            disabled={!!editing}
            sx={{ textTransform: 'none', fontSize: 12 }}
          >
            {t('warroom.budgetNew')}
          </Button>
        </Box>

        {policies.length === 0 && !editing ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 3, justifyContent: 'center', opacity: 0.6 }}>
            <Gauge size={18} />
            <Typography variant="body2">
              {t('warroom.budgetPoliciesEmpty')}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {policies.map(p => (
              <PolicyRow
                key={p.id}
                policy={p}
                onEdit={() => setEditing({
                  id: p.id,
                  metric: p.metric,
                  window_days: p.windowDays,
                  amount: p.amount,
                  warn_percent: p.warnPercent,
                  hard_stop_enabled: p.hardStopEnabled,
                  is_active: p.isActive,
                })}
                onDelete={() => deleteMut.mutate(p.id)}
              />
            ))}
          </Box>
        )}

        {editing && (
          <PolicyForm
            value={editing}
            onChange={setEditing}
            onSave={() => saveMut.mutate(editing)}
            onCancel={() => setEditing(null)}
            saving={saveMut.isPending}
          />
        )}
      </Paper>
    </Box>
  )
}

function PolicyRow({
  policy, onEdit, onDelete,
}: { policy: CampaignBudgetPolicy; onEdit: () => void; onDelete: () => void }) {
  const windowLabel = t('warroom.budgetLastDays')
    .replace('{days}', String(policy.windowDays))
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 2,
      p: 1.5, borderRadius: 1.5,
      border: 1, borderColor: 'divider',
      opacity: policy.isActive ? 1 : 0.6,
      '&:hover': { bgcolor: 'action.hover' },
      transition: 'all 0.15s',
    }}>
      <Box sx={{ flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" fontWeight={600}>{metricLabel(policy.metric)}</Typography>
          <Typography variant="body2" color="text.secondary">{windowLabel}</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {t('warroom.budgetCapPrefix')} <b>{policy.amount.toLocaleString()}</b>
          </Typography>
          <Typography variant="body2" color="text.secondary">·</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('warroom.budgetWarnAt')} <b>{policy.warnPercent}%</b>
          </Typography>
          <Typography variant="body2" color="text.secondary">·</Typography>
          <Typography variant="caption" sx={{ color: policy.hardStopEnabled ? '#ef4444' : 'text.secondary' }}>
            {policy.hardStopEnabled
              ? t('warroom.budgetHardStopOn')
              : t('warroom.budgetMonitorOnly')}
          </Typography>
          {!policy.isActive && (
            <>
              <Typography variant="body2" color="text.secondary">·</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                {t('warroom.budgetInactive')}
              </Typography>
            </>
          )}
        </Box>
      </Box>
      <IconButton size="small" onClick={onEdit} title={t('warroom.budgetEditPolicy')}>
        <Pencil size={14} />
      </IconButton>
      <IconButton size="small" onClick={onDelete} title={t('warroom.budgetDelete')} sx={{ color: 'error.main' }}>
        <Trash2 size={14} />
      </IconButton>
    </Box>
  )
}

function PolicyForm({
  value, onChange, onSave, onCancel, saving,
}: {
  value: { id?: string } & typeof DEFAULT_POLICY
  onChange: (v: { id?: string } & typeof DEFAULT_POLICY) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  return (
    <Paper elevation={0} sx={{ mt: 2, p: 2, borderRadius: 2, border: 1, borderColor: 'primary.main', bgcolor: 'action.hover' }}>
      <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        {t('warroom.budgetFormHint')}
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <TextField
          select
          label={t('warroom.budgetMetricTotal')}
          value={value.metric}
          onChange={e => onChange({ ...value, metric: e.target.value as CampaignBudgetMetric })}
          size="small"
          fullWidth
        >
          <MenuItem value="total_tokens">{t('warroom.budgetMetricTotal')}</MenuItem>
          <MenuItem value="input_tokens">{t('warroom.budgetMetricInput')}</MenuItem>
          <MenuItem value="output_tokens">{t('warroom.budgetMetricOutput')}</MenuItem>
        </TextField>
        <TextField
          label={t('warroom.budgetWindow')}
          type="number"
          size="small"
          fullWidth
          inputProps={{ min: 1, max: 365 }}
          value={value.window_days}
          onChange={e => onChange({ ...value, window_days: Number(e.target.value) || 1 })}
        />
        <TextField
          label={t('warroom.budgetAmount')}
          type="number"
          size="small"
          fullWidth
          inputProps={{ min: 1 }}
          value={value.amount}
          onChange={e => onChange({ ...value, amount: Number(e.target.value) || 1 })}
        />
        <TextField
          label={`${t('warroom.budgetWarnAt')} (%)`}
          type="number"
          size="small"
          fullWidth
          inputProps={{ min: 1, max: 99 }}
          value={value.warn_percent}
          onChange={e => onChange({ ...value, warn_percent: Number(e.target.value) || 80 })}
        />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mt: 2 }}>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={value.hard_stop_enabled}
              onChange={e => onChange({ ...value, hard_stop_enabled: e.target.checked })}
            />
          }
          label={<Typography variant="caption">{t('warroom.budgetHardStop')}</Typography>}
        />
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={value.is_active}
              onChange={e => onChange({ ...value, is_active: e.target.checked })}
            />
          }
          label={<Typography variant="caption">{t('warroom.budgetActive')}</Typography>}
        />
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 2 }}>
        <Button size="small" variant="text" startIcon={<X size={12} />} onClick={onCancel} disabled={saving} sx={{ textTransform: 'none' }}>
          {t('warroom.budgetCancel')}
        </Button>
        <Button
          size="small"
          variant="contained"
          startIcon={saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
          onClick={onSave}
          disabled={saving}
          sx={{ textTransform: 'none' }}
        >
          {value.id
            ? t('warroom.budgetSave')
            : t('warroom.budgetCreate')}
        </Button>
      </Box>
    </Paper>
  )
}
