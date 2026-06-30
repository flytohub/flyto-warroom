import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import {
  CheckCircle2,
  GitPullRequest,
  Play,
  RotateCcw,
  ShieldCheck,
  SplitSquareHorizontal,
  Wrench,
} from 'lucide-react'
import { t } from '@lib/i18n'
import { qk } from '@lib/queryKeys'
import { PILLAR_SURFACES } from '@lib/surfaces'
import { useCapabilities } from '@hooks/useCapabilities'
import { useProjectCapabilities } from '@hooks/useProjectCapabilities'
import {
  applyRemediationPlan,
  approveRemediationPlan,
  createRemediationPlan,
  listRemediationArtifacts,
  listRemediationCatalog,
  listRemediationPlans,
  listRemediationRuns,
  listRemediationTargets,
  rollbackRemediationPlan,
  verifyRemediationPlan,
  type RemediationMode,
  type RemediationPlan,
  type RemediationStatus,
  type RemediationSurface,
  type RemediationTargetInput,
} from '@lib/engine'

const surfaces = PILLAR_SURFACES.map(surface => surface.id) as RemediationSurface[]
const modes: RemediationMode[] = ['auto', 'code_pr', 'live_apply', 'agent_task', 'external_workflow', 'manual']

const statusColor = (status: RemediationStatus): 'default' | 'success' | 'warning' | 'error' | 'info' => {
  switch (status) {
    case 'applied':
    case 'verified_fixed':
      return 'success'
    case 'blocked':
    case 'failed':
      return 'error'
    case 'approved':
    case 'applying':
    case 'still_present':
      return 'warning'
    case 'planned':
    case 'open':
      return 'info'
    default:
      return 'default'
  }
}

function labelForStatus(status: string) {
  return t(`remediation.status.${status}`)
}

function labelForMode(mode: string) {
  return t(`remediation.mode.${mode}`)
}

function labelForSurface(surface: string) {
  return t(`remediation.surface.${surface}`)
}

function actionLabel(action: string) {
  return t(`remediation.action.${action}`)
}

function providerReasonLabel(status: string) {
  return t(`remediation.catalog.reason.${status}`)
}

function blockedReasonLabel(reason?: string) {
  const value = (reason ?? '').toLowerCase()
  if (value.includes('verified preview')) return t('remediation.blocked.verifiedPreview')
  if (value.includes('live mutation')) return t('remediation.blocked.liveMutation')
  if (value.includes('agent task')) return t('remediation.blocked.agentTask')
  if (value.includes('external workflow')) return t('remediation.blocked.externalWorkflow')
  if (value.includes('rollback')) return t('remediation.blocked.rollback')
  if (value.includes('manual')) return t('remediation.blocked.manual')
  if (value.includes('approval')) return t('remediation.blocked.approval')
  return t('remediation.blocked.generic')
}

function safeError(error: unknown) {
  if (!error) return ''
  if (error instanceof Error) return error.message
  return String(error)
}

interface RemediationCenterProps {
  orgId?: string
}

