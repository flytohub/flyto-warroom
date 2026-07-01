/**
 * CampaignBudgetPanel — per-org red team token budget manager.
 *
 * Two sections:
 *   1. Open incidents — soft/hard breach rows with a Resolve button
 *   2. Token caps — list + inline edit (one row per metric × window)
 */
import { useState, type ReactNode } from 'react'
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
import { alpha, keyframes, styled } from '@mui/material/styles'
import {
  AlertTriangle, CheckCircle2, Gauge, Loader2, Plus, Trash2, X, Pencil,
} from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { queryFailed, queryUnresolved, resolvedList } from '@lib/queryState'
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

const spin = keyframes({
  to: {
    transform: 'rotate(360deg)',
  },
})

const SpinningLoader = styled(Loader2)({
  animation: `${spin} 1s linear infinite`,
})

const PanelStack = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(3),
}))

const CenterState = styled(Box)(({ theme }) => ({
  paddingTop: theme.spacing(6),
  paddingBottom: theme.spacing(6),
  textAlign: 'center',
}))

const BudgetSectionPaper = styled(Paper, {
  shouldForwardProp: (prop) => prop !== 'hasIncidents' && prop !== 'accent',
})<{ hasIncidents?: boolean; accent?: 'primary' }>(({ theme, hasIncidents, accent }) => ({
  padding: theme.spacing(2),
  borderRadius: theme.spacing(1),
  border: `1px solid ${
    hasIncidents
      ? theme.palette.warning.main
      : accent === 'primary'
        ? theme.palette.primary.main
        : theme.palette.divider
  }`,
  backgroundColor: accent === 'primary' ? theme.palette.action.hover : theme.palette.background.paper,
}))

const SectionHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1.5),
  marginBottom: theme.spacing(2),
}))

const HeaderSpacer = styled(Box)({
  flex: 1,
})

const SectionAlertIcon = styled(AlertTriangle, {
  shouldForwardProp: (prop) => prop !== 'hasIncidents',
})<{ hasIncidents?: boolean }>(({ theme, hasIncidents }) => ({
  color: hasIncidents ? theme.palette.warning.main : 'currentColor',
}))

const SuccessCheckIcon = styled(CheckCircle2)(({ theme }) => ({
  color: theme.palette.success.main,
}))

const CountChip = styled(Chip)(({ theme }) => ({
  height: theme.spacing(2.5),
  fontSize: theme.typography.pxToRem(13),
  fontWeight: 700,
}))

const BreachChip = styled(Chip)(({ theme }) => ({
  height: theme.spacing(2.75),
  fontSize: theme.typography.pxToRem(13),
  fontWeight: 600,
}))

const EmptyStateRoot = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1.5),
  paddingTop: theme.spacing(2),
  paddingBottom: theme.spacing(2),
  justifyContent: 'center',
  opacity: 0.6,
}))

const EmptyStateRootLarge = styled(EmptyStateRoot)(({ theme }) => ({
  paddingTop: theme.spacing(3),
  paddingBottom: theme.spacing(3),
}))

const ColumnStack = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(1.5),
}))

const TightColumnStack = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(1),
}))

const IncidentCard = styled(Paper, {
  shouldForwardProp: (prop) => prop !== 'hardBreach',
})<{ hardBreach?: boolean }>(({ theme, hardBreach }) => {
  const tone = hardBreach ? theme.palette.error.main : theme.palette.warning.main
  return {
    padding: theme.spacing(1.5),
    borderRadius: theme.spacing(0.75),
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    border: `1px solid ${tone}`,
    backgroundColor: alpha(tone, 0.04),
  }
})

const IncidentContent = styled(Box)({
  flex: 1,
})

const InlineRow = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
}))

const IncidentHeaderRow = styled(InlineRow)(({ theme }) => ({
  marginBottom: theme.spacing(0.5),
}))

const MonoCaption = styled(Typography)({
  fontFamily: 'monospace',
})

