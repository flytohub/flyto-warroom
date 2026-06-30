import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import {
  Box, Typography, Button, TextField, MenuItem, Chip,
} from '@mui/material'
import { Plus, Save, X, Trash2, Network } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { GatedButton, GatedIconButton } from '@atoms/GatedButton'
import EmptyStateGuide from '@atoms/EmptyStateGuide'
import InlineErrorNotice from '@atoms/InlineErrorNotice'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import {
  listSLAPolicies, upsertSLAPolicy, deleteSLAPolicy,
  listBusinessUnits,
  type SLAPolicy, type UpsertSLAPolicyReq, type SLASeverity,
} from '@lib/engine'

// SLAPoliciesTab — operator-facing CRUD for per-severity SRE
// error budgets. Each policy can be org-wide (empty BU) or
// per-BU. Same severity in two BUs = two policies; the
// SLAMonitor filter picks the right one.

const SEVERITIES: SLASeverity[] = ['critical', 'high', 'medium', 'low']
const SEV_COLORS: Record<SLASeverity, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#64748b', // canonical SEVERITY_TONE.low (slate) — was #22c55e green
}

const EMPTY_FORM: UpsertSLAPolicyReq = {
  severity: 'critical',
  allowed_breaches: 2,
  window_days: 90,
  alert_at_percent: 80,
  is_active: true,
  business_unit_id: '',
}