export function RemediationCenter({ orgId }: RemediationCenterProps) {
  const qc = useQueryClient()
  const caps = useCapabilities(orgId)
  const projectCaps = useProjectCapabilities(orgId)
  const [surface, setSurface] = useState<RemediationSurface>('container')
  const [mode, setMode] = useState<RemediationMode>('auto')
  const [sourceType, setSourceType] = useState('container_finding')
  const [sourceId, setSourceId] = useState('')
  const [title, setTitle] = useState('')
  const [provider, setProvider] = useState('kubernetes')
  const [selectedTargetId, setSelectedTargetId] = useState<string>('')

  const catalogQ = useQuery({
    queryKey: qk.remediation.catalog(orgId),
    queryFn: () => listRemediationCatalog(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const targetsQ = useQuery({
    queryKey: qk.remediation.targets(orgId),
    queryFn: () => listRemediationTargets(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const plansQ = useQuery({
    queryKey: qk.remediation.plans(orgId),
    queryFn: () => listRemediationPlans(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const runsQ = useQuery({
    queryKey: qk.remediation.runs(orgId),
    queryFn: () => listRemediationRuns(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const artifactsQ = useQuery({
    queryKey: qk.remediation.artifacts(orgId),
    queryFn: () => listRemediationArtifacts(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.remediation.targetsAll(orgId), exact: false })
    qc.invalidateQueries({ queryKey: qk.remediation.plansAll(orgId), exact: false })
    qc.invalidateQueries({ queryKey: qk.remediation.runsAll(orgId), exact: false })
    qc.invalidateQueries({ queryKey: qk.remediation.artifactsAll(orgId), exact: false })
    qc.invalidateQueries({ queryKey: qk.autofix.findings(orgId) })
  }

  const createPlanM = useMutation({
    mutationFn: (payload: RemediationTargetInput) => createRemediationPlan(orgId!, payload),
    onSuccess: invalidate,
  })
  const approveM = useMutation({ mutationFn: (planId: string) => approveRemediationPlan(orgId!, planId), onSuccess: invalidate })
  const applyM = useMutation({ mutationFn: (planId: string) => applyRemediationPlan(orgId!, planId), onSuccess: invalidate })
  const verifyM = useMutation({ mutationFn: (planId: string) => verifyRemediationPlan(orgId!, planId), onSuccess: invalidate })
  const rollbackM = useMutation({ mutationFn: (planId: string) => rollbackRemediationPlan(orgId!, planId), onSuccess: invalidate })

  const payload = useMemo<RemediationTargetInput>(() => ({
    surface,
    source_type: sourceType.trim(),
    source_id: sourceId.trim(),
    provider: provider.trim() || undefined,
    title: title.trim() || undefined,
    requested_mode: mode,
    allow_generic: true,
  }), [mode, provider, sourceId, sourceType, surface, title])

  const selectedTargetPlans = useMemo(() => {
    const plans = plansQ.data?.plans ?? []
    return selectedTargetId ? plans.filter(plan => plan.target_id === selectedTargetId) : plans
  }, [plansQ.data?.plans, selectedTargetId])

  if (!orgId) return null

  const canPlan = caps.canUseAction('remediation:plan') && projectCaps.canUseAction('remediation:plan')
  const canApprove = caps.canUseAction('remediation:approve') && projectCaps.canUseAction('remediation:approve')
  const canApply = caps.canUseAction('remediation:apply') && projectCaps.canUseAction('remediation:apply')
  const canVerify = caps.canUseAction('remediation:verify') && projectCaps.canUseAction('remediation:verify')
  const canRollback = caps.canUseAction('remediation:rollback') && projectCaps.canUseAction('remediation:rollback')
  const accessLoading = !!orgId && ((!caps.ready && !caps.isError) || (!projectCaps.ready && !projectCaps.isError))
  const loading = accessLoading || catalogQ.isLoading || targetsQ.isLoading || plansQ.isLoading || runsQ.isLoading || artifactsQ.isLoading
  const error = catalogQ.error || targetsQ.error || plansQ.error || runsQ.error || artifactsQ.error

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Paper elevation={0} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <Stack spacing={2}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Wrench size={18} />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {t('remediation.center.title')}
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
            <TextField
              select
              size="small"
              label={t('remediation.form.surface')}
              value={surface}
              onChange={(event) => setSurface(event.target.value as RemediationSurface)}
              inputProps={{ 'data-testid': 'remediation-surface' }}
            >
              {surfaces.map(item => (
                <MenuItem key={item} value={item}>{labelForSurface(item)}</MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label={t('remediation.form.sourceType')}
              value={sourceType}
              onChange={(event) => setSourceType(event.target.value)}
              inputProps={{ 'data-testid': 'remediation-source-type' }}
            />
            <TextField
              size="small"
              label={t('remediation.form.sourceId')}
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
              inputProps={{ 'data-testid': 'remediation-source-id' }}
            />
            <TextField
              size="small"
              label={t('remediation.form.provider')}
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              inputProps={{ 'data-testid': 'remediation-provider' }}
            />
            <TextField
              select
              size="small"
              label={t('remediation.form.mode')}
              value={mode}
              onChange={(event) => setMode(event.target.value as RemediationMode)}
              inputProps={{ 'data-testid': 'remediation-mode' }}
            >
              {modes.map(item => (
                <MenuItem key={item} value={item}>{labelForMode(item)}</MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label={t('remediation.form.title')}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              inputProps={{ 'data-testid': 'remediation-title' }}
            />
          </Box>
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.75 }}>
              {t('remediation.form.payloadPreview')}
            </Typography>
            <Box component="pre" sx={{ m: 0, fontSize: 12, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(payload, null, 2)}
            </Box>
          </Paper>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Tooltip title={!canPlan ? t('remediation.denied.plan') : ''}>
              <span>
                <Button
                  data-testid="remediation-create-plan"
                  variant="contained"
                  disabled={!canPlan || createPlanM.isPending || !payload.source_type || !payload.source_id}
                  startIcon={createPlanM.isPending ? <CircularProgress size={14} /> : <SplitSquareHorizontal size={14} />}
                  onClick={() => createPlanM.mutate(payload)}
                >
                  {t('remediation.action.createPlan')}
                </Button>
              </span>
            </Tooltip>
            <Button variant="outlined" onClick={invalidate} startIcon={<RotateCcw size={14} />}>
              {t('remediation.action.refresh')}
            </Button>
          </Box>
          {createPlanM.isError && (
            <Alert severity="error">{t('remediation.error.createPlan')} {safeError(createPlanM.error)}</Alert>
          )}
        </Stack>
      </Paper>

      {loading && (
        <Alert icon={<CircularProgress size={16} />} severity="info">
          {t('remediation.state.loading')}
        </Alert>
      )}
      {error && (
        <Alert severity="error">
          {t('remediation.state.error')} {safeError(error)}
        </Alert>
      )}

      <Paper elevation={0} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
          {t('remediation.catalog.title')}
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' }, gap: 1 }}>
          {(catalogQ.data?.providers ?? []).map(providerCap => (
            <Paper key={providerCap.provider} variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  {providerCap.provider}
                </Typography>
                <Chip size="small" label={providerCap.status} />
              </Box>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
                {providerCap.modes.map(item => <Chip key={item} size="small" label={labelForMode(item)} variant="outlined" />)}
              </Box>
              {providerCap.reason && (
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
                  {providerReasonLabel(providerCap.status)}
                </Typography>
              )}
            </Paper>
          ))}
        </Box>
      </Paper>

      <Paper elevation={0} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
          {t('remediation.targets.title')}
        </Typography>
        {(targetsQ.data?.targets ?? []).length === 0 ? (
          <Typography variant="body2" color="text.secondary">{t('remediation.targets.empty')}</Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 1 }}>
            {(targetsQ.data?.targets ?? []).map(target => (
              <Paper key={target.id} variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{target.title || target.source_id}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {labelForSurface(target.surface)} · {target.source_type} · {target.provider || target.source_id}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Chip size="small" color={statusColor(target.status)} label={labelForStatus(target.status)} />
                    <Button size="small" variant={selectedTargetId === target.id ? 'contained' : 'outlined'} onClick={() => setSelectedTargetId(v => v === target.id ? '' : target.id)}>
                      {t('remediation.action.filterTarget')}
                    </Button>
                  </Box>
                </Box>
              </Paper>
            ))}
          </Box>
        )}
      </Paper>

      <Paper elevation={0} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
          {t('remediation.plans.title')}
        </Typography>
        {selectedTargetPlans.length === 0 ? (
          <Typography variant="body2" color="text.secondary">{t('remediation.plans.empty')}</Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 1 }}>
            {selectedTargetPlans.map(plan => (
              <PlanRow
                key={plan.id}
                plan={plan}
                canApprove={canApprove}
                canApply={canApply}
                canVerify={canVerify}
                canRollback={canRollback}
                approvePending={approveM.isPending}
                applyPending={applyM.isPending}
                verifyPending={verifyM.isPending}
                rollbackPending={rollbackM.isPending}
                onApprove={() => approveM.mutate(plan.id)}
                onApply={() => applyM.mutate(plan.id)}
                onVerify={() => verifyM.mutate(plan.id)}
                onRollback={() => rollbackM.mutate(plan.id)}
              />
            ))}
          </Box>
        )}
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
        <Paper elevation={0} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
            {t('remediation.runs.title')}
          </Typography>
          {(runsQ.data?.runs ?? []).length === 0 ? (
            <Typography variant="body2" color="text.secondary">{t('remediation.runs.empty')}</Typography>
          ) : (
            <Stack spacing={1} divider={<Divider flexItem />}>
              {(runsQ.data?.runs ?? []).map(run => (
                <Box key={run.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{actionLabel(run.action)}</Typography>
                    <Typography variant="caption" color="text.secondary">{run.id}</Typography>
                  </Box>
                  <Chip size="small" color={statusColor(run.status)} label={labelForStatus(run.status)} />
                </Box>
              ))}
            </Stack>
          )}
        </Paper>

        <Paper elevation={0} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
            {t('remediation.artifacts.title')}
          </Typography>
          {(artifactsQ.data?.artifacts ?? []).length === 0 ? (
            <Typography variant="body2" color="text.secondary">{t('remediation.artifacts.empty')}</Typography>
          ) : (
            <Stack spacing={1} divider={<Divider flexItem />}>
              {(artifactsQ.data?.artifacts ?? []).map(artifact => (
                <Box key={artifact.id}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{artifact.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{artifact.kind} · {artifact.cas_hash || artifact.id}</Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Paper>
      </Box>
    </Box>
  )
}

interface PlanRowProps {
  plan: RemediationPlan
  canApprove: boolean
  canApply: boolean
  canVerify: boolean
  canRollback: boolean
  approvePending: boolean
  applyPending: boolean
  verifyPending: boolean
  rollbackPending: boolean
  onApprove: () => void
  onApply: () => void
  onVerify: () => void
  onRollback: () => void
}

function PlanRow({
  plan,
  canApprove,
  canApply,
  canVerify,
  canRollback,
  approvePending,
  applyPending,
  verifyPending,
  rollbackPending,
  onApprove,
  onApply,
  onVerify,
  onRollback,
}: PlanRowProps) {
  const approveDisabled = !canApprove || !plan.apply_supported || plan.status === 'approved' || plan.status === 'applied'
  const applyDisabled = !canApply || !plan.apply_supported || plan.status !== 'approved'
  const verifyDisabled = !canVerify || !plan.verify_supported
  const rollbackDisabled = !canRollback || !plan.rollback_supported

  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{plan.summary}</Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.75 }}>
            <Chip size="small" label={labelForMode(plan.mode)} icon={<GitPullRequest size={12} />} />
            <Chip size="small" color={statusColor(plan.status)} label={labelForStatus(plan.status)} />
            <Chip size="small" variant="outlined" label={plan.provider || plan.surface} />
          </Box>
          {plan.blocked_reason && (
            <Typography variant="caption" sx={{ display: 'block', color: 'error.main', mt: 0.75 }}>
              {blockedReasonLabel(plan.blocked_reason)}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Tooltip title={!canApprove ? t('remediation.denied.approve') : ''}>
            <span>
              <Button
                data-testid={`remediation-approve-${plan.id}`}
                size="small"
                variant="outlined"
                disabled={approveDisabled || approvePending}
                startIcon={approvePending ? <CircularProgress size={13} /> : <ShieldCheck size={13} />}
                onClick={onApprove}
              >
                {t('remediation.action.approve')}
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={!canApply ? t('remediation.denied.apply') : ''}>
            <span>
              <Button
                data-testid={`remediation-apply-${plan.id}`}
                size="small"
                variant="contained"
                disabled={applyDisabled || applyPending}
                startIcon={applyPending ? <CircularProgress size={13} /> : <Play size={13} />}
                onClick={onApply}
              >
                {t('remediation.action.apply')}
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={!canVerify ? t('remediation.denied.verify') : ''}>
            <span>
              <Button
                data-testid={`remediation-verify-${plan.id}`}
                size="small"
                variant="outlined"
                disabled={verifyDisabled || verifyPending}
                startIcon={verifyPending ? <CircularProgress size={13} /> : <CheckCircle2 size={13} />}
                onClick={onVerify}
              >
                {t('remediation.action.verify')}
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={!canRollback ? t('remediation.denied.rollback') : ''}>
            <span>
              <Button
                data-testid={`remediation-rollback-${plan.id}`}
                size="small"
                variant="outlined"
                disabled={rollbackDisabled || rollbackPending}
                startIcon={rollbackPending ? <CircularProgress size={13} /> : <RotateCcw size={13} />}
                onClick={onRollback}
              >
                {t('remediation.action.rollback')}
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Box>
    </Paper>
  )
}
