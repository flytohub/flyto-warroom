import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import {
  Box, Alert, Button, Slider, Chip, Tooltip, TextField,
} from '@mui/material'
import { Sliders, RotateCcw, Save, AlertTriangle, Info } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import {
  getScoringConfig, updateScoringConfig, resetScoringConfig,
  DEFAULT_CATEGORY_WEIGHTS, DEFAULT_CONFIDENCE_MULTIPLIERS, DEFAULT_RISK_FACTORS,
  type ScoringConfig,
} from '@lib/engine'
import { colors, softBg } from '@/styles/designTokens'
import { SkeletonRows } from '@atoms/Skeleton'
import { QueryError } from '@atoms/QueryError'

// ScoringConfigTab — operator-tunable scoring weights.
//
// The backend normalizes weights server-side so the editor doesn't
// have to math them. Each slider goes 0..1 with 0.05 step; the
// running sum is displayed as a sanity check (sliders that don't
// sum to ~1.0 still work, they just get normalized at use time).
//
// Three groups:
//   1. Category weights — how the 4 top-level categories combine
//   2. Confidence multipliers — L0/L1/L2 evidence tier scaling
//   3. Risk factors — formula tuning (EPSS no-data, reachability fallbacks)

const CATEGORY_LABELS: Record<string, string> = {
  'code-security':  'Code Security',
  'attack-surface': 'Attack Surface',
  'diligence':      'Diligence',
  'code-quality':   'Code Quality',
}

const CONFIDENCE_HINTS: Record<string, string> = {
  L0: 'Manually entered / no evidence',
  L1: 'Single source observation',
  L2: 'Multi-source verified',
}

const RISK_FACTOR_HINTS: Record<string, string> = {
  epss_no_data_default: 'EPSS score fallback when CVE has no data (0..1)',
  reach_unknown: 'Reachability fallback when undetermined (0..1)',
  reach_unreachable: 'Multiplier when finding is known-unreachable (0..1)',
  impact_default: 'Default impact when no specific signal (0..1)',
}