export function SLAPoliciesTab() {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const { org } = useOrg()
  const orgId = org?.id
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<UpsertSLAPolicyReq>(EMPTY_FORM)

  const policiesQ = useQuery({
    queryKey: qk.platform.slaPolicies(orgId),
    queryFn: () => listSLAPolicies(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })

  const busQ = useQuery({
    queryKey: qk.platform.businessUnits(orgId),
    queryFn: () => listBusinessUnits(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const bus = useMemo(() => busQ.data?.items ?? [], [busQ.data])
  const buLabelById = useMemo(() => {
    const m: Record<string, string> = {}
    for (const bu of bus) m[bu.id] = bu.label
    return m
  }, [bus])

  const upsertMut = useMutation({
    mutationFn: (req: UpsertSLAPolicyReq) => upsertSLAPolicy(orgId!, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.platform.slaPolicies(orgId) })
      qc.invalidateQueries({ queryKey: qk.ctem.slaBudget(orgId) })
      enqueueSnackbar(t('sla.policy.saved'), { variant: 'success' })
      setAdding(false)
      setForm(EMPTY_FORM)
    },
    onError: (e) => enqueueSnackbar(String(e as Error), { variant: 'error' }),
  })

  const deleteMut = useMutation({
    mutationFn: (sev: SLASeverity) => deleteSLAPolicy(orgId!, sev),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.platform.slaPolicies(orgId) })
      qc.invalidateQueries({ queryKey: qk.ctem.slaBudget(orgId) })
      enqueueSnackbar(t('sla.policy.deleted'), { variant: 'info' })
    },
  })

  const policies = policiesQ.data?.items ?? []

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('sla.policy.lede')}
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        {!adding && (
          <Button size="small" variant="contained" startIcon={<Plus size={14} />}
            onClick={() => setAdding(true)}
            sx={{ textTransform: 'none', bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
            {t('sla.policy.add')}
          </Button>
        )}
      </Box>

      {adding && (
        <Box sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '180px 180px 1fr', gap: 2, mb: 2 }}>
            <TextField select size="small" label={t('sla.policy.severity')}
              value={form.severity}
              onChange={e => setForm({ ...form, severity: e.target.value as SLASeverity })}>
              {SEVERITIES.map(s => (
                <MenuItem key={s} value={s}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLORS[s] }} />
                    {s}
                  </span>
                </MenuItem>
              ))}
            </TextField>
            <TextField size="small" type="number"
              label={t('sla.policy.allowedBreaches')}
              value={form.allowed_breaches}
              onChange={e => setForm({ ...form, allowed_breaches: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
            <TextField select size="small"
              label={t('sla.policy.scope')}
              value={form.business_unit_id || ''}
              onChange={e => setForm({ ...form, business_unit_id: e.target.value })}>
              <MenuItem value=""><em>{t('sla.policy.scopeOrgWide')}</em></MenuItem>
              {bus.map(bu => (
                <MenuItem key={bu.id} value={bu.id}>
                  <Network size={11} style={{ marginRight: 6, opacity: 0.7 }} />
                  {bu.label}
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '180px 180px', gap: 2, mb: 2 }}>
            <TextField size="small" type="number"
              label={t('sla.policy.windowDays')}
              value={form.window_days || 90}
              onChange={e => setForm({ ...form, window_days: parseInt(e.target.value, 10) || 90 })} />
            <TextField size="small" type="number"
              label={t('sla.policy.alertAtPercent')}
              value={form.alert_at_percent || 80}
              onChange={e => setForm({ ...form, alert_at_percent: Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 80)) })} />
          </Box>
          {upsertMut.isError && (
            <Box sx={{ mb: 1 }}>
              <InlineErrorNotice error={upsertMut.error} title={t('sla.policy.save')} />
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <GatedButton action="score:configure" size="small" variant="contained" startIcon={<Save size={13} />}
              disabled={upsertMut.isPending}
              onClick={() => upsertMut.mutate(form)}
              sx={{ textTransform: 'none', bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
              {t('sla.policy.save')}
            </GatedButton>
            <Button size="small" variant="outlined" startIcon={<X size={13} />}
              onClick={() => { setAdding(false); setForm(EMPTY_FORM) }}
              sx={{ textTransform: 'none' }}>
              {t('sla.policy.cancel')}
            </Button>
          </Box>
        </Box>
      )}

      {policiesQ.isLoading && <LoadingState variant="spinner" py={6} />}
      {policiesQ.isError && (
        <QueryError error={policiesQ.error} onRetry={policiesQ.refetch} label={t('sla.policy.lede')} compact />
      )}
      {!policiesQ.isLoading && !policiesQ.isError && policies.length === 0 && !adding && (
        <EmptyStateGuide
          icon={<Network size={28} />}
          title={t('sla.policy.empty')}
          description={t('sla.policy.emptyHint')}
          py={6}
        />
      )}

      {policies.map(p => (
        <PolicyRow key={`${p.business_unit_id || 'org'}-${p.severity}`} p={p}
          buLabel={p.business_unit_id ? buLabelById[p.business_unit_id] || p.business_unit_id : undefined}
          onDelete={() => deleteMut.mutate(p.severity as SLASeverity)} />
      ))}
    </Box>
  )
}

function PolicyRow({ p, buLabel, onDelete }: {
  p: SLAPolicy; buLabel?: string; onDelete: () => void
}) {
  return (
    <Box sx={{
      display: 'grid', gridTemplateColumns: '120px 1fr auto auto', gap: 2, alignItems: 'center',
      p: 1.5, mb: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1,
    }}>
      <Chip size="small" label={p.severity}
        sx={{
          height: 22, fontSize: 13, fontWeight: 700, textTransform: 'uppercase',
          bgcolor: `${SEV_COLORS[p.severity as SLASeverity]}22`,
          color: SEV_COLORS[p.severity as SLASeverity],
        }} />
      <Box>
        <Typography variant="body2" fontWeight={600}>
          {p.allowed_breaches} {t('sla.policy.breaches')} / {p.window_days} {t('sla.policy.days')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('sla.policy.alertAtPrefix')} {p.alert_at_percent}%
          {buLabel && ` · ${t('sla.policy.scopeBU')}: ${buLabel}`}
          {!p.business_unit_id && ` · ${t('sla.policy.scopeOrg')}`}
          {!p.is_active && ` · ${t('sla.policy.paused')}`}
        </Typography>
      </Box>
      {p.business_unit_id ? (
        <Chip size="small" icon={<Network size={11} />} label={buLabel || p.business_unit_id}
          sx={{ height: 20, fontSize: 12, bgcolor: 'rgba(124,58,237,0.15)', color: '#a78bfa' }} />
      ) : <span />}
      <GatedIconButton action="score:configure" size="small" onClick={onDelete}
        title={t('sla.policy.deleteTooltip')}>
        <Trash2 size={14} color="#ef4444" />
      </GatedIconButton>
    </Box>
  )
}