const IncidentMeta = styled(Typography)(({ theme }) => ({
  fontSize: theme.typography.pxToRem(13),
}))

const IncidentProgress = styled(LinearProgress)(({ theme }) => ({
  marginTop: theme.spacing(1),
  height: theme.spacing(0.5),
  borderRadius: theme.spacing(0.25),
}))

const ResolveButton = styled(Button)(({ theme }) => ({
  textTransform: 'none',
  fontSize: theme.typography.pxToRem(13),
  flexShrink: 0,
}))

const NewPolicyButton = styled(Button)(({ theme }) => ({
  textTransform: 'none',
  fontSize: theme.typography.pxToRem(12),
}))

const BudgetPanelStateRoot = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'tone',
})<{ tone?: 'default' | 'error' }>(({ theme, tone = 'default' }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1.5),
  paddingTop: theme.spacing(2.5),
  paddingBottom: theme.spacing(2.5),
  justifyContent: 'center',
  color: tone === 'error' ? theme.palette.error.main : theme.palette.text.secondary,
}))

const BudgetPanelStateHint = styled(Typography)(({ theme }) => ({
  marginTop: theme.spacing(0.25),
}))

const PolicyRowRoot = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'activePolicy',
})<{ activePolicy?: boolean }>(({ theme, activePolicy = true }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  padding: theme.spacing(1.5),
  borderRadius: theme.spacing(0.75),
  border: `1px solid ${theme.palette.divider}`,
  opacity: activePolicy ? 1 : 0.6,
  transition: theme.transitions.create('background-color', {
    duration: theme.transitions.duration.shorter,
  }),
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
}))

const PolicyContent = styled(Box)({
  flex: 1,
})

const PolicyMetaRow = styled(InlineRow)(({ theme }) => ({
  marginTop: theme.spacing(0.5),
}))

const HardStopCaption = styled(Typography, {
  shouldForwardProp: (prop) => prop !== 'enabled',
})<{ enabled?: boolean }>(({ theme, enabled }) => ({
  color: enabled ? theme.palette.error.main : theme.palette.text.secondary,
}))

const InactiveText = styled(Typography)({
  fontStyle: 'italic',
})

const DeleteIconButton = styled(IconButton)(({ theme }) => ({
  color: theme.palette.error.main,
}))

const FormHint = styled(Typography)(({ theme }) => ({
  display: 'block',
  marginBottom: theme.spacing(2),
}))

const PolicyFormPaper = styled(BudgetSectionPaper)(({ theme }) => ({
  marginTop: theme.spacing(2),
}))

const FormGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: theme.spacing(2),
}))

const FormToggleRow = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(3),
  marginTop: theme.spacing(2),
}))

const FormActions = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: theme.spacing(1.5),
  marginTop: theme.spacing(2),
}))