export function ScoringConfigTab() {
  const { org } = useOrg()
  const orgId = org?.id ?? ''
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  const configQ = useQuery({
    queryKey: qk.scoring.config(orgId),
    queryFn: () => getScoringConfig(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const [draft, setDraft] = useState<ScoringConfig | null>(null)

  useEffect(() => {
    if (configQ.data) setDraft(JSON.parse(JSON.stringify(configQ.data)))
  }, [configQ.data])

  const updateMut = useMutation({
    mutationFn: (cfg: ScoringConfig) => updateScoringConfig(orgId, cfg),
    onSuccess: (saved) => {
      enqueueSnackbar(t('scoringConfig.saved'), { variant: 'success' })
      qc.setQueryData(qk.scoring.config(orgId), saved)
    },
    onError: (e: Error) => {
      enqueueSnackbar(e.message || t('scoringConfig.saveFailed'), { variant: 'error' })
    },
  })

  const resetMut = useMutation({
    mutationFn: () => resetScoringConfig(orgId),
    onSuccess: (defaultCfg) => {
      enqueueSnackbar(t('scoringConfig.reset'), { variant: 'success' })
      qc.setQueryData(qk.scoring.config(orgId), defaultCfg)
    },
    onError: (e: Error) => {
      enqueueSnackbar(e.message || t('scoringConfig.resetFailed'), { variant: 'error' })
    },
  })

  const categorySum = useMemo(() => {
    if (!draft) return 0
    return Object.values(draft.category_weights).reduce((acc, v) => acc + v, 0)
  }, [draft])

  const dirty = useMemo(() => {
    if (!draft || !configQ.data) return false
    return JSON.stringify(draft) !== JSON.stringify(configQ.data)
  }, [draft, configQ.data])

  if (configQ.isLoading) {
    return <Box sx={{ p: 3 }}><SkeletonRows rows={10} /></Box>
  }

  if (configQ.isError) {
    return (
      <Box sx={{ p: 3 }}>
        <QueryError error={configQ.error} onRetry={configQ.refetch} label={t('scoringConfig.loadFailed')} compact />
      </Box>
    )
  }

  if (!draft) return <Box sx={{ p: 3 }}><SkeletonRows rows={4} /></Box>

  const update = (mut: (d: ScoringConfig) => void) => {
    setDraft((prev) => {
      if (!prev) return prev
      const next = JSON.parse(JSON.stringify(prev)) as ScoringConfig
      mut(next)
      return next
    })
  }

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Sliders size={18} style={{ color: colors.brand }} />
          <Box sx={{ fontSize: 18, fontWeight: 600 }}>
            {t('scoringConfig.title')}
          </Box>
          <Chip
            size="small"
            label={draft.source}
            sx={{
              ml: 1,
              backgroundColor: softBg(draft.source === 'default' ? colors.semantic.neutral : colors.brand, 0.12),
              color: draft.source === 'default' ? colors.semantic.neutral : colors.brand,
              fontSize: 13,
              height: 20,
              fontWeight: 600,
            }}
          />
        </Box>
        <Box sx={{ fontSize: 13, color: 'text.secondary' }}>
          {t('scoringConfig.subtitle')}
        </Box>
      </Box>

      <Alert severity="warning" variant="outlined" sx={{ mb: 3 }} icon={<AlertTriangle size={16} />}>
        {t('scoringConfig.warning')}
      </Alert>

      {/* Category weights */}
      <Section title={t('scoringConfig.categoryWeights')} sum={categorySum}>
        {Object.keys(DEFAULT_CATEGORY_WEIGHTS).map((key) => {
          const val = draft.category_weights[key] ?? 0
          const isCustom = Math.abs(val - (DEFAULT_CATEGORY_WEIGHTS[key] ?? 0)) > 0.001
          return (
            <WeightRow
              key={key}
              label={CATEGORY_LABELS[key] ?? key}
              value={val}
              isCustom={isCustom}
              onChange={(v) => update((d) => { d.category_weights[key] = v })}
            />
          )
        })}
      </Section>

      {/* Confidence multipliers */}
      <Section title={t('scoringConfig.confidence')}>
        {Object.keys(DEFAULT_CONFIDENCE_MULTIPLIERS).map((key) => {
          const val = draft.confidence_multipliers[key] ?? 0
          const isCustom = Math.abs(val - (DEFAULT_CONFIDENCE_MULTIPLIERS[key] ?? 0)) > 0.001
          return (
            <WeightRow
              key={key}
              label={key}
              hint={CONFIDENCE_HINTS[key]}
              value={val}
              isCustom={isCustom}
              onChange={(v) => update((d) => { d.confidence_multipliers[key] = v })}
            />
          )
        })}
      </Section>

      {/* Risk factors */}
      <Section title={t('scoringConfig.riskFactors')}>
        {Object.keys(DEFAULT_RISK_FACTORS).map((key) => {
          const val = draft.risk_factors[key] ?? 0
          const isCustom = Math.abs(val - (DEFAULT_RISK_FACTORS[key] ?? 0)) > 0.001
          return (
            <WeightRow
              key={key}
              label={key.replace(/_/g, ' ')}
              hint={RISK_FACTOR_HINTS[key]}
              value={val}
              isCustom={isCustom}
              onChange={(v) => update((d) => { d.risk_factors[key] = v })}
            />
          )
        })}
      </Section>

      {/* Score runs counter */}
      <Box sx={{
        mb: 3,
        p: 2,
        borderRadius: 1,
        backgroundColor: softBg(colors.semantic.neutral, 0.06),
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        fontSize: 13,
        color: 'text.secondary',
      }}>
        <Info size={14} />
        {t('scoringConfig.scoreRuns')} <Box component="strong" sx={{ color: 'text.primary' }}>{draft.score_runs}</Box> {t('scoringConfig.times')}
      </Box>

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between' }}>
        <Button
          color="warning"
          startIcon={<RotateCcw size={14} />}
          onClick={() => {
            if (window.confirm(t('scoringConfig.resetConfirm'))) {
              resetMut.mutate()
            }
          }}
          disabled={resetMut.isPending || updateMut.isPending}
        >
          {t('scoringConfig.resetButton')}
        </Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            onClick={() => {
              if (configQ.data) setDraft(JSON.parse(JSON.stringify(configQ.data)))
            }}
            disabled={!dirty}
          >
            {t('common.discard')}
          </Button>
          <Button
            variant="contained"
            startIcon={<Save size={14} />}
            onClick={() => draft && updateMut.mutate(draft)}
            disabled={!dirty || updateMut.isPending || resetMut.isPending}
          >
            {updateMut.isPending
              ? t('common.saving')
              : t('common.save')}
          </Button>
        </Box>
      </Box>
    </Box>
  )
}

function Section({
  title, sum, children,
}: {
  title: string
  sum?: number
  children: React.ReactNode
}) {
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        mb: 1,
        pb: 0.75,
        borderBottom: `1px solid ${softBg(colors.semantic.neutral, 0.15)}`,
      }}>
        <Box sx={{
          fontSize: 13,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: 'text.secondary',
        }}>
          {title}
        </Box>
        {sum !== undefined && (
          <Tooltip title="Auto-normalized server-side; this is just a sanity check.">
            <Box sx={{ fontSize: 12, color: 'text.secondary', fontFamily: 'monospace' }}>
              Σ = {sum.toFixed(2)}
            </Box>
          </Tooltip>
        )}
      </Box>
      {children}
    </Box>
  )
}

function WeightRow({
  label, hint, value, isCustom, onChange,
}: {
  label: string
  hint?: string
  value: number
  isCustom: boolean
  onChange: (v: number) => void
}) {
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: '180px 1fr 90px',
      gap: 2,
      alignItems: 'center',
      py: 1,
    }}>
      <Box>
        <Box sx={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {label}
          {isCustom && (
            <Tooltip title={t('scoringConfig.modifiedFromDefault')}>
              <Box sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: colors.brand,
              }} />
            </Tooltip>
          )}
        </Box>
        {hint && (
          <Box sx={{ fontSize: 13, color: 'text.secondary', mt: 0.25 }}>{hint}</Box>
        )}
      </Box>
      <Slider
        size="small"
        value={value}
        min={0}
        max={1}
        step={0.05}
        onChange={(_, v) => onChange(Array.isArray(v) ? v[0] : v)}
        sx={{
          '& .MuiSlider-thumb': {
            backgroundColor: isCustom ? colors.brand : colors.tech,
          },
          '& .MuiSlider-track': {
            backgroundColor: isCustom ? colors.brand : colors.tech,
          },
        }}
      />
      <TextField
        size="small"
        type="number"
        value={value.toFixed(2)}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!Number.isNaN(v)) onChange(Math.max(0, Math.min(1, v)))
        }}
        inputProps={{ step: 0.05, min: 0, max: 1, style: { fontFamily: 'monospace' } }}
      />
    </Box>
  )
}