const TextActionButton = styled(Button)({
  textTransform: 'none',
})

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

  const policiesQ = useQuery({
    queryKey: qk.pentest.campaignBudgetPolicies(orgId),
    queryFn: () => listCampaignBudgetPolicies(orgId!),
    enabled: !!orgId,
  })
  const incidentsQ = useQuery({
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

  const policies = resolvedList(policiesQ.data?.policies, policiesQ, !!orgId)
  const incidents = resolvedList(incidentsQ.data?.incidents, incidentsQ, !!orgId)
  const policiesLoading = queryUnresolved(policiesQ, !!orgId)
  const incidentsLoading = queryUnresolved(incidentsQ, !!orgId)
  const policiesFailed = queryFailed(policiesQ, !!orgId)
  const incidentsFailed = queryFailed(incidentsQ, !!orgId)

  if (!orgId) {
    return (
      <CenterState>
        <Typography variant="body2" color="text.secondary">
          {t('warroom.budgetNoOrg')}
        </Typography>
      </CenterState>
    )
  }

  return (
    <PanelStack>
      {/* Incidents section */}
      <BudgetSectionPaper elevation={0} hasIncidents={incidents.length > 0}>
        <SectionHeader>
          <SectionAlertIcon size={14} hasIncidents={incidents.length > 0} />
          <Typography variant="subtitle2" fontWeight={600}>
            {t('warroom.budgetIncidentsHeader')}
          </Typography>
          <CountChip
            label={incidents.length}
            size="small"
            color={incidents.length > 0 ? 'warning' : 'default'}
          />
        </SectionHeader>
        {incidentsLoading ? (
          <BudgetPanelState
            icon={<SpinningLoader size={18} />}
            title={t('warroom.budgetIncidentsLoading')}
          />
        ) : incidentsFailed ? (
          <BudgetPanelState
            icon={<AlertTriangle size={18} />}
            title={t('warroom.budgetIncidentsLoadFailed')}
            hint={t('warroom.budgetLoadHint')}
            tone="error"
          />
        ) : incidents.length === 0 ? (
          <EmptyStateRoot>
            <SuccessCheckIcon size={18} />
            <Typography variant="body2">{t('warroom.budgetIncidentsEmpty')}</Typography>
          </EmptyStateRoot>
        ) : (
          <ColumnStack>
            {incidents.map(inc => {
              const pct = inc.amountLimit > 0
                ? Math.round((inc.amountObserved / inc.amountLimit) * 100)
                : 0
              const isHard = inc.thresholdType === 'hard'
              const meta = t('warroom.budgetIncidentMeta')
                .replace('{policyId}', inc.policyId.slice(0, 8))
                .replace('{when}', new Date(inc.createdAt).toLocaleString())
              return (
                <IncidentCard
                  key={inc.id}
                  elevation={0}
                  hardBreach={isHard}
                >
                  <IncidentContent>
                    <IncidentHeaderRow>
                      <BreachChip
                        label={isHard ? t('warroom.budgetHardBreach') : t('warroom.budgetSoftWarn')}
                        size="small"
                        color={isHard ? 'error' : 'warning'}
                      />
                      <MonoCaption variant="caption">
                        {inc.amountObserved.toLocaleString()} / {inc.amountLimit.toLocaleString()} · <b>{pct}%</b>
                      </MonoCaption>
                    </IncidentHeaderRow>
                    <IncidentMeta variant="body2" color="text.secondary">
                      {meta}
                    </IncidentMeta>
                    <IncidentProgress
                      variant="determinate"
                      value={Math.min(pct, 100)}
                      color={isHard ? 'error' : 'warning'}
                    />
                  </IncidentContent>
                  <ResolveButton
                    size="small"
                    variant="outlined"
                    startIcon={resolveMut.isPending ? <SpinningLoader size={12} /> : <CheckCircle2 size={12} />}
                    onClick={() => resolveMut.mutate(inc.id)}
                    disabled={resolveMut.isPending}
                  >
                    {t('warroom.budgetResolve')}
                  </ResolveButton>
                </IncidentCard>
              )
            })}
          </ColumnStack>
        )}
      </BudgetSectionPaper>

      {/* Policies section */}
      <BudgetSectionPaper elevation={0}>
        <SectionHeader>
          <Gauge size={14} />
          <Typography variant="subtitle2" fontWeight={600}>
            {t('warroom.budgetPoliciesHeader')}
          </Typography>
          <CountChip label={policies.length} size="small" />
          <HeaderSpacer />
          <NewPolicyButton
            size="small"
            variant="contained"
            startIcon={<Plus size={12} />}
            onClick={() => setEditing({ ...DEFAULT_POLICY })}
            disabled={!!editing || policiesLoading || policiesFailed}
          >
            {t('warroom.budgetNew')}
          </NewPolicyButton>
        </SectionHeader>

        {policiesLoading ? (
          <BudgetPanelState
            icon={<SpinningLoader size={18} />}
            title={t('warroom.budgetPoliciesLoading')}
          />
        ) : policiesFailed ? (
          <BudgetPanelState
            icon={<AlertTriangle size={18} />}
            title={t('warroom.budgetPoliciesLoadFailed')}
            hint={t('warroom.budgetLoadHint')}
            tone="error"
          />
        ) : policies.length === 0 && !editing ? (
          <EmptyStateRootLarge>
            <Gauge size={18} />
            <Typography variant="body2">
              {t('warroom.budgetPoliciesEmpty')}
            </Typography>
          </EmptyStateRootLarge>
        ) : (
          <TightColumnStack>
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
          </TightColumnStack>
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
      </BudgetSectionPaper>
    </PanelStack>
  )
}

function BudgetPanelState({
  icon,
  title,
  hint,
  tone = 'default',
}: {
  icon: ReactNode
  title: string
  hint?: string
  tone?: 'default' | 'error'
}) {
  return (
    <BudgetPanelStateRoot tone={tone}>
      {icon}
      <Box>
        <Typography variant="body2" fontWeight={600}>{title}</Typography>
        {hint && (
          <BudgetPanelStateHint variant="body2" color="text.secondary">
            {hint}
          </BudgetPanelStateHint>
        )}
      </Box>
    </BudgetPanelStateRoot>
  )
}

function PolicyRow({
  policy, onEdit, onDelete,
}: { policy: CampaignBudgetPolicy; onEdit: () => void; onDelete: () => void }) {
  const windowLabel = t('warroom.budgetLastDays')
    .replace('{days}', String(policy.windowDays))
  return (
    <PolicyRowRoot activePolicy={policy.isActive}>
      <PolicyContent>
        <InlineRow>
          <Typography variant="body2" fontWeight={600}>{metricLabel(policy.metric)}</Typography>
          <Typography variant="body2" color="text.secondary">{windowLabel}</Typography>
        </InlineRow>
        <PolicyMetaRow>
          <Typography variant="body2" color="text.secondary">
            {t('warroom.budgetCapPrefix')} <b>{policy.amount.toLocaleString()}</b>
          </Typography>
          <Typography variant="body2" color="text.secondary">·</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('warroom.budgetWarnAt')} <b>{policy.warnPercent}%</b>
          </Typography>
          <Typography variant="body2" color="text.secondary">·</Typography>
          <HardStopCaption variant="caption" enabled={policy.hardStopEnabled}>
            {policy.hardStopEnabled
              ? t('warroom.budgetHardStopOn')
              : t('warroom.budgetMonitorOnly')}
          </HardStopCaption>
          {!policy.isActive && (
            <>
              <Typography variant="body2" color="text.secondary">·</Typography>
              <InactiveText variant="body2" color="text.secondary">
                {t('warroom.budgetInactive')}
              </InactiveText>
            </>
          )}
        </PolicyMetaRow>
      </PolicyContent>
      <IconButton size="small" onClick={onEdit} title={t('warroom.budgetEditPolicy')}>
        <Pencil size={14} />
      </IconButton>
      <DeleteIconButton size="small" onClick={onDelete} title={t('warroom.budgetDelete')}>
        <Trash2 size={14} />
      </DeleteIconButton>
    </PolicyRowRoot>
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
    <PolicyFormPaper elevation={0} accent="primary">
      <FormHint variant="body2" color="text.secondary">
        {t('warroom.budgetFormHint')}
      </FormHint>

      <FormGrid>
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
      </FormGrid>

      <FormToggleRow>
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
      </FormToggleRow>

      <FormActions>
        <TextActionButton size="small" variant="text" startIcon={<X size={12} />} onClick={onCancel} disabled={saving}>
          {t('warroom.budgetCancel')}
        </TextActionButton>
        <TextActionButton
          size="small"
          variant="contained"
          startIcon={saving ? <SpinningLoader size={12} /> : <CheckCircle2 size={12} />}
          onClick={onSave}
          disabled={saving}
        >
          {value.id
            ? t('warroom.budgetSave')
            : t('warroom.budgetCreate')}
        </TextActionButton>
      </FormActions>
    </PolicyFormPaper>
  )
}
