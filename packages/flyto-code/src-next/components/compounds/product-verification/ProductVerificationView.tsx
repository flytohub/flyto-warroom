import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { alpha, type Theme } from '@mui/material/styles'
import { Activity, AlertTriangle, Clock, FileJson, GitBranch, Image, Network, Play, ScrollText, ShieldCheck } from 'lucide-react'
import { FlytoCodeBlock } from '@atoms/FlytoCodeBlock'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { FlytoSurface } from '@atoms/FlytoSurface'
import { TabBar } from '@atoms/TabBar'
import { InlineErrorNotice } from '@atoms/InlineErrorNotice'
import { QueryError } from '@atoms/QueryError'
import { useOrg } from '@hooks/useOrg'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n';
import { useExperience } from '@/contexts/ExperienceContext'
import {
  createWarroomVerificationRun,
  getEventScope,
  getWarroomVerificationEvidence,
  listProductVerificationScanner,
  listWarroomVerificationRuns,
  patchProductVerificationScanner,
  runProductVerificationScannerNow,
  type SystemScanner,
  type WarroomAutomationTestModel,
  type WarroomArtifactCompleteness,
  type WarroomCampaignExecution,
  type WarroomEvidenceArtifact,
  type WarroomEvidenceFinding,
  type WarroomEvidencePack,
  type WarroomEvidenceScoreBreakdownItem,
  type WarroomVerificationEvidenceResponse,
} from '@lib/engine'
import { flytoTextStyles } from '@/styles/visualSystem'

const statusColor: Record<string, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
  dispatched: 'primary',
  running: 'primary',
  complete: 'success',
  pass: 'success',
  passed: 'success',
  failed: 'error',
  fail: 'error',
  blocked: 'error',
  planned: 'warning',
}

type VerificationTab =
  | 'overview'
  | 'testing'
  | 'discovery'
  | 'intent'
  | 'yaml'
  | 'replay'
  | 'screenshots'
  | 'network'
  | 'contradictions'
  | 'ghost'
  | 'rbac'
  | 'scheduler'
  | 'evidence'

const deterministicRuleOrder = [
  'false_empty',
  'false_locked',
  'hidden_error',
  'ghost_api_type_a',
  'ghost_api_type_b',
  'ghost_api_type_c',
  'state_contradiction',
  'rbac_fail_open',
] as const

type EvidenceGateSummary = {
  verdict?: string
  score?: number
  scoreBreakdown: Record<string, WarroomEvidenceScoreBreakdownItem>
  artifactCompleteness?: WarroomArtifactCompleteness
  blockers: string[]
  hasGateMetadata: boolean
}

type DeterministicRuleSummary = {
  total: number
  rows: Array<{
    code: string
    label: string
    count: number
    status: string
  }>
}

type VerificationMatrixStatus = 'passed' | 'captured' | 'blocked' | 'missing' | 'pending'

type VerificationMatrixRowModel = {
  id: string
  title: string
  detail: string
  status: VerificationMatrixStatus
  evidence: string
  owner: string
}

function defaultTarget() {
  return ''
}

function formatDate(value?: string) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function estimateNextRun(scanner: SystemScanner) {
  if (!scanner.last_run_end) return 'after first scheduled tick'
  const intervalMs = parseGoDurationMs(scanner.interval)
  if (!intervalMs) return 'unknown'
  const last = new Date(scanner.last_run_end)
  if (Number.isNaN(last.getTime())) return 'unknown'
  return formatDate(new Date(last.getTime() + intervalMs).toISOString()) || 'unknown'
}

function parseGoDurationMs(value: string) {
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!match) return 0
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2] ?? 0)
  const seconds = Number(match[3] ?? 0)
  return ((hours * 60 + minutes) * 60 + seconds) * 1000
}

function compactScope(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(', ')
}

function targetHost(value?: string | null) {
  if (!value) return ''
  try {
    return new URL(value).host
  } catch {
    return value
  }
}

export function ProductVerificationView() {
  const { org } = useOrg()
  const qc = useQueryClient()
  const [targetUrl, setTargetUrl] = useState(() => defaultTarget())
  const [repoId, setRepoId] = useState('')
  const [dryRun, setDryRun] = useState(true)
  const [tab, setTab] = useState<VerificationTab>('overview')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  const runsQ = useQuery({
    queryKey: qk.warroomVerification.runs(org?.id),
    queryFn: () => listWarroomVerificationRuns(org!.id),
    enabled: !!org?.id,
    staleTime: 15_000,
  })
  const scopeQ = useQuery({
    queryKey: qk.platform.eventScope(),
    queryFn: getEventScope,
    staleTime: 5 * 60_000,
  })
  const isPlatformAdmin = !!scopeQ.data?.is_platform_admin
  const scannerQ = useQuery({
    queryKey: qk.platform.systemScanners(),
    queryFn: listProductVerificationScanner,
    enabled: isPlatformAdmin,
    staleTime: 5000,
  })

  const createRun = useMutation({
    mutationFn: () => createWarroomVerificationRun(org!.id, {
      target_url: targetUrl.trim(),
      repo_id: repoId.trim() || undefined,
      dry_run: dryRun,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.warroomVerification.runs(org?.id) })
    },
  })
  const patchScanner = useMutation({
    mutationFn: (body: Partial<{ enabled: boolean; interval: string; notes: string }>) => patchProductVerificationScanner(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.platform.systemScanners() }),
  })
  const runScannerNow = useMutation({
    mutationFn: runProductVerificationScannerNow,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.platform.systemScanners() })
      qc.invalidateQueries({ queryKey: qk.warroomVerification.runs(org?.id) })
    },
  })

  const runs = useMemo(() => runsQ.data?.runs ?? [], [runsQ.data?.runs])
  const latest = runs[0]
  const selectedRun = useMemo(
    () => (selectedRunId ? runs.find((run) => run.id === selectedRunId) ?? latest : latest),
    [latest, runs, selectedRunId],
  )
  const evidenceQ = useQuery({
    queryKey: qk.warroomVerification.evidence(org?.id, selectedRun?.id),
    queryFn: () => getWarroomVerificationEvidence(org!.id, selectedRun!.id),
    enabled: !!org?.id && !!selectedRun?.id && !!selectedRun?.runnerExecutionId,
    staleTime: 5000,
  })
  const canRun = !!org?.id && targetUrl.trim().length > 0 && !createRun.isPending
  const contract = runsQ.data?.graph_contract ?? createRun.data?.graph_contract ?? 'warroom.product_verification.v1'
  const evidencePack = evidenceQ.data?.evidencePack ?? null
  const evidenceGate = useMemo(() => normalizeEvidenceGate(evidenceQ.data, evidencePack), [evidenceQ.data, evidencePack])
  const evidenceFindings = useMemo(() => normalizeEvidenceFindings(evidencePack), [evidencePack])
  const stateContradictions = useMemo(
    () => evidenceFindings.filter((finding) => (finding.code ?? finding.type) === 'state_contradiction'),
    [evidenceFindings],
  )
  const deterministicRuleSummary = useMemo(
    () => summarizeDeterministicRules(evidencePack),
    [evidencePack],
  )
  const screenshotArtifacts = useMemo(
    () => (evidenceQ.data?.artifacts ?? []).filter((artifact) => artifact.kind === 'screenshot' || artifact.mimeType.startsWith('image/')),
    [evidenceQ.data?.artifacts],
  )

  const summary = useMemo(() => summarizeRuns(runs), [runs])
  const productScanner = scannerQ.data?.scanner ?? null
  const primaryTabValue: VerificationTab = tab === 'overview' || tab === 'testing' || tab === 'scheduler' ? tab : 'evidence'
  const primaryTabItems = useMemo(() => [
    {
      value: 'overview',
      label: t('productVerification.tabOverview'),
      icon: <Activity size={14} />,
      count: runs.length,
    },
    {
      value: 'testing',
      label: t('productVerification.tabTestingMatrix'),
      icon: <ShieldCheck size={14} />,
      count: evidencePack ? buildVerificationMatrix(selectedRun, evidencePack, evidenceQ.data?.artifacts ?? [], evidenceGate).filter((row) => row.status === 'blocked' || row.status === 'missing').length : undefined,
    },
    {
      value: 'evidence',
      label: t('productVerification.tabEvidencePack'),
      icon: <FileJson size={14} />,
      count: summary.withEvidence,
    },
    {
      value: 'scheduler',
      label: t('productVerification.tabSchedulerRuns'),
      icon: <Clock size={14} />,
      count: productScanner?.currently_running ? 1 : undefined,
    },
  ], [evidencePack, productScanner?.currently_running, runs.length, screenshotArtifacts.length, stateContradictions.length, summary.withEvidence])
  const evidenceTabItems = useMemo(() => [
    {
      value: 'evidence',
      label: t('productVerification.tabEvidencePack'),
      icon: <FileJson size={14} />,
      count: summary.withEvidence,
    },
    {
      value: 'discovery',
      label: t('productVerification.tabDiscovery'),
      icon: <Activity size={14} />,
      count: evidencePack?.site_graph?.pages?.length,
    },
    {
      value: 'intent',
      label: t('productVerification.tabIntentGraph'),
      icon: <GitBranch size={14} />,
      count: evidencePack?.site_graph?.intents?.length ?? evidencePack?.automation_test_model?.intent_graph?.count,
    },
    {
      value: 'yaml',
      label: t('productVerification.tabYamlScenarios'),
      icon: <ScrollText size={14} />,
      count: evidencePack?.scenarios?.steps?.length,
    },
    {
      value: 'replay',
      label: t('productVerification.tabReplayTimeline'),
      icon: <Play size={14} />,
      count: evidencePack?.run?.results?.length ?? evidencePack?.automation_test_model?.replay?.steps?.length,
    },
    {
      value: 'screenshots',
      label: t('productVerification.tabScreenshots'),
      icon: <Image size={14} />,
      count: screenshotArtifacts.length,
    },
    {
      value: 'network',
      label: t('productVerification.tabNetworkApi'),
      icon: <Network size={14} />,
      count: evidencePack?.site_graph?.apis?.length,
    },
    {
      value: 'contradictions',
      label: t('productVerification.tabStateContradictions'),
      icon: <AlertTriangle size={14} />,
      count: stateContradictions.length,
    },
    {
      value: 'ghost',
      label: t('productVerification.tabGhostApis'),
      icon: <AlertTriangle size={14} />,
      count: ghostApiCount(evidencePack),
    },
    {
      value: 'rbac',
      label: t('productVerification.tabRbacEntitlement'),
      icon: <ShieldCheck size={14} />,
    },
  ], [evidencePack, screenshotArtifacts.length, stateContradictions.length, summary.withEvidence])

  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ flexShrink: 0, px: { xs: 2, md: 4 }, pt: { xs: 2, md: 2.5 } }}>
        <FlytoPageHeader
          title={t('productVerification.title')}
          subtitle={t('productVerification.subtitle')}
          bottomGap={4}
        />
      </Box>

      <Box sx={{ flexShrink: 0, px: { xs: 2, md: 4 }, pb: 1 }}>
        <VerificationCommandPanel
          targetUrl={targetUrl}
          repoId={repoId}
          dryRun={dryRun}
          canRun={canRun}
          createPending={createRun.isPending}
          createError={createRun.isError ? createRun.error : null}
          onTargetUrlChange={setTargetUrl}
          onRepoIdChange={setRepoId}
          onDryRunChange={setDryRun}
          onRun={() => createRun.mutate()}
        />
      </Box>

      <Box sx={{ flexShrink: 0, px: { xs: 2, md: 4 }, pb: 0.75 }}>
        <TabBar
          value={primaryTabValue}
          onChange={(value) => setTab(value as VerificationTab)}
          items={primaryTabItems}
          noDivider
          sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1, px: 1 }}
        />
      </Box>

      {primaryTabValue === 'evidence' && (
        <Box sx={{ flexShrink: 0, px: { xs: 2, md: 4 }, pb: 0.75 }}>
          <TabBar
            value={tab}
            onChange={(value) => setTab(value as VerificationTab)}
            items={evidenceTabItems}
            noDivider
            sx={{
              minHeight: 36,
              bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.13 : 0.06),
              border: 1,
              borderColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.28 : 0.18),
              borderRadius: 1,
              px: 1,
              '& .MuiTab-root': { minHeight: 36 },
            }}
          />
        </Box>
      )}

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', px: { xs: 2, md: 4 }, pb: 3 }}>
        {runsQ.isLoading && <LinearProgress sx={{ mb: 1 }} />}
        {runsQ.isError && (
          <Box sx={{ mb: 1 }}>
            <QueryError compact error={runsQ.error} onRetry={() => { void runsQ.refetch() }} label={t('productVerification.title')} />
          </Box>
        )}
        {!org?.id && (
          <Alert severity="info" sx={{ mb: 1 }}>
            {t('productVerification.orgLoading')}
          </Alert>
        )}

        <ScrollTabPanel active={tab === 'overview'} value="overview">
          <ProductVerificationOverview
            runs={runs}
            selectedRun={selectedRun}
            contract={contract}
            evidenceGate={evidenceGate}
            evidencePack={evidencePack}
            artifacts={evidenceQ.data?.artifacts ?? []}
            inputTargetUrl={targetUrl}
            inputRepoId={repoId}
            onSelectRun={(run) => {
              setSelectedRunId(run.id)
              setTab('evidence')
            }}
          />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'testing'} value="testing">
          <AutomationTestPanel
            run={selectedRun}
            pack={evidencePack}
            artifacts={evidenceQ.data?.artifacts ?? []}
            gate={evidenceGate}
          />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'scheduler'} value="scheduler">
          <ProductVerificationSchedulerPanel
            isPlatformAdmin={isPlatformAdmin}
            scopeLoading={scopeQ.isLoading}
            scanner={productScanner}
            loading={scannerQ.isLoading}
            error={scannerQ.error as Error | null}
            patchPending={patchScanner.isPending}
            runPending={runScannerNow.isPending}
            latestEvidenceRun={runs.find((run) => !!run.evidenceSig) ?? null}
            onToggle={(enabled) => patchScanner.mutate({ enabled })}
            onInterval={(interval) => patchScanner.mutate({ interval })}
            onRunNow={() => runScannerNow.mutate()}
          />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'evidence'} value="evidence">
          <ProductVerificationEvidencePanel
            selectedRun={selectedRun}
            evidencePack={evidencePack}
            artifacts={evidenceQ.data?.artifacts ?? []}
            evidenceSig={evidenceQ.data?.evidenceSig ?? undefined}
            gate={evidenceGate}
            findings={evidenceFindings}
            loading={evidenceQ.isLoading}
            error={evidenceQ.isError ? evidenceQ.error : null}
            success={evidenceQ.isSuccess}
            onRetry={() => { void evidenceQ.refetch() }}
          />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'yaml'} value="yaml">
          <YamlScenariosPanel run={selectedRun} pack={evidencePack} />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'replay'} value="replay">
          <ReplayTimelinePanel
            run={selectedRun}
            pack={evidencePack}
            artifacts={evidenceQ.data?.artifacts ?? []}
            gate={evidenceGate}
          />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'screenshots'} value="screenshots">
          <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
            <SectionHeader icon={<Image size={16} />} title={t('productVerification.screenshots')} />
            {screenshotArtifacts.length === 0 ? (
              <Alert severity="info" sx={{ m: 2 }}>
                {t('productVerification.noScreenshots')}
              </Alert>
            ) : (
              <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
                {screenshotArtifacts.map((artifact) => (
                  <EvidenceImage key={artifact.id} artifact={artifact} />
                ))}
              </Box>
            )}
          </Paper>
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'discovery'} value="discovery">
          <GraphEvidencePanel pack={evidencePack} artifacts={evidenceQ.data?.artifacts ?? []} mode="discovery" />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'intent'} value="intent">
          <GraphEvidencePanel pack={evidencePack} artifacts={evidenceQ.data?.artifacts ?? []} mode="intent" />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'network'} value="network">
          <GraphEvidencePanel pack={evidencePack} artifacts={evidenceQ.data?.artifacts ?? []} mode="network" />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'contradictions'} value="contradictions">
          <DeterministicRulesPanel summary={deterministicRuleSummary} findings={stateContradictions} />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'ghost'} value="ghost">
          <GhostApisPanel pack={evidencePack} artifacts={evidenceQ.data?.artifacts ?? []} gate={evidenceGate} />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'rbac'} value="rbac">
          <RbacEntitlementPanel run={selectedRun} pack={evidencePack} artifacts={evidenceQ.data?.artifacts ?? []} gate={evidenceGate} />
        </ScrollTabPanel>
      </Box>
    </Box>
  )
}

function VerificationCommandPanel({
  targetUrl,
  repoId,
  dryRun,
  canRun,
  createPending,
  createError,
  onTargetUrlChange,
  onRepoIdChange,
  onDryRunChange,
  onRun,
}: {
  targetUrl: string
  repoId: string
  dryRun: boolean
  canRun: boolean
  createPending: boolean
  createError?: unknown
  onTargetUrlChange: (value: string) => void
  onRepoIdChange: (value: string) => void
  onDryRunChange: (value: boolean) => void
  onRun: () => void
}) {
  const errorMessage = createError instanceof Error ? createError.message : createError ? String(createError) : ''

  return (
    <FlytoSurface
      tone="tech"
      density="compact"
      sx={{
        position: 'relative',
        borderColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.34 : 0.22),
        bgcolor: (theme) =>
          theme.palette.mode === 'dark'
            ? alpha(theme.palette.background.paper, 0.72)
            : alpha(theme.palette.background.paper, 0.96),
        boxShadow: (theme) => `0 10px 24px ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.24 : 0.06)}`,
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: (theme) => (theme.palette.mode === 'dark' ? 0.36 : 0.42),
          backgroundImage: (theme) =>
            `linear-gradient(90deg, ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.055)} 0%, transparent 36%, ${alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.1 : 0.045)} 100%), linear-gradient(90deg, ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.08 : 0.055)} 1px, transparent 1px)`,
          backgroundSize: '100% 100%, 28px 100%',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 2,
          background: (theme) =>
            `linear-gradient(90deg, ${alpha(theme.palette.primary.main, 0.68)}, ${alpha(theme.palette.info.main, 0.48)}, transparent)`,
        },
      }}
      bodySx={{
        position: 'relative',
        zIndex: 1,
        p: { xs: 1, md: 1.1 },
        '& .MuiInputBase-root': {
          height: 40,
          bgcolor: (theme) => (theme.palette.mode === 'dark' ? alpha(theme.palette.background.paper, 0.78) : theme.palette.background.paper),
          boxShadow: (theme) => `inset 0 0 0 1px ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.14 : 0.1)}`,
        },
        '& .MuiOutlinedInput-notchedOutline': {
          borderColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.28 : 0.18),
        },
        '& .Mui-focused .MuiOutlinedInput-notchedOutline': {
          borderColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.62 : 0.42),
        },
        '& .MuiButton-root': {
          height: 40,
          borderRadius: 1,
        },
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(150px, 0.55fr) minmax(260px, 1.35fr) minmax(180px, 0.85fr) auto auto' },
          gap: 1,
          alignItems: 'center',
          minWidth: 0,
        }}
      >
        <Stack direction="row" spacing={0.8} alignItems="center" sx={{ minWidth: 0 }}>
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'info.main',
              bgcolor: (theme) => alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.13 : 0.07),
              border: 1,
              borderColor: (theme) => alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.32 : 0.22),
              flexShrink: 0,
            }}
          >
            <Play size={16} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={950} noWrap>
              {t('productVerification.commandTitle')}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {t('productVerification.commandSubtitle')}
            </Typography>
          </Box>
        </Stack>
        <TextField
          label={t('productVerification.targetUrl')}
          placeholder={t('productVerification.targetUrlPlaceholder')}
          value={targetUrl}
          onChange={(e) => onTargetUrlChange(e.target.value)}
          size="small"
          sx={{ minWidth: 0 }}
        />
        <TextField
          label={t('productVerification.repoId')}
          placeholder={t('productVerification.repoIdPlaceholder')}
          value={repoId}
          onChange={(e) => onRepoIdChange(e.target.value)}
          size="small"
          sx={{ minWidth: 0 }}
        />
        <FormControlLabel
          control={<Checkbox checked={dryRun} onChange={(e) => onDryRunChange(e.target.checked)} size="small" />}
          label={t('productVerification.dryRun')}
          sx={{ whiteSpace: 'nowrap', mx: 0 }}
        />
        <Button
          variant="contained"
          startIcon={<Play size={18} />}
          disabled={!canRun}
          onClick={onRun}
          sx={{
            minWidth: 124,
            flexShrink: 0,
            fontWeight: 900,
            '&:not(.Mui-disabled)': {
              background: (theme) => `linear-gradient(90deg, ${theme.palette.primary.main}, ${alpha(theme.palette.info.main, 0.86)})`,
              boxShadow: (theme) => `0 10px 20px ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.28 : 0.18)}`,
            },
          }}
        >
          {createPending ? t('common.running') : t('productVerification.run')}
        </Button>
      </Box>
      {createPending && <LinearProgress sx={{ mt: 1 }} />}
      {errorMessage && (
        <Box sx={{ mt: 1 }}>
          <InlineErrorNotice error={errorMessage} />
        </Box>
      )}
    </FlytoSurface>
  )
}

function ProductVerificationOverview({
  runs,
  selectedRun,
  contract,
  evidenceGate,
  evidencePack,
  artifacts,
  inputTargetUrl,
  inputRepoId,
  onSelectRun,
}: {
  runs: WarroomCampaignExecution[]
  selectedRun?: WarroomCampaignExecution
  contract: string
  evidenceGate: EvidenceGateSummary
  evidencePack: WarroomEvidencePack | null
  artifacts: WarroomEvidenceArtifact[]
  inputTargetUrl: string
  inputRepoId: string
  onSelectRun: (run: WarroomCampaignExecution) => void
}) {
  const activeTarget = selectedRun?.targetUrl || inputTargetUrl.trim()
  const activeRepo = selectedRun?.repoId || inputRepoId.trim()
  const verdict = evidenceGate.verdict ?? selectedRun?.verdict ?? selectedRun?.status ?? t('productVerification.infoNone')
  const artifactCompleteness = evidenceGate.artifactCompleteness
  const artifactTotal = artifactCompleteness?.required?.length ?? 3
  const artifactPresent = artifactCompleteness?.present?.length ?? artifacts.length
  const matrixRows = buildVerificationMatrix(selectedRun, evidencePack, artifacts, evidenceGate)
  const blockingRows = matrixRows.filter((row) => row.status === 'blocked' || row.status === 'missing')
  const hasTarget = Boolean(activeTarget)
  const hasRunner = Boolean(selectedRun?.runnerExecutionId)
  const hasEvidence = Boolean(selectedRun?.evidenceSig || evidencePack || artifactPresent > 0)
  const hasBlockers = hasTarget && (evidenceGate.blockers.length > 0 || blockingRows.length > 0)
  const decisionTone = !hasTarget
    ? 'primary.main'
    : hasBlockers
      ? 'warning.main'
      : hasEvidence
        ? 'success.main'
        : 'info.main'
  const decisionTitle = !hasTarget
    ? t('productVerification.commandTitle')
    : hasBlockers
      ? t('productVerification.overviewResolveBlockers')
      : hasEvidence
        ? t('productVerification.overviewReviewEvidence')
        : t('productVerification.overviewWaitingRunner')
  const decisionBody = !hasTarget
    ? t('productVerification.commandSubtitle')
    : hasBlockers
      ? t('productVerification.overviewResolveBlockersDetail')
      : hasEvidence
        ? t('productVerification.overviewReviewEvidenceDetail')
        : t('productVerification.evidenceWaitingForRunner')
  const selectedTitle = targetHost(activeTarget) || t('productVerification.infoNeedsTarget')

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        minHeight: 0,
        flexShrink: 0,
        width: '100%',
        pb: 1,
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          position: 'relative',
          flexShrink: 0,
          borderRadius: 1,
          overflow: 'hidden',
          borderColor: (theme) => alpha(resolveToneColor(theme, decisionTone), theme.palette.mode === 'dark' ? 0.38 : 0.28),
          bgcolor: (theme) =>
            theme.palette.mode === 'dark'
              ? alpha(theme.palette.background.paper, 0.92)
              : alpha(theme.palette.background.paper, 0.985),
          boxShadow: (theme) => `0 16px 34px ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.24 : 0.06)}`,
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: (theme) => (theme.palette.mode === 'dark' ? 0.3 : 0.34),
            backgroundImage: (theme) =>
              `linear-gradient(135deg, ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.055)}, transparent 38%, ${alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.1 : 0.045)} 74%, transparent), linear-gradient(${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.08 : 0.055)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.07 : 0.045)} 1px, transparent 1px)`,
            backgroundSize: '100% 100%, 32px 32px, 32px 32px',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: (theme) =>
              `linear-gradient(90deg, ${alpha(theme.palette.primary.main, 0.72)}, ${alpha(theme.palette.info.main, 0.62)}, ${alpha(theme.palette.success.main, 0.5)})`,
          },
        }}
      >
        <TechCorners tone={decisionTone} />
        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            p: { xs: 2, md: 2.25 },
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(360px, 0.72fr)' },
            gap: 2.25,
            alignItems: 'center',
          }}
        >
          <Box
            sx={{
              minWidth: 0,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '104px minmax(0, 1fr)' },
              gap: 1.6,
              alignItems: 'center',
            }}
          >
            <VerificationBeacon value={hasTarget ? formatGateScore(evidenceGate.score) : 'PV'} tone={decisionTone} active={hasTarget} />
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.2 }}>
                <Chip size="small" color={statusColor[verdict] ?? 'primary'} label={verdict} sx={{ fontWeight: 900 }} />
                <Chip size="small" variant="outlined" label={contract} sx={{ fontWeight: 850, bgcolor: 'background.paper' }} />
                <Chip
                  size="small"
                  variant="outlined"
                  label={activeRepo || t('productVerification.infoRepoOptional')}
                  sx={{ fontWeight: 850, maxWidth: 260, bgcolor: 'background.paper' }}
                />
              </Stack>
              <Typography
                variant="h5"
                fontWeight={950}
                noWrap
                title={selectedTitle}
                sx={{ lineHeight: 1.04, letterSpacing: 0 }}
              >
                {selectedTitle}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap title={activeTarget || undefined} sx={{ mt: 0.75 }}>
                {activeTarget || t('productVerification.commandSubtitle')}
              </Typography>

              <Box
                sx={{
                  mt: 1.6,
                  height: 8,
                  borderRadius: 999,
                  overflow: 'hidden',
                  bgcolor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.18 : 0.08),
                }}
              >
                <Box
                  sx={{
                    width: hasTarget ? (hasEvidence ? '92%' : '52%') : '18%',
                    height: '100%',
                    borderRadius: 999,
                    background: (theme) =>
                      `linear-gradient(90deg, ${theme.palette.primary.main}, ${hasEvidence ? theme.palette.success.main : theme.palette.info.main})`,
                  }}
                />
              </Box>

              <VerificationPipeline
                targetActive={hasTarget}
                targetValue={selectedTitle}
                evidenceActive={hasEvidence}
                runnerActive={hasRunner}
                artifactValue={`${artifactPresent}/${artifactTotal}`}
              />

              <Box sx={{ mt: 1.35, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 0.85 }}>
                <DecisionMetric
                  icon={<ShieldCheck size={16} />}
                  label={t('productVerification.gateScore')}
                  value={formatGateScore(evidenceGate.score)}
                  tone={decisionTone}
                />
                <DecisionMetric
                  icon={<FileJson size={16} />}
                  label={t('productVerification.matrixEvidence')}
                  value={`${artifactPresent}/${artifactTotal}`}
                  tone={artifactCompleteness?.complete ? 'success.main' : artifactPresent > 0 ? 'warning.main' : 'text.secondary'}
                />
                <DecisionMetric
                  icon={<Activity size={16} />}
                  label={t('productVerification.runnerExecution')}
                  value={hasRunner ? t('productVerification.infoRunnerLinked') : t('productVerification.infoNoRunner')}
                  tone={hasRunner ? 'success.main' : 'text.secondary'}
                />
              </Box>
            </Box>
          </Box>

          <Box
            sx={{
              minWidth: 0,
              border: 1,
              borderColor: (theme) => alpha(resolveToneColor(theme, decisionTone), theme.palette.mode === 'dark' ? 0.55 : 0.42),
              borderLeft: 4,
              borderRadius: 1,
              p: { xs: 1.5, md: 1.75 },
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 1.25,
              bgcolor: (theme) =>
                theme.palette.mode === 'dark'
                  ? alpha(resolveToneColor(theme, decisionTone), 0.1)
                  : alpha(resolveToneColor(theme, decisionTone), 0.045),
              backdropFilter: 'blur(8px)',
              '&::before': {
                content: '""',
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                backgroundImage: (theme) =>
                  `linear-gradient(90deg, ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.07 : 0.035)} 1px, transparent 1px)`,
                backgroundSize: '24px 100%',
                opacity: 0.38,
              },
            }}
          >
            <Box sx={{ minWidth: 0, position: 'relative', zIndex: 1 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={900} textTransform="uppercase" sx={{ letterSpacing: 0 }}>
                {t('productVerification.overviewNextAction')}
              </Typography>
              <Typography variant="h6" fontWeight={950} sx={{ color: decisionTone, mt: 0.6, lineHeight: 1.16, letterSpacing: 0 }}>
                {decisionTitle}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.85, lineHeight: 1.55 }}>
                {decisionBody}
              </Typography>
            </Box>

            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ position: 'relative', zIndex: 1 }}>
              <Chip size="small" icon={<ShieldCheck size={14} />} label={t('productVerification.testingMatrixTitle')} />
              <Chip size="small" icon={<FileJson size={14} />} label={t('productVerification.tabEvidencePack')} />
              <Chip size="small" icon={<Clock size={14} />} label={t('productVerification.tabSchedulerRuns')} />
            </Stack>
          </Box>
        </Box>
      </Paper>

      <Box
        sx={{
          minHeight: 0,
          flexShrink: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(320px, 0.42fr)' },
          gap: 1.25,
          alignItems: 'stretch',
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            position: 'relative',
            flexShrink: 0,
            borderRadius: 1,
            overflow: 'hidden',
            minHeight: 'auto',
            height: 'auto',
            borderColor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.12),
            bgcolor: 'background.paper',
            boxShadow: (theme) => `0 10px 22px ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.18 : 0.045)}`,
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: (theme) =>
                `linear-gradient(90deg, ${alpha(theme.palette.primary.main, 0.62)}, ${alpha(theme.palette.info.main, 0.46)}, transparent)`,
            },
          }}
        >
          <SectionHeader icon={<AlertTriangle size={16} />} title={t('productVerification.testingMatrixTitle')} />
          <Box sx={{ p: 1.25, minHeight: 0 }}>
            {hasBlockers ? (
              <Stack spacing={0.8} sx={{ mt: 1.25 }}>
                {evidenceGate.blockers.slice(0, 4).map((blocker) => (
                  <EvidenceIssue key={blocker} text={blocker} tone="warning.main" />
                ))}
                {blockingRows.slice(0, 4).map((row) => (
                  <EvidenceIssue key={row.id} text={`${row.title}: ${row.evidence}`} tone={row.status === 'blocked' ? 'error.main' : 'warning.main'} />
                ))}
              </Stack>
            ) : (
              <PreflightBoard
                hasTarget={hasTarget}
                hasEvidence={hasEvidence}
                hasRunner={hasRunner}
                decisionTone={decisionTone}
                decisionTitle={decisionTitle}
                selectedTitle={selectedTitle}
                artifactValue={`${artifactPresent}/${artifactTotal}`}
                verdict={verdict}
              />
            )}
          </Box>
        </Paper>

        <Paper
          variant="outlined"
          sx={{
            position: 'relative',
            flexShrink: 0,
            borderRadius: 1,
            overflow: 'hidden',
            minHeight: 'auto',
            height: 'auto',
            borderColor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.12),
            bgcolor: 'background.paper',
            boxShadow: (theme) => `0 10px 22px ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.18 : 0.045)}`,
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: (theme) =>
                `linear-gradient(90deg, ${alpha(theme.palette.primary.main, 0.62)}, ${alpha(theme.palette.info.main, 0.42)}, transparent)`,
            },
          }}
        >
          <SectionHeader icon={<Clock size={16} />} title={t('productVerification.overviewRecentRuns')} />
          <Stack spacing={0.8} sx={{ p: 1.25, minHeight: 0 }}>
            {runs.slice(0, 4).map((run) => (
              <CompactRunRow
                key={run.id}
                run={run}
                selected={selectedRun?.id === run.id}
                onSelect={() => onSelectRun(run)}
              />
            ))}
            {runs.length === 0 && (
              <RecentRunsEmpty />
            )}
            {runs.length > 4 && (
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.75 }}>
                {t('productVerification.overviewMoreRuns', { count: runs.length - 4 })}
              </Typography>
            )}
          </Stack>
        </Paper>
      </Box>
    </Box>
  )
}

function TechCorners({ tone }: { tone: string }) {
  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        inset: 10,
        pointerEvents: 'none',
        zIndex: 1,
        '& .corner': {
          position: 'absolute',
          width: 24,
          height: 24,
          borderColor: tone,
          opacity: (theme) => (theme.palette.mode === 'dark' ? 0.65 : 0.5),
        },
        '& .tl': { top: 0, left: 0, borderTop: 2, borderLeft: 2 },
        '& .tr': { top: 0, right: 0, borderTop: 2, borderRight: 2 },
        '& .bl': { bottom: 0, left: 0, borderBottom: 2, borderLeft: 2 },
        '& .br': { bottom: 0, right: 0, borderBottom: 2, borderRight: 2 },
      }}
    >
      <Box className="corner tl" />
      <Box className="corner tr" />
      <Box className="corner bl" />
      <Box className="corner br" />
    </Box>
  )
}

function resolveToneColor(theme: Theme, tone: string) {
  switch (tone) {
    case 'success.main':
      return theme.palette.success.main
    case 'warning.main':
      return theme.palette.warning.main
    case 'error.main':
      return theme.palette.error.main
    case 'info.main':
      return theme.palette.info.main
    case 'text.secondary':
      return theme.palette.text.secondary
    case 'text.primary':
      return theme.palette.text.primary
    case 'primary.main':
    default:
      return theme.palette.primary.main
  }
}

function VerificationBeacon({ value, tone, active }: { value: string; tone: string; active: boolean }) {
  return (
    <Box
      sx={{
        width: 96,
        height: 96,
        borderRadius: 1,
        position: 'relative',
        display: { xs: 'none', md: 'grid' },
        placeItems: 'center',
        color: tone,
        border: 1,
        borderColor: tone,
        bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.5 : 0.82),
        overflow: 'hidden',
        boxShadow: (theme) => `inset 0 0 24px ${alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.18 : 0.11)}`,
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 8,
          borderRadius: '50%',
          background: (theme) =>
            `conic-gradient(from 210deg, transparent 0 22%, ${alpha(resolveToneColor(theme, tone), active ? 0.42 : 0.16)} 28%, transparent 34% 72%, ${alpha(theme.palette.info.main, 0.28)} 79%, transparent 86%)`,
          opacity: active ? 0.95 : 0.65,
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 14,
          border: '1px solid',
          borderColor: tone,
          borderRadius: '50%',
          opacity: active ? 0.42 : 0.22,
          boxShadow: (theme) => `0 0 0 12px ${alpha(resolveToneColor(theme, tone), 0.08)}, 0 0 0 26px ${alpha(resolveToneColor(theme, tone), 0.045)}`,
        },
      }}
    >
      <Box sx={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
        <ShieldCheck size={20} />
        <Typography sx={{ fontSize: 20, lineHeight: 1, fontWeight: 950, mt: 0.25, textShadow: (theme) => `0 0 16px ${alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.5 : 0.2)}` }} noWrap>
          {value}
        </Typography>
      </Box>
    </Box>
  )
}

function VerificationPipeline({
  targetActive,
  targetValue,
  evidenceActive,
  runnerActive,
  artifactValue,
}: {
  targetActive: boolean
  targetValue: string
  evidenceActive: boolean
  runnerActive: boolean
  artifactValue: string
}) {
  const stages = [
    {
      icon: <Network size={14} />,
      label: t('productVerification.targetUrl'),
      value: targetActive ? targetValue : t('productVerification.infoPending'),
      active: targetActive,
      tone: 'info.main',
    },
    {
      icon: <FileJson size={14} />,
      label: t('productVerification.tabEvidencePack'),
      value: artifactValue,
      active: evidenceActive,
      tone: 'success.main',
    },
    {
      icon: <Activity size={14} />,
      label: t('productVerification.runnerExecution'),
      value: runnerActive ? t('productVerification.infoRunnerLinked') : t('productVerification.infoNoRunner'),
      active: runnerActive,
      tone: 'primary.main',
    },
  ]

  return (
    <Box
      sx={{
        mt: 1.1,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
        gap: 0.7,
        position: 'relative',
      }}
    >
      {stages.map((stage, index) => (
        <Box
          key={stage.label}
          sx={{
            minWidth: 0,
            position: 'relative',
            border: 1,
            borderColor: (theme) => alpha(theme.palette.divider, theme.palette.mode === 'dark' ? 0.9 : 1),
            borderRadius: 1,
            px: 0.9,
            py: 0.75,
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr)',
            gap: 0.7,
            alignItems: 'center',
            bgcolor: (theme) =>
              stage.active
                ? alpha(resolveToneColor(theme, stage.tone), theme.palette.mode === 'dark' ? 0.09 : 0.045)
                : alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.6 : 0.92),
            '&::before': index === 0 ? undefined : {
              content: '""',
              position: 'absolute',
              top: '50%',
              right: '100%',
              width: 10,
              height: 1,
              bgcolor: (theme) => (stage.active ? resolveToneColor(theme, stage.tone) : theme.palette.divider),
              transform: 'translateY(-50%)',
            },
          }}
        >
          <Box
            sx={{
              width: 26,
              height: 26,
              borderRadius: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: stage.active ? stage.tone : 'text.secondary',
              bgcolor: (theme) =>
                alpha(stage.active ? resolveToneColor(theme, stage.tone) : theme.palette.text.secondary, theme.palette.mode === 'dark' ? 0.12 : 0.065),
            }}
          >
            {stage.icon}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={850} noWrap>
              {stage.label}
            </Typography>
            <Typography variant="body2" sx={{ color: stage.active ? stage.tone : 'text.primary', fontWeight: 950, lineHeight: 1.15 }} noWrap title={stage.value}>
              {stage.value}
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  )
}

function PreflightBoard({
  hasTarget,
  hasEvidence,
  hasRunner,
  decisionTone,
  decisionTitle,
  selectedTitle,
  artifactValue,
  verdict,
}: {
  hasTarget: boolean
  hasEvidence: boolean
  hasRunner: boolean
  decisionTone: string
  decisionTitle: string
  selectedTitle: string
  artifactValue: string
  verdict: string
}) {
  const nodes = [
    {
      icon: <Network size={15} />,
      label: t('productVerification.targetUrl'),
      value: hasTarget ? selectedTitle : t('productVerification.infoPending'),
      detail: t('productVerification.commandSubtitle'),
      active: hasTarget,
      tone: 'info.main',
    },
    {
      icon: <FileJson size={15} />,
      label: t('productVerification.tabEvidencePack'),
      value: artifactValue,
      detail: t('productVerification.evidenceWaitingForRunner'),
      active: hasEvidence,
      tone: 'success.main',
    },
    {
      icon: <Activity size={15} />,
      label: t('productVerification.runnerExecution'),
      value: hasRunner ? t('productVerification.infoRunnerLinked') : t('productVerification.infoNoRunner'),
      detail: t('productVerification.overviewWaitingRunner'),
      active: hasRunner,
      tone: 'primary.main',
    },
    {
      icon: <ShieldCheck size={15} />,
      label: t('productVerification.gateVerdict'),
      value: verdict,
      detail: decisionTitle,
      active: hasTarget || hasEvidence,
      tone: decisionTone,
    },
  ]

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 176,
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr) auto',
        gap: 1,
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
          gap: 0.9,
          alignItems: 'center',
          minWidth: 0,
          px: 0.4,
        }}
      >
        <Box sx={{ color: 'primary.main', display: 'flex' }}>
          <GitBranch size={16} />
        </Box>
        <Typography variant="body2" fontWeight={950} noWrap>
          {t('productVerification.evidencePipeline')}
        </Typography>
        <Chip
          size="small"
          label={decisionTitle}
          sx={{
            height: 22,
            maxWidth: 220,
            color: decisionTone,
            bgcolor: (theme) => alpha(resolveToneColor(theme, decisionTone), theme.palette.mode === 'dark' ? 0.13 : 0.08),
            fontWeight: 900,
          }}
        />
      </Box>

      <Box
        sx={{
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
          gap: 0.85,
        }}
      >
        {nodes.map((node) => (
          <PreflightNode key={node.label} {...node} />
        ))}
      </Box>

      <Box
        sx={{
          height: 8,
          borderRadius: 999,
          overflow: 'hidden',
          bgcolor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.07),
        }}
      >
        <Box
          sx={{
            height: '100%',
            width: hasEvidence ? '88%' : hasTarget ? '46%' : '18%',
            borderRadius: 999,
            background: (theme) =>
              `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.info.main}, ${hasEvidence ? theme.palette.success.main : alpha(theme.palette.info.main, 0.42)})`,
          }}
        />
      </Box>
    </Box>
  )
}

function PreflightNode({
  icon,
  label,
  value,
  detail,
  active,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
  active: boolean
  tone: string
}) {
  return (
    <Box
      sx={{
        minWidth: 0,
        border: 1,
        borderColor: (theme) =>
          alpha(resolveToneColor(theme, active ? tone : 'text.secondary'), active ? (theme.palette.mode === 'dark' ? 0.34 : 0.28) : (theme.palette.mode === 'dark' ? 0.2 : 0.16)),
        borderRadius: 1,
        p: 1,
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        gap: 0.85,
        alignItems: 'center',
        bgcolor: (theme) =>
          active
            ? alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.095 : 0.05)
            : alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.62 : 0.92),
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: active ? tone : 'text.secondary',
          bgcolor: (theme) => alpha(resolveToneColor(theme, active ? tone : 'text.secondary'), theme.palette.mode === 'dark' ? 0.13 : 0.075),
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={850} noWrap>
          {label}
        </Typography>
        <Typography variant="body2" fontWeight={950} sx={{ color: active ? tone : 'text.primary', lineHeight: 1.1 }} noWrap title={value}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }} noWrap title={detail}>
          {detail}
        </Typography>
      </Box>
    </Box>
  )
}

function RecentRunsEmpty() {
  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 176,
        border: 1,
        borderColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.22 : 0.14),
        borderRadius: 1,
        p: 1.25,
        display: 'grid',
        gridTemplateRows: 'minmax(0, 1fr) auto',
        gap: 1,
        bgcolor: (theme) => (theme.palette.mode === 'dark' ? alpha(theme.palette.background.paper, 0.64) : alpha(theme.palette.background.paper, 0.96)),
        backgroundImage: (theme) =>
          `linear-gradient(${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.07 : 0.035)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.06 : 0.03)} 1px, transparent 1px)`,
        backgroundSize: '28px 28px',
      }}
    >
      <Box sx={{ minWidth: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <Box sx={{ minWidth: 0 }}>
          <Box
            sx={{
              width: 42,
              height: 42,
              mx: 'auto',
              borderRadius: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'primary.main',
              bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.13 : 0.07),
              border: 1,
              borderColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.28 : 0.2),
            }}
          >
            <Clock size={18} />
          </Box>
          <Typography variant="body2" fontWeight={950} sx={{ mt: 1 }}>
            {t('productVerification.overviewNoRuns')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.45, lineHeight: 1.45 }}>
            {t('productVerification.empty')}
          </Typography>
        </Box>
      </Box>
      <Stack direction="row" spacing={0.65} useFlexGap flexWrap="wrap">
        <Chip size="small" label={t('productVerification.testingMatrixTitle')} sx={{ height: 22, fontWeight: 850 }} />
        <Chip size="small" label={t('productVerification.tabEvidencePack')} sx={{ height: 22, fontWeight: 850 }} />
        <Chip size="small" label={t('productVerification.tabSchedulerRuns')} sx={{ height: 22, fontWeight: 850 }} />
      </Stack>
    </Box>
  )
}

function DecisionMetric({
  icon,
  label,
  value,
  tone = 'primary.main',
}: {
  icon: ReactNode
  label: string
  value: string
  tone?: string
}) {
  return (
    <Box
      sx={{
        minWidth: 0,
        border: 1,
        borderColor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.14 : 0.1),
        borderRadius: 1,
        borderLeft: 3,
        borderLeftColor: tone,
        p: 1,
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        gap: 0.85,
        alignItems: 'center',
        bgcolor: (theme) =>
          theme.palette.mode === 'dark'
            ? alpha(resolveToneColor(theme, tone), 0.08)
            : alpha(resolveToneColor(theme, tone), 0.04),
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: tone,
          bgcolor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.12 : 0.07),
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={850} noWrap>
          {label}
        </Typography>
        <Typography sx={{ mt: 0.35, fontSize: 19, lineHeight: 1, fontWeight: 950, color: tone }} noWrap title={value}>
          {value}
        </Typography>
      </Box>
    </Box>
  )
}

function CompactRunRow({ run, selected, onSelect }: { run: WarroomCampaignExecution; selected: boolean; onSelect: () => void }) {
  const status = run.verdict ?? run.status
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect()
      }}
      sx={{
        minWidth: 0,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 1,
        alignItems: 'center',
        border: 1,
        borderColor: selected ? 'primary.main' : 'divider',
        borderRadius: 1,
        px: 1,
        py: 0.85,
        cursor: 'pointer',
        bgcolor: selected ? 'action.hover' : 'background.paper',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={850} noWrap title={run.targetUrl}>
          {targetHost(run.targetUrl) || run.targetUrl}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
          {formatDate(run.createdAt)} - {run.evidenceSig ?? run.runnerExecutionId ?? t('productVerification.infoPending')}
        </Typography>
      </Box>
      <Stack direction="row" spacing={0.5}>
        <Chip size="small" color={statusColor[status] ?? statusColor[run.status] ?? 'default'} label={status} sx={{ height: 22 }} />
        {run.criticalCount > 0 && <Chip size="small" color="error" label={`P0 ${run.criticalCount}`} sx={{ height: 22 }} />}
      </Stack>
    </Box>
  )
}

function EvidenceIssue({ text, tone }: { text: string; tone: string }) {
  return (
    <Box sx={{ border: 1, borderColor: tone, borderRadius: 1, p: 1, minWidth: 0, bgcolor: (theme) => alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.1 : 0.06) }}>
      <Typography variant="body2" fontWeight={850} sx={{ overflowWrap: 'anywhere' }}>
        {text}
      </Typography>
    </Box>
  )
}

function TargetVerifierSummary({
  run,
  inputTargetUrl,
  inputRepoId,
  contract,
}: {
  run?: WarroomCampaignExecution
  inputTargetUrl?: string
  inputRepoId?: string
  contract: string
}) {
  const activeTarget = run?.targetUrl || inputTargetUrl?.trim() || ''
  const activeRepo = run?.repoId || inputRepoId?.trim() || ''
  const verifiedScope = run?.allowedTargets
    ? compactScope(run.allowedTargets)
    : activeTarget
      ? targetHost(activeTarget)
      : 'verified customer repo or domain required'

  return (
    <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', flex: 1, minWidth: 0 }}>
        <SectionHeader icon={<Activity size={16} />} title={t('productVerification.targetUnderVerification')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label={t('hardcoded.customer.target.url.1d5eb39d')} value={activeTarget || t('productVerification.infoEnterCustomerUrl')} />
          <EvidenceField label={t('hardcoded.target.host.5e52ec50')} value={targetHost(activeTarget) || t('productVerification.infoNotSelected')} />
          <EvidenceField label={t('hardcoded.connected.repo.43d86abc')} value={activeRepo || t('productVerification.infoRepoOptional')} />
          <EvidenceField label={t('hardcoded.verified.scope.e78a5a72')} value={verifiedScope} />
          <EvidenceField label={t('hardcoded.target.owner.d87266ba')} value="customer-owned URL/domain/repo" />
          <EvidenceField label={t('hardcoded.current.run.af8c332e')} value={run?.id ?? t('productVerification.infoNotSelected')} />
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', flex: 1, minWidth: 0 }}>
        <SectionHeader icon={<ShieldCheck size={16} />} title={t('productVerification.verifierProvenance')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label={t('hardcoded.control.plane.38f00e1f')} value="flyto-engine" />
          <EvidenceField label="Runner" value="flyto-core verification runner" />
          <EvidenceField label="Contract" value={contract} />
          <EvidenceField label={t('productVerification.evidenceSig')} value={run?.evidenceSig ?? t('productVerification.infoPending')} />
          <EvidenceField label={t('productVerification.runnerExecution')} value={run?.runnerExecutionId ?? t('productVerification.infoNoRunner')} />
          <EvidenceField label={t('hardcoded.gate.boundary.f75aed45')} value="server-side verifier; customer target remains external" />
        </Box>
      </Paper>
    </Stack>
  )
}

function ProductVerificationSchedulerPanel({
  isPlatformAdmin,
  scopeLoading,
  scanner,
  loading,
  error,
  patchPending,
  runPending,
  latestEvidenceRun,
  onToggle,
  onInterval,
  onRunNow,
}: {
  isPlatformAdmin: boolean
  scopeLoading: boolean
  scanner: SystemScanner | null
  loading: boolean
  error: Error | null
  patchPending: boolean
  runPending: boolean
  latestEvidenceRun: WarroomCampaignExecution | null
  onToggle: (enabled: boolean) => void
  onInterval: (interval: string) => void
  onRunNow: () => void
}) {
  const busy = patchPending || runPending || !!scanner?.currently_running
  const intervalOptions = [
    { value: '30m0s', label: '30m' },
    { value: '1h0m0s', label: '1h' },
    { value: '6h0m0s', label: '6h' },
    { value: '12h0m0s', label: '12h' },
    { value: '24h0m0s', label: '24h' },
  ]
  const intervalKnown = scanner ? intervalOptions.some((option) => option.value === scanner.interval) : true

  if (scopeLoading) {
    return <LinearProgress />
  }

  if (!isPlatformAdmin) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Clock size={16} />} title={t('productVerification.schedulerTitle')} />
        <Alert severity="info" sx={{ m: 2 }}>
          {t('productVerification.schedulerPlatformAdminOnly')}
        </Alert>
      </Paper>
    )
  }

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Clock size={16} />} title={t('productVerification.schedulerTitle')} />
        {loading && <LinearProgress />}
        {error && (
          <Box sx={{ m: 2 }}>
            <InlineErrorNotice error={error} />
          </Box>
        )}
        {!loading && !error && !scanner && (
          <>
            <Alert severity="warning" sx={{ m: 2 }}>
              {t('productVerification.schedulerMissing')}
            </Alert>
            <Box sx={{ px: 2, pb: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
              <EvidenceField label={t('hardcoded.scanner.id.ae6fe969')} value="product_verification" />
              <EvidenceField label="Registration" value="not registered in API scanner registry" />
              <EvidenceField label={t('hardcoded.manual.run.endpoint.fceb86d8')} value="/api/v1/code/orgs/{org_id}/warroom-verification/runs" />
              <EvidenceField label={t('hardcoded.evidence.link.6866d7fe')} value={latestEvidenceRun ? `run ${latestEvidenceRun.id} -> ${latestEvidenceRun.evidenceSig ?? 'evidence pending'}` : 'not captured'} />
            </Box>
          </>
        )}
        {scanner && (
          <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(300px, 0.55fr)' }, gap: 1.5 }}>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Typography variant="subtitle2" fontWeight={850}>{scanner.name || t('productVerification.title')}</Typography>
                <Chip size="small" color={scanner.enabled ? 'success' : 'default'} label={scanner.enabled ? 'enabled' : 'disabled'} />
                {scanner.currently_running && <Chip size="small" color="primary" label={t('productVerification.schedulerRunning')} />}
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, lineHeight: 1.55 }}>
                {scanner.description}
              </Typography>
              <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
                <EvidenceField label={t('hardcoded.scanner.id.ae6fe969')} value={scanner.id} />
                <EvidenceField label="Interval" value={scanner.interval} />
                <EvidenceField label={t('hardcoded.runs.failures.352ac0b1')} value={`${scanner.run_count} / ${scanner.fail_count}`} />
                <EvidenceField label={t('settings.schedule.lastRun')} value={formatDate(scanner.last_run_end) || 'never'} />
                <EvidenceField label={t('settings.schedule.nextRun')} value={estimateNextRun(scanner)} />
                <EvidenceField label={t('hardcoded.evidence.link.6866d7fe')} value={latestEvidenceRun ? `run ${latestEvidenceRun.id} -> ${latestEvidenceRun.evidenceSig ?? 'evidence pending'}` : 'not captured'} />
              </Box>
              {scanner.last_error && (
                <Box sx={{ mt: 1.5 }}>
                  <InlineErrorNotice error={scanner.last_error} />
                </Box>
              )}
            </Box>

            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={850}>{t('productVerification.schedulerControls')}</Typography>
              <Stack spacing={1.25} sx={{ mt: 1.25 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                  <Typography variant="caption" color="text.secondary">{t('productVerification.schedulerEnabled')}</Typography>
                  <Switch
                    size="small"
                    checked={scanner.enabled}
                    disabled={patchPending || scanner.critical_for_platform}
                    onChange={(event) => onToggle(event.target.checked)}
                  />
                </Stack>
                <Select
                  size="small"
                  fullWidth
                  value={scanner.interval}
                  disabled={patchPending}
                  onChange={(event) => onInterval(String(event.target.value))}
                >
                  {intervalOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                  ))}
                  {!intervalKnown && <MenuItem value={scanner.interval}>{scanner.interval}</MenuItem>}
                </Select>
                <Tooltip title={t('productVerification.schedulerRunNowTip')}>
                  <span>
                    <Button
                      variant="outlined"
                      startIcon={<Play size={16} />}
                      disabled={busy}
                      onClick={onRunNow}
                      fullWidth
                    >
                      {runPending ? t('common.running') : t('productVerification.schedulerRunNow')}
                    </Button>
                  </span>
                </Tooltip>
              </Stack>
            </Box>
          </Box>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<ShieldCheck size={16} />} title={t('productVerification.schedulerSafety')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
          <ContractRow label={t('hardcoded.durable.job.94c5dfed')} value="product_verification in scheduled_jobs / scheduled_job_runs" />
          <ContractRow label={t('hardcoded.default.mode.a652e3e4')} value="disabled in scanners.yaml; dry-run unless FLYTO_PRODUCT_VERIFICATION_EXECUTE=true" />
          <ContractRow label="Runner" value="FLYTO_VERIFICATION_URL preferred, FLYTO_RUNNER_URL fallback" />
          <ContractRow label="Bounds" value="FLYTO_PRODUCT_VERIFICATION_MAX_ORGS and MAX_TARGETS_PER_ORG" />
          <ContractRow label="Scope" value="customer repo verify_targets first; verified customer domain fallback" />
          <ContractRow label="Evidence" value="campaign_executions row -> runner callback -> screenshot/DOM/network artifacts" />
        </Box>
      </Paper>
    </Stack>
  )
}

function YamlScenariosPanel({
  run,
  pack,
}: {
  run: WarroomCampaignExecution | undefined
  pack: WarroomEvidencePack | null
}) {
  const scenario = pack?.scenarios
  const scenarioSteps = scenario?.steps ?? []

  if (!run) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<ScrollText size={16} />} title={t('productVerification.yamlScenarios')} />
        <Alert severity="info" sx={{ m: 2 }}>
          {t('productVerification.noYamlRun')}
        </Alert>
      </Paper>
    )
  }

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<ScrollText size={16} />} title={t('productVerification.yamlScenarios')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label={t('hardcoded.scenario.name.38b40843')} value={scenario?.name ?? 'unavailable'} />
          <EvidenceField label="Schema" value={scenario?.schema_version ?? 'unavailable'} />
          <EvidenceField label={t('hardcoded.generated.from.3a6df392')} value={scenario?.generated_from ?? 'unavailable'} />
          <EvidenceField label={t('hardcoded.step.count.719237f6')} value={String(scenarioSteps.length)} />
        </Box>
        {!scenario ? (
          <Alert severity="info" sx={{ mx: 2, mb: 2 }}>
            {t('productVerification.yamlUnavailable')}
          </Alert>
        ) : (
          <Box sx={{ px: 2, pb: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 0.68fr) minmax(320px, 0.32fr)' }, gap: 1.25 }}>
            <CodePreview value={scenarioPreview(scenario)} />
            <Stack spacing={0.75}>
              {scenarioSteps.map((step, index) => (
                <ContractRow
                  key={step.id ?? index}
                  label={step.id ?? `step_${index + 1}`}
                  value={`${step.module ?? 'module unavailable'} · ${(step.assertions ?? []).length} assertions`}
                />
              ))}
              {scenarioSteps.length === 0 && <EvidenceField label="Steps" value="empty" />}
            </Stack>
          </Box>
        )}
      </Paper>
    </Stack>
  )
}

function ReplayTimelinePanel({
  run,
  pack,
  artifacts,
  gate,
}: {
  run: WarroomCampaignExecution | undefined
  pack: WarroomEvidencePack | null
  artifacts: WarroomEvidenceArtifact[]
  gate: EvidenceGateSummary
}) {
  const model = normalizeAutomationModel(pack, artifacts, gate)
  const replayResults = model.replay?.steps ?? pack?.run?.results ?? []

  if (!run) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Play size={16} />} title={t('productVerification.replayTimeline')} />
        <Alert severity="info" sx={{ m: 2 }}>
          {t('productVerification.noReplayRun')}
        </Alert>
      </Paper>
    )
  }

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Play size={16} />} title={t('productVerification.replayTimeline')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label={t('productVerification.runnerExecution')} value={run.runnerExecutionId ?? t('productVerification.infoNoRunner')} />
          <EvidenceField label={t('hardcoded.replay.ok.fa567137')} value={model.replay?.ok == null ? t('productVerification.infoUnknown') : model.replay.ok ? t('productVerification.infoYes') : t('productVerification.infoNo')} />
          <EvidenceField label={t('hardcoded.passed.total.dd49952d')} value={`${model.replay?.passed ?? 0} / ${model.replay?.total ?? replayResults.length}`} />
          <EvidenceField label="Reliability" value={formatScore(model.replay?.reliability)} />
        </Box>
        {replayResults.length === 0 ? (
          <Alert severity="info" sx={{ mx: 2, mb: 2 }}>
            {t('productVerification.noReplayResults')}
          </Alert>
        ) : (
          <Box sx={{ px: 2, pb: 2, display: 'grid', gap: 1 }}>
            {replayResults.map((step, index) => (
              <ReplayStepRow key={`${step.id ?? step.name ?? index}-${index}`} step={step} index={index} />
            ))}
          </Box>
        )}
      </Paper>
    </Stack>
  )
}

function GhostApisPanel({
  pack,
  artifacts,
  gate,
}: {
  pack: WarroomEvidencePack | null
  artifacts: WarroomEvidenceArtifact[]
  gate: EvidenceGateSummary
}) {
  const model = normalizeAutomationModel(pack, artifacts, gate)
  const ghostFindings = normalizeEvidenceFindings(pack).filter((finding) => String(finding.code ?? finding.type ?? '').startsWith('ghost_api'))

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<AlertTriangle size={16} />} title={t('productVerification.ghostApis')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label="Status" value={pack ? 'captured' : 'unavailable'} />
          <EvidenceField label="Type A UI -> API no effect" value={String(model.ghost_api?.type_a_count ?? 0)} />
          <EvidenceField label={t('hardcoded.type.b.api.no.ui.path.3daafadb')} value={String(model.ghost_api?.type_b_count ?? 0)} />
          <EvidenceField label={t('hardcoded.type.c.swallowed.api.error.567a15a6')} value={String(model.ghost_api?.type_c_count ?? 0)} />
        </Box>
        {!pack && (
          <Alert severity="info" sx={{ mx: 2, mb: 2 }}>
            {t('productVerification.ghostUnavailable')}
          </Alert>
        )}
        <Box sx={{ px: 2, pb: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 0.55fr) minmax(0, 0.45fr)' }, gap: 1.25 }}>
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={850}>{t('hardcoded.ghost.api.samples.4c58686f')}</Typography>
            <GhostApiSampleList model={model} />
          </Box>
          <FindingList findings={ghostFindings} />
        </Box>
      </Paper>
    </Stack>
  )
}

function RbacEntitlementPanel({
  run,
  pack,
  artifacts,
  gate,
}: {
  run?: WarroomCampaignExecution
  pack: WarroomEvidencePack | null
  artifacts: WarroomEvidenceArtifact[]
  gate: EvidenceGateSummary
}) {
  const model = normalizeAutomationModel(pack, artifacts, gate)
  const rbac = model.rbac_matrix
  const expectedRoles = (rbac?.roles_required?.length ? rbac.roles_required : ['owner', 'admin', 'member', 'viewer'])
  const rolesTested = new Set((rbac?.roles_tested ?? []).map((role) => role.toLowerCase()))
  const roleExpectations: Record<string, string> = rbac?.role_expectations ?? { owner: 'allow', admin: 'allow', member: 'allow', viewer: 'deny' }

  return (
    <Stack spacing={2}>
      <TargetVerifierSummary
        run={run}
        inputTargetUrl={run?.targetUrl ?? ''}
        inputRepoId={run?.repoId ?? ''}
        contract="warroom.product_verification.v1"
      />

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<ShieldCheck size={16} />} title={t('productVerification.rbacEntitlement')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(5, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label="Status" value={rbac?.status ?? 'unavailable'} />
          <EvidenceField label={t('hardcoded.verifier.authority.34f923ad')} value={rbac?.authority ?? 'flyto-engine'} />
          <EvidenceField label={t('hardcoded.roles.required.c88eeb73')} value={expectedRoles.join(', ')} />
          <EvidenceField label={t('hardcoded.roles.tested.4cdbf869')} value={(rbac?.roles_tested ?? []).join(', ') || 'none'} />
          <EvidenceField label={t('hardcoded.action.gate.72a07a1b')} value={rbac?.action ?? 'scan:trigger'} />
          <EvidenceField label={t('hardcoded.tenant.pairs.tested.01e6377d')} value={String(rbac?.tenant_pairs_tested ?? 0)} />
          <EvidenceField label={t('hardcoded.tenant.isolation.f9d078cc')} value={rbac?.tenant_isolation ?? 'not captured'} />
          <EvidenceField label={t('hardcoded.fail.closed.9f590049')} value={rbac?.fail_closed ? 'yes' : 'no'} />
          <EvidenceField label={t('hardcoded.open.gate.disallowed.fa66f691')} value={rbac?.fail_open_disallowed ? 'yes' : 'no'} />
          <EvidenceField label={t('hardcoded.frontend.authority.730d6a6d')} value={rbac?.frontend_authority ? 'yes' : 'no'} />
        </Box>
        {!pack && (
          <Alert severity="info" sx={{ mx: 2, mb: 2 }}>
            {t('productVerification.rbacUnavailable')}
          </Alert>
        )}
        <Box sx={{ px: 2, pb: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={850} sx={{ mb: 1 }}>{t('hardcoded.role.coverage.715160c9')}</Typography>
            <Stack spacing={0.75}>
              {expectedRoles.map((role) => (
                <ContractRow key={role} label={role} value={`${rolesTested.has(role.toLowerCase()) ? 'captured' : 'not captured'} · expected ${roleExpectations[role] ?? 'not specified'}`} />
              ))}
            </Stack>
          </Box>
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={850} sx={{ mb: 1 }}>{t('hardcoded.tenant.isolation.f9d078cc')}</Typography>
            <Stack spacing={0.75}>
              <ContractRow label="Org A -> Org B read" value={(rbac?.tenant_pairs_tested ?? 0) > 0 ? 'blocked or verified by matrix' : 'not captured'} />
              <ContractRow label={t('hardcoded.verifier.gate.c82db099')} value="server authorization gate" />
              <ContractRow label="Capability" value={model.capability ?? 'automated_product_testing'} />
              <ContractRow label={t('hardcoded.open.gate.ec518b63')} value={rbac?.fail_open_disallowed ? 'disallowed' : 'not captured'} />
            </Stack>
          </Box>
        </Box>
        {rbac?.violations && rbac.violations.length > 0 && (
          <Box sx={{ mx: 2, mb: 2 }}>
            <InlineErrorNotice error={rbac.violations.map(String).join(', ')} />
          </Box>
        )}
      </Paper>
    </Stack>
  )
}

export function AutomationTestPanel({
  run,
  pack,
  artifacts,
  gate,
}: {
  run: WarroomCampaignExecution | undefined
  pack: WarroomEvidencePack | null
  artifacts: WarroomEvidenceArtifact[]
  gate: EvidenceGateSummary
}) {
  const { mode } = useExperience()
  const scenario = pack?.scenarios
  const model = normalizeAutomationModel(pack, artifacts, gate)
  const scenarioSteps = scenario?.steps ?? []
  const replayResults = model.replay?.steps ?? pack?.run?.results ?? []
  const replaySummary = pack?.run?.evaluation?.summary ?? pack?.run_evaluation?.summary ?? {}
  const replayReliability = model.replay?.reliability ?? readNumber(replaySummary, 'replay_reliability') ?? pack?.scores?.replay_reliability
  const p0 = model.business_invariants?.p0 ?? readNumber(replaySummary, 'p0') ?? readNumber(pack?.scores, 'p0') ?? 0
  const p1 = model.business_invariants?.p1 ?? readNumber(replaySummary, 'p1') ?? readNumber(pack?.scores, 'p1') ?? 0
  const artifactCompleteness = model.evidence_chain?.artifact_completeness ?? gate.artifactCompleteness
  const artifactKinds = new Set(artifacts.map((artifact) => artifact.kind))
  const requiredArtifacts = artifactCompleteness?.required ?? ['screenshot', 'dom_snapshot', 'network_log']
  const coverage = model.coverage
  const ghostApi = model.ghost_api
  const invariants = model.business_invariants
  const deterministicRules = summarizeDeterministicRules(pack, model)
  const rbac = model.rbac_matrix
  const eventStream = model.event_stream
  const schedulerLoop = model.scheduler_loop
  const scenarioModel = model.scenario_synthesis
  const engineMode = model.engine_mode
  const deterministicContract = model.deterministic_contract
  const authorizationGate = model.authorization_gate
  const matrixRows = buildVerificationMatrix(run, pack, artifacts, gate)

  if (!run) {
    if (mode === 'manager') {
      return <AutomationManagerEmptyState />
    }

    return (
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Play size={16} />} title={t('productVerification.automationTests')} />
        <Alert severity="info" sx={{ m: 2 }}>
          {t('productVerification.noAutomationRun')}
        </Alert>
      </Paper>
    )
  }

  if (mode === 'manager') {
    return (
      <AutomationManagerTestPanel
        run={run}
        model={model}
        artifacts={artifacts}
        gate={gate}
        matrixRows={matrixRows}
        artifactCompleteness={artifactCompleteness}
        requiredArtifacts={requiredArtifacts}
        replayReliability={replayReliability}
        p0={p0}
        p1={p1}
        deterministicRules={deterministicRules}
      />
    )
  }

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<ShieldCheck size={16} />} title={t('productVerification.testingMatrixTitle')} />
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, lineHeight: 1.55 }}>
            {t('productVerification.testingMatrixSubtitle')}
          </Typography>
          <Box sx={{ display: 'grid', gap: 1 }}>
            {matrixRows.map((row) => (
              <VerificationMatrixRow key={row.id} row={row} />
            ))}
          </Box>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Play size={16} />} title={t('productVerification.automationTests')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label={t('hardcoded.automation.verdict.a8812f61')} value={gate.verdict ?? pack?.verdict ?? run.verdict ?? run.status} />
          <EvidenceField label={t('hardcoded.automation.readiness.ed06a24e')} value={typeof model.readiness_score === 'number' ? `${model.readiness_score} / 100` : 'n/a'} />
          <EvidenceField label={t('hardcoded.replay.reliability.0d427d49')} value={formatScore(replayReliability)} />
          <EvidenceField label={t('hardcoded.replay.steps.73b44ac4')} value={`${model.replay?.passed ?? pack?.run?.passed ?? 0}/${model.replay?.total ?? pack?.run?.total ?? scenarioSteps.length} passed`} />
          <EvidenceField label="P0/P1 findings" value={`${p0} / ${p1}`} />
          <EvidenceField label={t('hardcoded.scenario.contract.b9a30319')} value={scenarioModel?.schema_version ?? scenario?.schema_version ?? t('productVerification.infoPending')} />
          <EvidenceField label={t('productVerification.runnerExecution')} value={run.runnerExecutionId ?? t('productVerification.infoNoRunner')} />
          <EvidenceField label={t('productVerification.evidenceSig')} value={run.evidenceSig ?? t('productVerification.infoPending')} />
          <EvidenceField label="Artifacts" value={`${artifactCompleteness?.present?.length ?? artifacts.length}/${requiredArtifacts.length} ${artifactCompleteness?.complete ? 'complete' : 'captured'}`} />
        </Box>
        {gate.blockers.length > 0 && (
          <Box sx={{ mx: 2, mb: 2 }}>
            <InlineErrorNotice error={gate.blockers.join(', ')} />
          </Box>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<ShieldCheck size={16} />} title={t('productVerification.deterministicTestingContract')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label={t('hardcoded.core.schema.8a8cd36b')} value={model.schema_version ?? 'n/a'} />
          <EvidenceField label={t('hardcoded.product.contract.6ff23173')} value={model.product_contract ?? 'n/a'} />
          <EvidenceField label={t('hardcoded.legacy.schema.f3f2c44d')} value={model.legacy_schema_version ?? 'n/a'} />
          <EvidenceField label={t('hardcoded.product.surface.0e539245')} value={model.product_surface ?? 'warroom'} />
          <EvidenceField label="Capability" value={model.capability ?? 'automated_product_testing'} />
          <EvidenceField label={t('hardcoded.execution.mode.cb9e185b')} value={engineMode?.execution_mode ?? 'deterministic_evidence_first'} />
          <EvidenceField label={t('hardcoded.llm.required.f5c8ae77')} value={engineMode?.llm_required ? 'yes' : 'no'} />
          <EvidenceField label={t('hardcoded.llm.role.5234f133')} value={engineMode?.llm_role ?? 'optional_evidence_reviewer'} />
          <EvidenceField label={t('hardcoded.fact.source.83fc2c0d')} value={engineMode?.fact_source ?? 'browser_dom_network_screenshot_sse'} />
          <EvidenceField label={t('hardcoded.evidence.gate.authority.5c079bb2')} value={engineMode?.gate_authority ?? 'deterministic_evidence_gate'} />
          <EvidenceField label={t('hardcoded.authorization.gate.40b62298')} value={authorizationGate?.status ?? 'not_provided'} />
          <EvidenceField label={t('hardcoded.org.gate.0cfb8640')} value={authorizationGate?.org_gate ?? 'requireOrgAccess'} />
          <EvidenceField label={t('hardcoded.scope.gate.f4208e7f')} value={authorizationGate?.scope_gate ?? 'verified_repo_or_domain'} />
          <EvidenceField label={t('hardcoded.commercial.gate.00d07aec')} value={authorizationGate?.commercial_gate ?? 'requireCommercialAction'} />
          <EvidenceField label={t('hardcoded.frontend.authority.730d6a6d')} value={authorizationGate?.frontend_authority ? 'yes' : 'no'} />
          <EvidenceField label={t('hardcoded.human.editable.yaml.29ee68c2')} value={engineMode?.human_editable_yaml === false ? 'no' : 'yes'} />
          <EvidenceField label="Inputs" value={(deterministicContract?.inputs ?? []).slice(0, 5).join(', ') || 'site_graph, intent_graph, state_graph'} />
          <EvidenceField label="Outputs" value={(deterministicContract?.outputs ?? []).slice(0, 5).join(', ') || 'evidence_pack, gate_verdict'} />
          <EvidenceField label={t('hardcoded.llm.can.gate.9378ad6b')} value={deterministicContract?.llm_can_gate ? 'yes' : 'no'} />
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<GitBranch size={16} />} title={t('productVerification.coverageModel')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label={t('hardcoded.observed.coverage.cbdbdf95')} value={formatScore(coverage?.observed_coverage)} />
          <EvidenceField label={t('hardcoded.reachable.coverage.e4e2178c')} value={formatScore(coverage?.reachable_coverage)} />
          <EvidenceField label={t('hardcoded.expected.coverage.3af2c1d5')} value={formatScore(coverage?.expected_coverage)} />
          <EvidenceField label={t('hardcoded.observed.paths.bb13018a')} value={String(coverage?.observed_paths?.length ?? pack?.site_graph?.observed_paths?.length ?? 0)} />
          <EvidenceField label={t('hardcoded.reachable.paths.c3733d97')} value={String(coverage?.reachable_paths?.length ?? pack?.site_graph?.reachable_paths?.length ?? 0)} />
          <EvidenceField label={t('hardcoded.blocked.paths.46af395f')} value={(coverage?.blocked_paths ?? []).slice(0, 4).join(', ') || 'none'} />
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<AlertTriangle size={16} />} title={t('productVerification.deterministicRules')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
          {deterministicRules.rows.map((row) => (
            <EvidenceField key={row.code} label={row.label} value={`${row.count} ${row.status}`} />
          ))}
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<AlertTriangle size={16} />} title={t('productVerification.ghostApiAndInvariants')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={850}>{t('hardcoded.ghost.api.195c6b9a')}</Typography>
            <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
              <EvidenceField label={t('hardcoded.type.a.b930ca67')} value={String(ghostApi?.type_a_count ?? 0)} />
              <EvidenceField label={t('hardcoded.type.b.08e68397')} value={String(ghostApi?.type_b_count ?? 0)} />
              <EvidenceField label={t('hardcoded.type.c.7d87900e')} value={String(ghostApi?.type_c_count ?? 0)} />
            </Box>
            <GhostApiSampleList model={model} />
          </Box>
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={850}>{t('hardcoded.business.invariants.2f08c7f7')}</Typography>
            <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
              <EvidenceField label="Contradictions" value={String(invariants?.state_contradictions ?? 0)} />
              <EvidenceField label="P0" value={String(invariants?.p0 ?? 0)} />
              <EvidenceField label="P1" value={String(invariants?.p1 ?? 0)} />
            </Box>
            <FindingList findings={invariants?.findings ?? []} />
          </Box>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<ShieldCheck size={16} />} title={t('productVerification.rbacMatrix')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(5, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label="Status" value={rbac?.status ?? 'not_provided'} />
          <EvidenceField label={t('hardcoded.roles.required.c88eeb73')} value={(rbac?.roles_required ?? ['owner', 'admin', 'member', 'viewer']).join(', ')} />
          <EvidenceField label={t('hardcoded.roles.tested.4cdbf869')} value={(rbac?.roles_tested ?? []).join(', ') || 'none'} />
          <EvidenceField label={t('hardcoded.role.expectations.a3b96fd9')} value={Object.entries(rbac?.role_expectations ?? {}).map(([role, verdict]) => `${role}:${verdict}`).join(', ') || 'not_provided'} />
          <EvidenceField label={t('hardcoded.tenant.pairs.36477260')} value={String(rbac?.tenant_pairs_tested ?? 0)} />
          <EvidenceField label={t('hardcoded.tenant.isolation.f9d078cc')} value={rbac?.tenant_isolation ?? 'not_provided'} />
          <EvidenceField label={t('hardcoded.fail.closed.9f590049')} value={rbac?.fail_closed ? 'yes' : 'no'} />
          <EvidenceField label={t('hardcoded.open.gate.disallowed.fa66f691')} value={rbac?.fail_open_disallowed ? 'yes' : 'no'} />
          <EvidenceField label={t('hardcoded.frontend.authority.730d6a6d')} value={rbac?.frontend_authority ? 'yes' : 'no'} />
        </Box>
        {rbac?.violations && rbac.violations.length > 0 && (
          <Box sx={{ mx: 2, mb: 2 }}>
            <InlineErrorNotice error={rbac.violations.map(String).join(', ')} />
          </Box>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Network size={16} />} title={t('productVerification.eventStreamModel')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label="Status" value={eventStream?.status ?? 'not_provided'} />
          <EvidenceField label="Transport" value={eventStream?.transport ?? 'n/a'} />
          <EvidenceField label={t('hardcoded.expected.events.fc58c39b')} value={(eventStream?.expected_events ?? []).join(', ') || 'none'} />
          <EvidenceField label={t('hardcoded.payload.fields.2ee6dcc5')} value={(eventStream?.expected_payload_fields ?? []).join(', ') || 'none'} />
          <EvidenceField label="Endpoint" value={eventStream?.endpoint ?? 'n/a'} />
          <EvidenceField label={t('hardcoded.observed.events.d38e740b')} value={String(eventStream?.observed_count ?? eventStream?.observed_events?.length ?? 0)} />
          <EvidenceField label={t('hardcoded.fail.closed.9f590049')} value={eventStream?.fail_closed ? 'yes' : 'no'} />
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Clock size={16} />} title={t('productVerification.schedulerLoopModel')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label="Status" value={schedulerLoop?.status ?? 'not_provided'} />
          <EvidenceField label="Scanner" value={schedulerLoop?.scanner_id ?? 'n/a'} />
          <EvidenceField label={t('hardcoded.verifier.authority.34f923ad')} value={schedulerLoop?.authority ?? 'n/a'} />
          <EvidenceField label={t('hardcoded.dispatch.source.66865c0c')} value={schedulerLoop?.dispatch_source ?? 'n/a'} />
          <EvidenceField label={t('hardcoded.durable.job.94c5dfed')} value={schedulerLoop?.durable_job ? 'yes' : 'no'} />
          <EvidenceField label="Enabled" value={schedulerLoop?.enabled == null ? 'unknown' : schedulerLoop.enabled ? 'yes' : 'no'} />
          <EvidenceField label={t('hardcoded.run.count.c0f5ec35')} value={String(schedulerLoop?.run_count ?? 0)} />
          <EvidenceField label={t('hardcoded.fail.count.b2b54226')} value={String(schedulerLoop?.fail_count ?? 0)} />
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<ScrollText size={16} />} title={t('productVerification.yamlReplayContract')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 0.72fr) minmax(320px, 0.28fr)' }, gap: 1.25 }}>
          <Box sx={{ minWidth: 0 }}>
            <CodePreview value={scenarioPreview(scenario)} />
          </Box>
          <Stack spacing={1}>
            <EvidenceField label={t('hardcoded.scenario.name.38b40843')} value={scenario?.name ?? 'pending'} />
            <EvidenceField label="Target" value={scenario?.target ?? run.targetUrl} />
            <EvidenceField label={t('hardcoded.generated.from.3a6df392')} value={scenario?.generated_from ?? 'pending'} />
            <EvidenceField label={t('hardcoded.step.count.719237f6')} value={String(scenarioSteps.length)} />
          </Stack>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Activity size={16} />} title={t('productVerification.replayTimeline')} />
        {replayResults.length === 0 ? (
          <Alert severity="info" sx={{ m: 2 }}>
            {t('productVerification.noReplayResults')}
          </Alert>
        ) : (
          <Box sx={{ p: 2, display: 'grid', gap: 1 }}>
            {replayResults.map((step, index) => (
              <ReplayStepRow key={`${step.id ?? step.name ?? index}-${index}`} step={step} index={index} />
            ))}
          </Box>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Network size={16} />} title={t('productVerification.automationEvidenceChain')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
          {requiredArtifacts.map((kind) => (
            <EvidenceField
              key={kind}
              label={formatScoreKey(kind)}
              value={artifactKinds.has(kind) || artifactCompleteness?.present?.includes(kind) ? 'captured' : 'missing'}
            />
          ))}
        </Box>
      </Paper>
    </Stack>
  )
}

function AutomationManagerEmptyState() {
  const waitingRows = [
    {
      icon: <Network size={15} />,
      title: t('productVerification.targetUrl'),
      detail: t('productVerification.infoEnterCustomerUrl'),
      tone: 'info.main',
    },
    {
      icon: <Activity size={15} />,
      title: t('productVerification.runnerExecution'),
      detail: t('productVerification.infoNoRunner'),
      tone: 'primary.main',
    },
    {
      icon: <FileJson size={15} />,
      title: t('productVerification.tabEvidencePack'),
      detail: t('productVerification.evidenceWaitingForRunner'),
      tone: 'success.main',
    },
    {
      icon: <ShieldCheck size={15} />,
      title: t('productVerification.gateVerdict'),
      detail: t('productVerification.infoPending'),
      tone: 'warning.main',
    },
  ]

  return (
    <Stack spacing={1.35} sx={{ minHeight: '100%', pb: 0.5 }}>
      <Paper
        variant="outlined"
        sx={{
          borderRadius: 1,
          overflow: 'hidden',
          position: 'relative',
          borderColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.4 : 0.28),
          bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.78 : 0.95),
          backgroundImage: (theme) =>
            `linear-gradient(90deg, ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.08)}, transparent 42%),
             linear-gradient(${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.07 : 0.035)} 1px, transparent 1px),
             linear-gradient(90deg, ${alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.055 : 0.03)} 1px, transparent 1px)`,
          backgroundSize: 'auto, 28px 28px, 28px 28px',
        }}
      >
        <TechCorners tone="primary.main" />
        <Box sx={{ position: 'relative', zIndex: 2, p: { xs: 1.5, md: 2 } }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }}>
            <Box sx={{ minWidth: 0 }}>
              <Chip size="small" icon={<ShieldCheck size={14} />} label={t('productVerification.automationTests')} sx={{ height: 24, fontWeight: 900 }} />
              <Typography variant="h5" sx={{ mt: 0.8, fontWeight: 950, lineHeight: 1.12, letterSpacing: 0 }}>
                {t('productVerification.testingMatrixTitle')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.45, maxWidth: 820, lineHeight: 1.55 }}>
                {t('productVerification.noAutomationRun')}
              </Typography>
            </Box>
            <Box
              sx={{
                minWidth: { xs: 0, lg: 260 },
                border: 1,
                borderColor: (theme) => alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.34 : 0.24),
                borderRadius: 1,
                p: 1.25,
                bgcolor: (theme) => alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.09 : 0.06),
              }}
            >
              <Typography variant="caption" color="text.secondary" fontWeight={850}>
                {t('productVerification.overviewNextAction')}
              </Typography>
              <Typography variant="body1" sx={{ mt: 0.25, fontWeight: 950, color: 'warning.main' }}>
                {t('productVerification.infoEnterCustomerUrl')}
              </Typography>
            </Box>
          </Stack>
        </Box>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 0.64fr) minmax(320px, 0.36fr)' }, gap: 1.25, flex: 1, minHeight: 0 }}>
        <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
          <SectionHeader icon={<GitBranch size={16} />} title={t('productVerification.evidencePipeline')} />
          <Box sx={{ p: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 0.85 }}>
            {waitingRows.map((row) => (
              <Box
                key={row.title}
                sx={{
                  border: 1,
                  borderColor: (theme) => alpha(resolveToneColor(theme, row.tone), theme.palette.mode === 'dark' ? 0.28 : 0.2),
                  borderRadius: 1,
                  p: 1,
                  minHeight: 118,
                  display: 'grid',
                  gridTemplateRows: 'auto minmax(0, 1fr)',
                  gap: 1,
                  bgcolor: (theme) => alpha(resolveToneColor(theme, row.tone), theme.palette.mode === 'dark' ? 0.075 : 0.045),
                }}
              >
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Box sx={{ color: row.tone, display: 'flex' }}>{row.icon}</Box>
                  <Typography variant="body2" fontWeight={950} noWrap title={row.title}>
                    {row.title}
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.55, alignSelf: 'end' }}>
                  {row.detail}
                </Typography>
              </Box>
            ))}
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
          <SectionHeader icon={<AlertTriangle size={16} />} title={t('productVerification.overviewNextAction')} />
          <Box sx={{ p: 1.5, display: 'grid', gap: 0.85 }}>
            {[
              t('productVerification.targetUrl'),
              t('productVerification.runnerExecution'),
              t('productVerification.tabEvidencePack'),
              t('productVerification.gateVerdict'),
            ].map((label) => (
              <Box
                key={label}
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 1,
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 1,
                  alignItems: 'center',
                }}
              >
                <Typography variant="body2" fontWeight={850} noWrap title={label}>
                  {label}
                </Typography>
                <Chip size="small" label={t('productVerification.infoPending')} sx={{ height: 22, fontWeight: 900 }} />
              </Box>
            ))}
          </Box>
        </Paper>
      </Box>
    </Stack>
  )
}

function AutomationManagerTestPanel({
  run,
  model,
  artifacts,
  gate,
  matrixRows,
  artifactCompleteness,
  requiredArtifacts,
  replayReliability,
  p0,
  p1,
  deterministicRules,
}: {
  run: WarroomCampaignExecution
  model: WarroomAutomationTestModel
  artifacts: WarroomEvidenceArtifact[]
  gate: EvidenceGateSummary
  matrixRows: VerificationMatrixRowModel[]
  artifactCompleteness: WarroomArtifactCompleteness | undefined
  requiredArtifacts: string[]
  replayReliability: number | undefined
  p0: number
  p1: number
  deterministicRules: DeterministicRuleSummary
}) {
  const blockedRows = matrixRows.filter((row) => row.status === 'blocked' || row.status === 'missing')
  const readyRows = matrixRows.filter((row) => row.status === 'passed' || row.status === 'captured')
  const pendingRows = matrixRows.filter((row) => row.status === 'pending')
  const artifactPresent = artifactCompleteness?.present?.length ?? artifacts.length
  const artifactTotal = requiredArtifacts.length || Math.max(artifactPresent, 1)
  const artifactPercent = Math.min(100, Math.round((artifactPresent / artifactTotal) * 100))
  const readinessScore = typeof model.readiness_score === 'number'
    ? Math.round(model.readiness_score)
    : typeof gate.score === 'number'
      ? Math.round(gate.score)
      : undefined
  const replayPassed = model.replay?.passed ?? 0
  const replayTotal = model.replay?.total ?? 0
  const replayPercent = replayTotal > 0 ? Math.round((replayPassed / replayTotal) * 100) : undefined
  const gateBlocked = (gate.verdict ?? run.verdict ?? run.status).toLowerCase().includes('block') || blockedRows.length > 0 || gate.blockers.length > 0
  const decisionTone = gateBlocked ? 'error.main' : pendingRows.length > 0 ? 'warning.main' : 'success.main'
  const nextAction = gateBlocked
    ? t('productVerification.overviewResolveBlockers')
    : artifactCompleteness && !artifactCompleteness.complete
      ? t('hardcoded.missing.artifacts.d17dd24b')
      : t('productVerification.overviewReviewEvidence')
  const coverage = model.coverage
  const coverageSignals = [
    {
      label: t('hardcoded.observed.coverage.cbdbdf95'),
      value: coverage?.observed_coverage,
      tone: 'info.main',
    },
    {
      label: t('hardcoded.reachable.coverage.e4e2178c'),
      value: coverage?.reachable_coverage,
      tone: gateBlocked ? 'warning.main' : 'success.main',
    },
    {
      label: t('hardcoded.expected.coverage.3af2c1d5'),
      value: coverage?.expected_coverage,
      tone: 'primary.main',
    },
  ]
  const assuranceRows = [
    {
      icon: <ShieldCheck size={15} />,
      title: t('productVerification.gateVerdict'),
      value: gate.verdict ?? run.verdict ?? run.status,
      detail: formatGateScore(gate.score),
      tone: decisionTone,
      progress: readinessScore,
    },
    {
      icon: <Activity size={15} />,
      title: t('hardcoded.replay.reliability.0d427d49'),
      value: formatScore(replayReliability),
      detail: `${replayPassed}/${replayTotal || matrixRows.length} ${t('productVerification.matrixStatusPassed')}`,
      tone: replayReliability == null ? 'text.secondary' : replayReliability >= 0.95 ? 'success.main' : 'warning.main',
      progress: replayReliability == null ? replayPercent : Math.round((replayReliability <= 1 ? replayReliability * 100 : replayReliability)),
    },
    {
      icon: <FileJson size={15} />,
      title: t('productVerification.tabEvidencePack'),
      value: `${artifactPresent}/${artifactTotal}`,
      detail: artifactCompleteness?.complete ? t('productVerification.infoEvidenceComplete') : (artifactCompleteness?.missing ?? []).join(', ') || t('productVerification.infoPending'),
      tone: artifactCompleteness?.complete ? 'success.main' : 'warning.main',
      progress: artifactPercent,
    },
    {
      icon: <Network size={15} />,
      title: t('productVerification.eventStreamModel'),
      value: model.event_stream?.status ?? t('productVerification.infoPending'),
      detail: `${model.event_stream?.observed_count ?? model.event_stream?.observed_events?.length ?? 0} ${t('hardcoded.observed.events.d38e740b')}`,
      tone: model.event_stream?.fail_closed ? 'success.main' : model.event_stream?.status ? 'primary.main' : 'text.secondary',
      progress: model.event_stream?.fail_closed ? 100 : model.event_stream?.status ? 64 : 24,
    },
    {
      icon: <Clock size={15} />,
      title: t('productVerification.schedulerLoopModel'),
      value: model.scheduler_loop?.durable_job ? t('productVerification.matrixStatusCaptured') : t('productVerification.infoPending'),
      detail: t('productVerification.matrixSchedulerEvidence', {
        scanner: model.scheduler_loop?.scanner_id || 'product_verification',
        runs: model.scheduler_loop?.run_count ?? 0,
        failures: model.scheduler_loop?.fail_count ?? 0,
      }),
      tone: model.scheduler_loop?.durable_job ? 'success.main' : 'warning.main',
      progress: model.scheduler_loop?.durable_job ? 88 : 36,
    },
  ]
  const visibleBlockers = gate.blockers.length > 0
    ? gate.blockers.slice(0, 4)
    : blockedRows.slice(0, 4).map((row) => `${row.title}: ${matrixStatusLabel(row.status)}`)

  return (
    <Stack spacing={1.35} sx={{ minHeight: '100%', pb: 0.5 }}>
      <Paper
        variant="outlined"
        sx={{
          borderRadius: 1,
          overflow: 'hidden',
          position: 'relative',
          borderColor: (theme) => alpha(resolveToneColor(theme, decisionTone), theme.palette.mode === 'dark' ? 0.42 : 0.32),
          bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.78 : 0.94),
          backgroundImage: (theme) =>
            `linear-gradient(90deg, ${alpha(resolveToneColor(theme, decisionTone), theme.palette.mode === 'dark' ? 0.16 : 0.08)}, transparent 38%),
             linear-gradient(${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.07 : 0.035)} 1px, transparent 1px),
             linear-gradient(90deg, ${alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.055 : 0.03)} 1px, transparent 1px)`,
          backgroundSize: 'auto, 28px 28px, 28px 28px',
        }}
      >
        <TechCorners tone={decisionTone} />
        <Box sx={{ position: 'relative', zIndex: 2, p: { xs: 1.5, md: 2 } }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }}>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip size="small" icon={<ShieldCheck size={14} />} label={t('productVerification.automationTests')} sx={{ height: 24, fontWeight: 900 }} />
                <Chip
                  size="small"
                  label={`${readyRows.length}/${matrixRows.length} ${t('productVerification.matrixStatusCaptured')}`}
                  sx={{
                    height: 24,
                    fontWeight: 900,
                    color: decisionTone,
                    bgcolor: (theme) => alpha(resolveToneColor(theme, decisionTone), theme.palette.mode === 'dark' ? 0.16 : 0.1),
                  }}
                />
              </Stack>
              <Typography variant="h5" sx={{ mt: 0.8, fontWeight: 950, lineHeight: 1.12, letterSpacing: 0 }}>
                {t('productVerification.testingMatrixTitle')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.45, maxWidth: 840, lineHeight: 1.55 }}>
                {t('productVerification.testingMatrixSubtitle')}
              </Typography>
            </Box>
            <Box
              sx={{
                minWidth: { xs: 0, lg: 280 },
                border: 1,
                borderColor: (theme) => alpha(resolveToneColor(theme, decisionTone), theme.palette.mode === 'dark' ? 0.38 : 0.26),
                borderRadius: 1,
                p: 1.25,
                bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.56 : 0.8),
              }}
            >
              <Typography variant="caption" color="text.secondary" fontWeight={850}>
                {t('productVerification.overviewNextAction')}
              </Typography>
              <Typography variant="body1" sx={{ mt: 0.25, fontWeight: 950, color: decisionTone }}>
                {nextAction}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35 }} noWrap title={run.targetUrl}>
                {targetHost(run.targetUrl) || run.repoId || run.id}
              </Typography>
            </Box>
          </Stack>

          <Box sx={{ mt: 1.35, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1 }}>
            <AutomationDecisionMetric
              label={t('productVerification.gateScore')}
              value={readinessScore == null ? formatGateScore(gate.score) : `${readinessScore}`}
              detail={gate.verdict ?? run.verdict ?? run.status}
              tone={decisionTone}
            />
            <AutomationDecisionMetric
              label={t('hardcoded.replay.reliability.0d427d49')}
              value={formatScore(replayReliability)}
              detail={`${replayPassed}/${replayTotal || matrixRows.length} ${t('productVerification.replayTimeline')}`}
              tone={replayReliability == null ? 'text.secondary' : replayReliability >= 0.95 ? 'success.main' : 'warning.main'}
            />
            <AutomationDecisionMetric
              label={t('productVerification.tabEvidencePack')}
              value={`${artifactPercent}%`}
              detail={`${artifactPresent}/${artifactTotal} ${t('productVerification.tabEvidencePack')}`}
              tone={artifactCompleteness?.complete ? 'success.main' : 'warning.main'}
            />
            <AutomationDecisionMetric
              label="P0 / P1"
              value={`${p0} / ${p1}`}
              detail={`${deterministicRules.total} ${t('productVerification.deterministicRules')}`}
              tone={p0 > 0 ? 'error.main' : p1 > 0 || deterministicRules.total > 0 ? 'warning.main' : 'success.main'}
            />
          </Box>
        </Box>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 0.62fr) minmax(320px, 0.38fr)' }, gap: 1.25, minHeight: 0 }}>
        <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
          <SectionHeader icon={<GitBranch size={16} />} title={t('productVerification.evidencePipeline')} />
          <Box sx={{ p: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(5, minmax(0, 1fr))' }, gap: 0.85 }}>
            {assuranceRows.map((row) => (
              <AutomationAssuranceTile key={row.title} {...row} />
            ))}
          </Box>
          <Box sx={{ px: 1.5, pb: 1.5, display: 'grid', gap: 0.85 }}>
            {coverageSignals.map((item) => (
              <AutomationCoverageRail key={item.label} label={item.label} value={item.value} tone={item.tone} />
            ))}
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
          <SectionHeader icon={<AlertTriangle size={16} />} title={t('productVerification.overviewNextAction')} />
          <Box sx={{ p: 1.5 }}>
            {visibleBlockers.length > 0 ? (
              <Stack spacing={0.85}>
                {visibleBlockers.map((blocker, index) => (
                  <Box
                    key={`${blocker}-${index}`}
                    sx={{
                      border: 1,
                      borderColor: (theme) => alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.36 : 0.28),
                      borderRadius: 1,
                      p: 1,
                      display: 'grid',
                      gridTemplateColumns: 'auto minmax(0, 1fr)',
                      gap: 0.85,
                      bgcolor: (theme) => alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.1 : 0.07),
                    }}
                  >
                    <Box sx={{ color: 'warning.main', display: 'flex', mt: 0.25 }}>
                      <AlertTriangle size={15} />
                    </Box>
                    <Typography variant="body2" fontWeight={850} sx={{ overflowWrap: 'anywhere', lineHeight: 1.45 }}>
                      {blocker}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Box
                sx={{
                  border: 1,
                  borderColor: (theme) => alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.34 : 0.25),
                  borderRadius: 1,
                  p: 1.25,
                  bgcolor: (theme) => alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.09 : 0.06),
                }}
              >
                <Typography variant="body2" fontWeight={950} color="success.main">
                  {t('productVerification.overviewReviewEvidence')}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.4, lineHeight: 1.55 }}>
                  {run.evidenceSig ?? t('productVerification.infoEvidenceComplete')}
                </Typography>
              </Box>
            )}
            {(artifactCompleteness?.missing ?? []).length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={850}>
                  {t('hardcoded.missing.artifacts.d17dd24b')}
                </Typography>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                  {(artifactCompleteness?.missing ?? []).map((kind) => (
                    <Chip key={kind} size="small" variant="outlined" color="warning" label={formatScoreKey(kind)} />
                  ))}
                </Stack>
              </Box>
            )}
          </Box>
        </Paper>
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', flex: 1, minHeight: 0 }}>
        <SectionHeader icon={<ShieldCheck size={16} />} title={t('hardcoded.evidence.matrix.7adfb5df')} />
        <Box sx={{ p: 1.5, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 0.85 }}>
          {matrixRows.map((row) => (
            <AutomationMatrixTile key={row.id} row={row} />
          ))}
        </Box>
      </Paper>
    </Stack>
  )
}

function AutomationDecisionMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone: string
}) {
  return (
    <Box
      sx={{
        minWidth: 0,
        border: 1,
        borderColor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.32 : 0.24),
        borderRadius: 1,
        p: 1.1,
        bgcolor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.1 : 0.055),
      }}
    >
      <Typography variant="caption" color="text.secondary" fontWeight={850} noWrap>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.25, fontSize: 26, lineHeight: 1, fontWeight: 950, color: tone }} noWrap>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.45 }} noWrap title={detail}>
        {detail}
      </Typography>
    </Box>
  )
}

function AutomationAssuranceTile({
  icon,
  title,
  value,
  detail,
  tone,
  progress,
}: {
  icon: ReactNode
  title: string
  value: string
  detail: string
  tone: string
  progress?: number
}) {
  const normalized = typeof progress === 'number' && Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0

  return (
    <Box
      sx={{
        minWidth: 0,
        border: 1,
        borderColor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.26 : 0.2),
        borderRadius: 1,
        p: 1,
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr) auto',
        gap: 0.75,
        bgcolor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.075 : 0.045),
      }}
    >
      <Stack direction="row" spacing={0.7} alignItems="center" sx={{ minWidth: 0 }}>
        <Box sx={{ color: tone, display: 'flex' }}>{icon}</Box>
        <Typography variant="caption" color="text.secondary" fontWeight={850} noWrap>
          {title}
        </Typography>
      </Stack>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={950} sx={{ color: tone, lineHeight: 1.15 }} noWrap title={value}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35 }} noWrap title={detail}>
          {detail}
        </Typography>
      </Box>
      <Box sx={{ height: 5, borderRadius: 999, overflow: 'hidden', bgcolor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.08) }}>
        <Box
          sx={{
            height: '100%',
            width: `${normalized}%`,
            borderRadius: 999,
            bgcolor: tone,
          }}
        />
      </Box>
    </Box>
  )
}

function AutomationCoverageRail({ label, value, tone }: { label: string; value: number | undefined; tone: string }) {
  const normalized = typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value <= 1 ? value * 100 : value))
    : 0

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '190px minmax(0, 1fr) auto' }, gap: 1, alignItems: 'center' }}>
      <Typography variant="caption" fontWeight={850} color="text.secondary" noWrap>
        {label}
      </Typography>
      <Box sx={{ height: 7, borderRadius: 999, overflow: 'hidden', bgcolor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.14 : 0.07) }}>
        <Box sx={{ height: '100%', width: `${normalized}%`, borderRadius: 999, bgcolor: tone }} />
      </Box>
      <Typography variant="caption" fontWeight={900} sx={{ color: tone }}>
        {formatScore(value)}
      </Typography>
    </Box>
  )
}

function AutomationMatrixTile({ row }: { row: VerificationMatrixRowModel }) {
  const tone = matrixStatusTone(row.status)

  return (
    <Box
      sx={{
        minWidth: 0,
        border: 1,
        borderColor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.32 : 0.22),
        borderRadius: 1,
        p: 1,
        bgcolor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.075 : 0.04),
      }}
    >
      <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="space-between" sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={950} noWrap title={row.title}>
          {row.title}
        </Typography>
        <Chip
          size="small"
          label={matrixStatusLabel(row.status)}
          sx={{
            height: 22,
            flexShrink: 0,
            color: tone,
            bgcolor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.15 : 0.09),
            fontWeight: 900,
          }}
        />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.45, lineHeight: 1.45 }} noWrap title={row.evidence}>
        {row.evidence}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35 }} noWrap title={row.owner}>
        {t('productVerification.matrixOwner')}: {row.owner}
      </Typography>
    </Box>
  )
}

function ReplayStepRow({
  step,
  index,
}: {
  step: NonNullable<NonNullable<WarroomEvidencePack['run']>['results']>[number]
  index: number
}) {
  const status = step.status ?? 'unknown'
  const assertionSummary = step.assertions && step.assertions.length > 0
    ? `${step.assertions.filter((assertion) => assertion.passed).length}/${step.assertions.length} assertions`
    : 'no assertions'

  return (
    <Box sx={{ p: 1.5, border: 1, borderColor: status === 'failed' ? 'error.main' : 'divider', borderRadius: 1, minWidth: 0 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Chip size="small" color={statusColor[status] ?? 'default'} label={status} />
            <Typography variant="body2" fontWeight={850} sx={{ overflowWrap: 'anywhere' }}>{step.id ?? step.name ?? `step_${index + 1}`}</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, overflowWrap: 'anywhere' }}>
            {step.module ?? 'unknown module'} · {assertionSummary}
          </Typography>
          {step.error && (
            <Typography variant="body2" color="error.main" sx={{ mt: 0.75, overflowWrap: 'anywhere' }}>
              {step.error}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
          {step.severity && <Chip size="small" variant="outlined" label={step.severity} />}
          {typeof step.duration_ms === 'number' && <Chip size="small" variant="outlined" label={`${Math.round(step.duration_ms)} ms`} />}
        </Stack>
      </Stack>
    </Box>
  )
}

function GhostApiSampleList({ model }: { model: WarroomAutomationTestModel }) {
  const samples: Array<Record<string, unknown> & { type: string }> = [
    ...(model.ghost_api?.type_a ?? []).map((item) => ({ ...item, type: 'Type A' })),
    ...(model.ghost_api?.type_b ?? []).map((item) => ({ ...item, type: 'Type B' })),
    ...(model.ghost_api?.type_c ?? []).map((item) => ({ ...item, type: 'Type C' })),
  ].slice(0, 6)

  if (samples.length === 0) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {t('productVerification.noGhostApiFindings')}
      </Typography>
    )
  }

  return (
    <Stack spacing={0.75} sx={{ mt: 1 }}>
      {samples.map((sample, index) => (
        <ContractRow
          key={`${sample.type}-${String(sample.id ?? index)}`}
          label={sample.type}
          value={`${String(sample.method ?? 'GET')} ${String(sample.url ?? 'unknown')} ${sample.status ? `(${String(sample.status)})` : ''}`}
        />
      ))}
    </Stack>
  )
}

function CodePreview({ value }: { value: string }) {
  return (
    <FlytoCodeBlock value={value} minHeight={180} maxHeight={360} />
  )
}

function buildVerificationMatrix(
  run: WarroomCampaignExecution | undefined,
  pack: WarroomEvidencePack | null,
  artifacts: WarroomEvidenceArtifact[],
  gate: EvidenceGateSummary,
): VerificationMatrixRowModel[] {
  const model = normalizeAutomationModel(pack, artifacts, gate)
  const artifactCompleteness = model.evidence_chain?.artifact_completeness ?? gate.artifactCompleteness
  const replayTotal = model.replay?.total ?? pack?.run?.results?.length ?? 0
  const replayFailed = model.replay?.failed ?? pack?.run?.results?.filter((step) => step.status === 'failed').length ?? 0
  const scenarioSteps = model.scenario_synthesis?.step_count ?? pack?.scenarios?.steps?.length ?? 0
  const graph = pack?.site_graph
  const stateCount = graph?.state_graph?.allowed_states?.length ?? graph?.pages?.flatMap((page) => page.states ?? []).length ?? 0
  const hasScreenshot = artifacts.some((artifact) => artifact.kind === 'screenshot' || artifact.mimeType?.startsWith('image/')) || !!model.evidence_chain?.has_screenshot
  const hasDom = artifacts.some((artifact) => artifact.kind === 'dom_snapshot') || !!model.evidence_chain?.has_dom_snapshot
  const hasNetwork = artifacts.some((artifact) => artifact.kind === 'network_log') || !!model.evidence_chain?.has_network_log
  const hasRunner = !!run?.runnerExecutionId
  const rbac = model.rbac_matrix
  const auth = model.authorization_gate
  const eventStream = model.event_stream
  const scheduler = model.scheduler_loop

  return [
    {
      id: 'backend',
      title: t('productVerification.matrixBackendTitle'),
      detail: t('productVerification.matrixBackendDetail'),
      status: auth?.fail_closed ? 'passed' : auth?.status && auth.status !== 'not_provided' ? 'captured' : 'pending',
      evidence: `${auth?.authority ?? 'flyto-engine'} · ${auth?.org_gate ?? 'requireOrgAccess'} · ${auth?.commercial_gate ?? 'requireCommercialAction'}`,
      owner: 'flyto-engine',
    },
    {
      id: 'api',
      title: t('productVerification.matrixApiTitle'),
      detail: t('productVerification.matrixApiDetail'),
      status: gate.verdict === 'blocked' ? 'blocked' : gate.hasGateMetadata ? 'captured' : 'pending',
      evidence: `${gate.verdict ?? t('common.notAvailable')} · ${formatGateScore(gate.score)}`,
      owner: 'flyto-engine',
    },
    {
      id: 'ui',
      title: t('productVerification.matrixUiTitle'),
      detail: t('productVerification.matrixUiDetail'),
      status: scenarioSteps > 0 && stateCount > 0 ? 'captured' : scenarioSteps > 0 ? 'pending' : 'missing',
      evidence: t('productVerification.matrixUiEvidence', { steps: scenarioSteps, states: stateCount }),
      owner: 'flyto-code',
    },
    {
      id: 'browser',
      title: t('productVerification.matrixBrowserTitle'),
      detail: t('productVerification.matrixBrowserDetail'),
      status: replayTotal === 0 ? 'pending' : replayFailed > 0 ? 'blocked' : 'passed',
      evidence: t('productVerification.matrixReplayEvidence', { passed: model.replay?.passed ?? 0, total: replayTotal, reliability: formatScore(model.replay?.reliability) }),
      owner: 'flyto-core',
    },
    {
      id: 'evidence',
      title: t('productVerification.matrixEvidenceTitle'),
      detail: t('productVerification.matrixEvidenceDetail'),
      status: artifactCompleteness?.complete ? 'passed' : artifactCompleteness ? 'missing' : hasScreenshot || hasDom || hasNetwork ? 'captured' : 'pending',
      evidence: t('productVerification.matrixArtifactEvidence', {
        screenshot: hasScreenshot ? t('productVerification.matrixArtifactScreenshot') : t('productVerification.matrixArtifactNoScreenshot'),
        dom: hasDom ? t('productVerification.matrixArtifactDom') : t('productVerification.matrixArtifactNoDom'),
        network: hasNetwork ? t('productVerification.matrixArtifactNetwork') : t('productVerification.matrixArtifactNoNetwork'),
        signature: run?.evidenceSig ?? t('common.notAvailable'),
      }),
      owner: 'flyto-engine / flyto-core',
    },
    {
      id: 'rbac',
      title: t('productVerification.matrixRbacTitle'),
      detail: t('productVerification.matrixRbacDetail'),
      status: rbac?.fail_open_disallowed && rbac?.fail_closed ? 'passed' : rbac?.status && rbac.status !== 'not_provided' ? 'blocked' : 'pending',
      evidence: t('productVerification.matrixRbacEvidence', { roles: rbac?.roles_tested?.length ?? 0, tenants: rbac?.tenant_pairs_tested ?? 0, isolation: rbac?.tenant_isolation ?? t('common.notAvailable') }),
      owner: 'flyto-engine',
    },
    {
      id: 'events',
      title: t('productVerification.matrixSseTitle'),
      detail: t('productVerification.matrixSseDetail'),
      status: eventStream?.fail_closed ? 'passed' : eventStream?.status && eventStream.status !== 'not_provided' ? 'captured' : 'pending',
      evidence: t('productVerification.matrixSseEvidence', { transport: eventStream?.transport || 'SSE', events: eventStream?.expected_events?.join(', ') || t('common.notAvailable'), observed: eventStream?.observed_count ?? 0 }),
      owner: 'flyto-engine / flyto-code',
    },
    {
      id: 'scheduler',
      title: t('productVerification.matrixSchedulerTitle'),
      detail: t('productVerification.matrixSchedulerDetail'),
      status: scheduler?.durable_job && hasRunner ? 'passed' : scheduler?.durable_job ? 'captured' : 'pending',
      evidence: t('productVerification.matrixSchedulerEvidence', { scanner: scheduler?.scanner_id || 'product_verification', runs: scheduler?.run_count ?? 0, failures: scheduler?.fail_count ?? 0 }),
      owner: 'flyto-engine',
    },
    {
      id: 'i18n',
      title: t('productVerification.matrixI18nTitle'),
      detail: t('productVerification.matrixI18nDetail'),
      status: 'captured',
      evidence: t('productVerification.matrixI18nEvidence'),
      owner: 'flyto-i18n / flyto-code',
    },
  ]
}

function VerificationMatrixRow({ row }: { row: VerificationMatrixRowModel }) {
  return (
    <Box sx={{ border: 1, borderColor: row.status === 'blocked' || row.status === 'missing' ? 'warning.main' : 'divider', borderRadius: 1, p: 1.5, minWidth: 0 }}>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', lg: 'center' }} justifyContent="space-between">
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Chip size="small" color={matrixStatusColor(row.status)} label={matrixStatusLabel(row.status)} />
            <Typography variant="body2" fontWeight={850} sx={{ overflowWrap: 'anywhere' }}>{row.title}</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.5 }}>
            {row.detail}
          </Typography>
        </Box>
        <Box sx={{ minWidth: { xs: 0, lg: 320 }, maxWidth: { lg: 520 } }}>
          <Typography variant="caption" color="text.secondary">{t('productVerification.matrixEvidence')}</Typography>
          <Typography variant="body2" sx={flytoTextStyles.codeValue}>{row.evidence}</Typography>
          <Typography variant="caption" color="text.secondary">{t('productVerification.matrixOwner')}: {row.owner}</Typography>
        </Box>
      </Stack>
    </Box>
  )
}

function matrixStatusColor(status: VerificationMatrixStatus): 'default' | 'primary' | 'success' | 'error' | 'warning' {
  if (status === 'passed') return 'success'
  if (status === 'captured') return 'primary'
  if (status === 'blocked') return 'error'
  if (status === 'missing') return 'warning'
  return 'default'
}

function matrixStatusTone(status: VerificationMatrixStatus) {
  if (status === 'passed') return 'success.main'
  if (status === 'captured') return 'primary.main'
  if (status === 'blocked') return 'error.main'
  if (status === 'missing') return 'warning.main'
  return 'text.secondary'
}

function matrixStatusLabel(status: VerificationMatrixStatus) {
  if (status === 'passed') return t('productVerification.matrixStatusPassed')
  if (status === 'captured') return t('productVerification.matrixStatusCaptured')
  if (status === 'blocked') return t('productVerification.matrixStatusBlocked')
  if (status === 'missing') return t('productVerification.matrixStatusMissing')
  return t('productVerification.matrixStatusPending')
}

function normalizeAutomationModel(
  pack: WarroomEvidencePack | null,
  artifacts: WarroomEvidenceArtifact[],
  gate: EvidenceGateSummary,
): WarroomAutomationTestModel {
  if (pack?.automation_test_model) return pack.automation_test_model
  const graph = pack?.site_graph
  const scores = pack?.scores ?? graph?.scores ?? {}
  const replaySummary = pack?.run?.evaluation?.summary ?? pack?.run_evaluation?.summary ?? {}
  const replaySteps = pack?.run?.results ?? []
  const findings = normalizeEvidenceFindings(pack)
  const stateFindings = findings.filter((finding) => (finding.code ?? finding.type) === 'state_contradiction')
  const artifactCompleteness = gate.artifactCompleteness
  const artifactKinds = new Set(artifacts.map((artifact) => artifact.kind))
  const required = artifactCompleteness?.required ?? ['screenshot', 'dom_snapshot', 'network_log']
  const present = artifactCompleteness?.present ?? required.filter((kind) => artifactKinds.has(kind))
  return {
    schema_version: 'flyto.core.deterministic_verification.v1',
    legacy_schema_version: 'warroom.automation_test_model.fallback.v1',
    product_contract: 'flyto2.automated_product_testing.v1',
    product_surface: 'warroom',
    capability: 'automated_product_testing',
    engine_mode: {
      name: t('hardcoded.deterministic.verification.runtime.84242c34'),
      execution_mode: 'deterministic_evidence_first',
      llm_required: false,
      llm_role: 'optional_evidence_reviewer',
      fact_source: 'browser_dom_network_screenshot_sse',
      gate_authority: 'deterministic_evidence_gate',
      human_editable_yaml: true,
    },
    deterministic_contract: {
      inputs: ['site_graph', 'intent_graph', 'state_graph', 'api_graph', 'yaml_replay', 'browser_artifacts', 'event_stream'],
      outputs: ['evidence_pack', 'gate_verdict', 'readiness_score', 'state_contradictions', 'ghost_api_findings', 'replay_evidence'],
      llm_can_create_facts: false,
      llm_can_gate: false,
    },
    readiness_score: gate.score,
    coverage: {
      observed_paths: graph?.observed_paths ?? [],
      reachable_paths: graph?.reachable_paths ?? graph?.observed_paths ?? [],
      expected_paths: graph?.reachable_paths ?? graph?.observed_paths ?? [],
      blocked_paths: [],
      observed_coverage: readNumber(scores, 'observed_coverage') ?? 0,
      reachable_coverage: readNumber(scores, 'reachable_coverage') ?? 0,
      expected_coverage: readNumber(scores, 'reachable_coverage') ?? 0,
    },
    intent_graph: {
      count: graph?.intents?.length ?? 0,
      intents: graph?.intents ?? [],
    },
    scenario_synthesis: {
      schema_version: pack?.scenarios?.schema_version,
      name: pack?.scenarios?.name,
      step_count: pack?.scenarios?.steps?.length ?? 0,
      replayable_steps: pack?.scenarios?.steps?.filter((step) => step.module).length ?? 0,
      generated_from: pack?.scenarios?.generated_from,
    },
    replay: {
      ok: pack?.run?.replay_ok ?? pack?.run?.evaluation?.passed,
      total: readNumber(replaySummary, 'total') ?? replaySteps.length,
      passed: readNumber(replaySummary, 'passed') ?? replaySteps.filter((step) => step.status === 'passed').length,
      failed: readNumber(replaySummary, 'failed') ?? replaySteps.filter((step) => step.status === 'failed').length,
      reliability: readNumber(replaySummary, 'replay_reliability') ?? readNumber(scores, 'replay_reliability') ?? 0,
      steps: replaySteps,
    },
    ghost_api: {
      type_a_count: findings.filter((finding) => finding.code === 'ghost_api_type_a').length,
      type_b_count: findings.filter((finding) => finding.code === 'ghost_api_type_b').length,
      type_c_count: findings.filter((finding) => finding.code === 'ghost_api_type_c').length,
      type_a: [],
      type_b: [],
      type_c: [],
      has_findings: findings.some((finding) => String(finding.code ?? '').startsWith('ghost_api')),
    },
    deterministic_rules: {
      required: [...deterministicRuleOrder],
      counts: Object.fromEntries(deterministicRuleOrder.map((code) => [
        code,
        findings.filter((finding) => (finding.code ?? finding.type) === code).length,
      ])),
      samples: Object.fromEntries(deterministicRuleOrder.map((code) => [
        code,
        findings.filter((finding) => (finding.code ?? finding.type) === code).slice(0, 8),
      ])),
      has_blockers: deterministicRuleOrder.some((code) => findings.some((finding) => (finding.code ?? finding.type) === code)),
    },
    business_invariants: {
      state_contradictions: stateFindings.length,
      p0: readNumber(scores, 'p0') ?? 0,
      p1: readNumber(scores, 'p1') ?? 0,
      findings: stateFindings,
    },
    rbac_matrix: {
      status: 'not_provided',
      authority: 'flyto-engine',
      source: 'flyto-engine.requireOrgAccess+requireCommercialAction+verified_scope',
      action: 'scan:trigger',
      roles_required: ['owner', 'admin', 'member', 'viewer'],
      role_expectations: {
        owner: 'allow',
        admin: 'allow',
        member: 'allow',
        viewer: 'deny',
      },
      roles_tested: [],
      tenant_pairs_tested: 0,
      tenant_isolation: 'not_captured',
      fail_closed: false,
      fail_open_disallowed: false,
      frontend_authority: false,
      violations: [],
    },
    authorization_gate: {
      status: 'not_provided',
      authority: 'flyto-engine',
      org_gate: 'requireOrgAccess',
      commercial_gate: 'requireCommercialAction',
      scope_gate: 'verified_repo_or_domain',
      capability_gate: 'automated_product_testing',
      frontend_authority: false,
      fail_closed: false,
    },
    event_stream: {
      status: 'not_provided',
      transport: '',
      endpoint: '',
      expected_events: [],
      expected_payload_fields: [],
      observed_events: [],
      observed_count: 0,
      fail_closed: false,
      source: '',
    },
    scheduler_loop: {
      status: 'not_provided',
      scanner_id: '',
      authority: '',
      enabled: null,
      dispatch_source: '',
      manual_run_endpoint: '',
      scheduler_control_endpoint: '',
      durable_job: false,
      last_run_status: '',
      run_count: 0,
      fail_count: 0,
    },
    evidence_chain: {
      artifact_completeness: artifactCompleteness ?? {
        required,
        present,
        missing: required.filter((kind) => !present.includes(kind)),
        complete: required.every((kind) => present.includes(kind)),
        score: required.length ? present.length / required.length : 0,
      },
      has_screenshot: present.includes('screenshot'),
      has_dom_snapshot: present.includes('dom_snapshot'),
      has_network_log: present.includes('network_log'),
      evidence_signature_expected: true,
    },
    gate: {
      verdict: gate.verdict,
      score: gate.score,
      blockers: gate.blockers,
    },
  }
}

function ScrollTabPanel({ active, value, children, scroll = true }: { active: boolean; value: VerificationTab; children: ReactNode; scroll?: boolean }) {
  if (!active) return null

  return (
    <Box
      role="tabpanel"
      id={`product-verification-panel-${value}`}
      aria-labelledby={`product-verification-tab-${value}`}
      sx={{
        height: '100%',
        minHeight: 0,
        overflowY: scroll ? 'auto' : 'hidden',
        overflowX: 'hidden',
        pr: 0.5,
        display: 'flex',
        flexDirection: 'column',
        gap: scroll ? 2 : 0,
      }}
    >
      {children}
    </Box>
  )
}

function SectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ display: 'flex', color: 'primary.main' }}>{icon}</Box>
      <Typography variant="subtitle2" fontWeight={800}>{title}</Typography>
    </Box>
  )
}

function ProductVerificationEvidencePanel({
  selectedRun,
  evidencePack,
  artifacts,
  evidenceSig,
  gate,
  findings,
  loading,
  error,
  success,
  onRetry,
}: {
  selectedRun?: WarroomCampaignExecution
  evidencePack: WarroomEvidencePack | null
  artifacts: WarroomEvidenceArtifact[]
  evidenceSig?: string
  gate: EvidenceGateSummary
  findings: WarroomEvidenceFinding[]
  loading: boolean
  error: unknown
  success: boolean
  onRetry: () => void
}) {
  const model = normalizeAutomationModel(evidencePack, artifacts, gate)
  const graph = evidencePack?.site_graph
  const pages = graph?.pages?.length ?? 0
  const intents = graph?.intents?.length ?? 0
  const observedStates = Array.from(new Set((graph?.pages ?? []).flatMap((page) => page.states ?? []))).length
  const replaySteps = model.replay?.total ?? model.replay?.steps?.length ?? evidencePack?.run?.results?.length ?? 0
  const scoreRows = Object.keys(gate.scoreBreakdown).length
  const artifactCompleteness = gate.artifactCompleteness
  const artifactTotal = artifactCompleteness?.required?.length ?? 3
  const artifactPresent = artifactCompleteness?.present?.length ?? artifacts.length
  const missingArtifacts = artifactCompleteness?.missing ?? []
  const hasRunner = Boolean(selectedRun?.runnerExecutionId)
  const hasEvidence = Boolean(evidencePack || evidenceSig || selectedRun?.evidenceSig || artifactPresent > 0)
  const evidenceGapCount = gate.blockers.length + missingArtifacts.length + (success && artifacts.length === 0 ? 1 : 0)
  const gateStatus: VerificationMatrixStatus = gate.blockers.length > 0 ? 'blocked' : gate.verdict ? 'passed' : hasEvidence ? 'captured' : 'pending'
  const runnerStatus: VerificationMatrixStatus = hasRunner ? 'captured' : selectedRun ? 'pending' : 'missing'
  const artifactStatus: VerificationMatrixStatus = artifactPresent > 0 ? 'captured' : hasRunner || success ? 'missing' : 'pending'
  const gapStatus: VerificationMatrixStatus = evidenceGapCount > 0 ? 'blocked' : hasEvidence ? 'passed' : 'pending'
  const stageStatus = (count: number): VerificationMatrixStatus => (count > 0 ? 'captured' : hasEvidence ? 'missing' : 'pending')
  const selectedRunLabel = selectedRun?.id ?? t('productVerification.infoNone')
  const evidenceSignature = selectedRun?.evidenceSig ?? evidenceSig ?? t('productVerification.infoPending')
  const nextActionValue = evidenceGapCount > 0 ? String(evidenceGapCount) : hasEvidence ? t('productVerification.matrixStatusPassed') : t('productVerification.infoNeedsTarget')
  const nextActionDetail = evidenceGapCount > 0
    ? t('productVerification.overviewResolveBlockers')
    : hasEvidence
      ? t('productVerification.overviewReviewEvidence')
      : t('productVerification.commandSubtitle')

  const pipelineSteps = [
    {
      icon: <Network size={16} />,
      title: t('productVerification.discoveryEvidence'),
      detail: t('productVerification.pipelineDiscoveryDetail'),
      value: String(pages),
      status: stageStatus(pages),
    },
    {
      icon: <GitBranch size={16} />,
      title: t('productVerification.intentGraph'),
      detail: t('productVerification.pipelineIntentDetail'),
      value: String(intents),
      status: stageStatus(intents),
    },
    {
      icon: <Activity size={16} />,
      title: t('productVerification.stateApiGraph'),
      detail: t('productVerification.pipelineStateDetail'),
      value: String(observedStates),
      status: stageStatus(observedStates),
    },
    {
      icon: <Play size={16} />,
      title: t('productVerification.replayTimeline'),
      detail: t('productVerification.pipelineReplayDetail'),
      value: String(replaySteps),
      status: stageStatus(replaySteps),
    },
    {
      icon: <FileJson size={16} />,
      title: t('productVerification.rawEvidencePack'),
      detail: t('productVerification.pipelineEvidenceDetail'),
      value: `${artifactPresent}/${artifactTotal}`,
      status: artifactStatus,
    },
    {
      icon: <ShieldCheck size={16} />,
      title: t('productVerification.deterministicRules'),
      detail: t('productVerification.pipelineGateDetail'),
      value: gate.hasGateMetadata ? formatGateScore(gate.score) : String(scoreRows),
      status: gateStatus,
    },
  ] satisfies Array<{ icon: ReactNode; title: string; detail: string; value: string; status: VerificationMatrixStatus }>

  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 1.25, overflow: 'hidden' }}>
      <Paper
        variant="outlined"
        sx={{
          borderRadius: 1,
          overflow: 'hidden',
          borderColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.28 : 0.18),
          bgcolor: (theme) => (theme.palette.mode === 'dark' ? alpha(theme.palette.background.paper, 0.84) : alpha(theme.palette.background.paper, 0.98)),
        }}
      >
        <Box sx={{ p: 1.25, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1 }}>
          <EvidenceSignalCard
            icon={<ShieldCheck size={17} />}
            label={t('productVerification.gateVerdict')}
            value={gate.verdict ?? t('productVerification.infoUnknown')}
            detail={formatGateScore(gate.score)}
            status={gateStatus}
          />
          <EvidenceSignalCard
            icon={<FileJson size={17} />}
            label={t('productVerification.matrixEvidence')}
            value={`${artifactPresent}/${artifactTotal}`}
            detail={missingArtifacts.length > 0 ? missingArtifacts.join(', ') : t('productVerification.overviewReviewEvidence')}
            status={artifactStatus}
          />
          <EvidenceSignalCard
            icon={<Activity size={17} />}
            label={t('productVerification.runnerExecution')}
            value={hasRunner ? t('productVerification.infoRunnerLinked') : t('productVerification.infoNoRunner')}
            detail={selectedRunLabel}
            status={runnerStatus}
          />
          <EvidenceSignalCard
            icon={<AlertTriangle size={17} />}
            label={t('productVerification.overviewNextAction')}
            value={nextActionValue}
            detail={nextActionDetail}
            status={gapStatus}
          />
        </Box>
      </Paper>

      <Box
        sx={{
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 0.92fr) minmax(340px, 0.58fr)' },
          gridTemplateRows: { xs: 'minmax(280px, 0.8fr) minmax(320px, 1fr)', xl: 'minmax(0, 1fr)' },
          gap: 1.25,
          overflow: 'hidden',
        }}
      >
        <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <SectionHeader icon={<GitBranch size={16} />} title={t('productVerification.evidencePipeline')} />
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ px: 1.25, py: 1, borderBottom: 1, borderColor: 'divider' }}>
            {pipelineSteps.map((step) => (
              <Chip
                key={step.title}
                size="small"
                label={`${step.title} ${step.value}`}
                sx={{
                  height: 24,
                  fontWeight: 850,
                  color: matrixStatusTone(step.status),
                  bgcolor: (theme) => alpha(resolveToneColor(theme, matrixStatusTone(step.status)), theme.palette.mode === 'dark' ? 0.14 : 0.08),
                }}
              />
            ))}
          </Stack>
          <Box
            sx={{
              minHeight: 0,
              overflowY: 'auto',
              p: 1.25,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' },
              alignContent: 'start',
              gap: 1,
            }}
          >
            {pipelineSteps.map((step) => (
              <PipelineStep key={step.title} {...step} />
            ))}
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <SectionHeader icon={<FileJson size={16} />} title={t('productVerification.latestEvidence')} />
          <Box sx={{ minHeight: 0, overflowY: 'auto', p: 1.25, display: 'grid', gap: 1.1, alignContent: 'start' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 0.85 }}>
              <EvidenceDatum label={t('productVerification.selectedRun')} value={selectedRunLabel} />
              <EvidenceDatum label={t('productVerification.evidenceSig')} value={evidenceSignature} tone={hasEvidence ? 'success.main' : 'text.secondary'} />
              <EvidenceDatum label={t('productVerification.runnerExecution')} value={selectedRun?.runnerExecutionId ?? t('productVerification.infoNoRunner')} tone={hasRunner ? 'success.main' : 'warning.main'} />
              <EvidenceDatum label={t('productVerification.updatedAt')} value={formatDate(selectedRun?.updatedAt) || t('productVerification.infoNone')} />
            </Box>

            {selectedRun && !selectedRun.runnerExecutionId && (
              <Alert severity="info">
                {t('productVerification.evidenceWaitingForRunner')}
              </Alert>
            )}
            {loading && <LinearProgress />}
            {error != null && <QueryError compact error={error} onRetry={onRetry} label={t('productVerification.latestEvidence')} />}
            {success && artifacts.length === 0 && (
              <Alert severity="warning">
                {t('productVerification.noEvidenceArtifacts')}
              </Alert>
            )}
            {(findings.length > 0 || evidencePack?.scores || gate.hasGateMetadata) && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr)' }, gap: 1 }}>
                <FindingList findings={findings} />
                <ScorePanel pack={evidencePack} artifacts={artifacts} gate={gate} />
              </Box>
            )}
            {evidencePack && <EvidencePackPreview pack={evidencePack} />}
          </Box>
        </Paper>
      </Box>
    </Box>
  )
}

function EvidenceSignalCard({
  icon,
  label,
  value,
  detail,
  status,
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
  status: VerificationMatrixStatus
}) {
  const tone = matrixStatusTone(status)
  return (
    <Box
      sx={{
        minWidth: 0,
        border: 1,
        borderColor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.34 : 0.22),
        borderRadius: 1,
        p: 1,
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        gap: 0.85,
        alignItems: 'center',
        bgcolor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.1 : 0.045),
      }}
    >
      <Box
        sx={{
          width: 34,
          height: 34,
          borderRadius: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: tone,
          bgcolor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.15 : 0.08),
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={0.6} alignItems="center" sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={850} noWrap>
            {label}
          </Typography>
          <Chip size="small" label={matrixStatusLabel(status)} sx={{ height: 20, fontSize: 11, fontWeight: 850, color: tone }} />
        </Stack>
        <Typography sx={{ mt: 0.35, fontSize: 20, lineHeight: 1, fontWeight: 950, color: tone }} noWrap title={value}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35 }} noWrap title={detail}>
          {detail}
        </Typography>
      </Box>
    </Box>
  )
}

function PipelineStep({
  icon,
  title,
  detail,
  value,
  status,
}: {
  icon: ReactNode
  title: string
  detail: string
  value: string
  status: VerificationMatrixStatus
}) {
  const tone = matrixStatusTone(status)
  return (
    <Box
      sx={{
        p: 1.2,
        border: 1,
        borderColor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.28 : 0.2),
        borderRadius: 1,
        minWidth: 0,
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        gap: 0.9,
        alignItems: 'start',
        bgcolor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.075 : 0.035),
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: tone,
          bgcolor: (theme) => alpha(resolveToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.13 : 0.075),
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={900} noWrap title={title}>{title}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.45, lineHeight: 1.5 }}>{detail}</Typography>
      </Box>
      <Stack spacing={0.6} alignItems="flex-end" sx={{ minWidth: 56 }}>
        <Typography sx={{ fontSize: 20, lineHeight: 1, fontWeight: 950, color: tone }} noWrap>{value}</Typography>
        <Chip size="small" label={matrixStatusLabel(status)} sx={{ height: 20, fontSize: 11, fontWeight: 850, color: tone }} />
      </Stack>
    </Box>
  )
}

function EvidenceDatum({ label, value, tone = 'text.primary' }: { label: string; value: string; tone?: string }) {
  return (
    <Box sx={{ p: 1, border: 1, borderColor: 'divider', borderRadius: 1, minWidth: 0, bgcolor: 'background.paper' }}>
      <Typography variant="caption" color="text.secondary" fontWeight={850}>{label}</Typography>
      <Typography variant="body2" sx={{ mt: 0.45, fontWeight: 950, color: tone, overflowWrap: 'anywhere' }}>{value}</Typography>
    </Box>
  )
}

function EvidenceField({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ ...flytoTextStyles.codeValue, mt: 0.5 }}>{value}</Typography>
    </Box>
  )
}

function EvidenceImage({ artifact }: { artifact: WarroomEvidenceArtifact }) {
  const src = artifact.previewDataUrl || artifact.url || ''
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden', minWidth: 0, bgcolor: 'background.default' }}>
      {src ? (
        <Box
          component="img"
          src={src}
          alt={artifact.name}
          sx={{ display: 'block', width: '100%', height: { xs: 220, md: 260 }, objectFit: 'contain', bgcolor: 'common.black' }}
        />
      ) : (
        <Box sx={{ height: { xs: 220, md: 260 }, display: 'grid', placeItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">{t('productVerification.imageUnavailable')}</Typography>
        </Box>
      )}
      <Box sx={{ px: 1.25, py: 1, display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="caption" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{artifact.name}</Typography>
        <Chip size="small" variant="outlined" label={formatBytes(artifact.sizeBytes)} />
      </Box>
    </Box>
  )
}

function FindingList({ findings }: { findings: WarroomEvidenceFinding[] }) {
  if (findings.length === 0) {
    return (
      <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <Typography variant="body2" fontWeight={800}>{t('productVerification.stateFindings')}</Typography>
        <Typography variant="caption" color="text.secondary">
          {t('productVerification.noStateFindings')}
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1, minWidth: 0 }}>
      <Typography variant="body2" fontWeight={800}>{t('productVerification.stateFindings')}</Typography>
      <Stack spacing={1} sx={{ mt: 1 }}>
        {findings.slice(0, 8).map((finding, index) => {
          const code = finding.code ?? finding.type ?? `finding_${index + 1}`
          const severity = finding.severity ?? 'unknown'
          return (
            <Box key={`${code}-${index}`} sx={{ p: 1.25, border: 1, borderColor: severity.toLowerCase().includes('p0') || severity.toLowerCase().includes('critical') ? 'error.main' : 'divider', borderRadius: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip size="small" color={severity.toLowerCase().includes('p0') || severity.toLowerCase().includes('critical') ? 'error' : 'default'} label={severity} />
                <Typography variant="caption" fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{code}</Typography>
              </Stack>
              {finding.message && (
                <Typography variant="body2" sx={{ mt: 0.75, overflowWrap: 'anywhere' }}>{finding.message}</Typography>
              )}
            </Box>
          )
        })}
      </Stack>
    </Box>
  )
}

function ScorePanel({ pack, artifacts, gate }: { pack: WarroomEvidencePack | null; artifacts: WarroomEvidenceArtifact[]; gate: EvidenceGateSummary }) {
  const scores = pack?.scores ?? pack?.site_graph?.scores ?? {}
  const network = artifacts.find((artifact) => artifact.kind === 'network_log')
  const networkCount = readJSONNumber(network?.json, 'count')
  const scoreRows = Object.entries(gate.scoreBreakdown)
  const artifactCompleteness = gate.artifactCompleteness
  return (
    <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1, minWidth: 0 }}>
      <Typography variant="body2" fontWeight={800}>{t('productVerification.evidenceScore')}</Typography>
      <Stack spacing={1} sx={{ mt: 1 }}>
        <EvidenceField label={t('productVerification.gateVerdict')} value={gate.verdict ?? 'unknown'} />
        <EvidenceField label="90-point gate" value={formatGateScore(gate.score)} />
        <EvidenceField label="Verdict" value={pack?.verdict ?? 'unknown'} />
        <EvidenceField label={t('hardcoded.observed.coverage.cbdbdf95')} value={formatScore(scores['observed_coverage'])} />
        <EvidenceField label={t('hardcoded.reachable.coverage.e4e2178c')} value={formatScore(scores['reachable_coverage'])} />
        <EvidenceField label={t('hardcoded.network.requests.0d6c3ae8')} value={typeof networkCount === 'number' ? String(networkCount) : 'not captured'} />
        {artifactCompleteness && (
          <EvidenceField
            label={t('hardcoded.artifact.completeness.0b82e601')}
            value={`${artifactCompleteness.present?.length ?? 0}/${artifactCompleteness.required?.length ?? 0} ${artifactCompleteness.complete ? 'complete' : 'missing'}`}
          />
        )}
        {artifactCompleteness?.missing && artifactCompleteness.missing.length > 0 && (
          <EvidenceField label={t('hardcoded.missing.artifacts.d17dd24b')} value={artifactCompleteness.missing.join(', ')} />
        )}
      </Stack>
      {scoreRows.length > 0 && (
        <Box sx={{ mt: 1.25 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={800}>{t('hardcoded.score.breakdown.0677fa8c')}</Typography>
          <Stack spacing={0.75} sx={{ mt: 0.75 }}>
            {scoreRows.map(([key, value]) => (
              <ContractRow
                key={key}
                label={formatScoreKey(key)}
                value={formatScoreBreakdownValue(value)}
              />
            ))}
          </Stack>
        </Box>
      )}
      {gate.blockers.length > 0 && (
        <Box sx={{ mt: 1.25 }}>
          <InlineErrorNotice error={gate.blockers.join(', ')} />
        </Box>
      )}
    </Box>
  )
}

function EvidencePackPreview({ pack }: { pack: WarroomEvidencePack }) {
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, minWidth: 0, overflow: 'hidden' }}>
      <SectionHeader icon={<FileJson size={16} />} title={t('productVerification.rawEvidencePack')} />
      <Box sx={{ p: 1.5 }}>
        <CodePreview value={jsonPreview(pack)} />
      </Box>
    </Box>
  )
}

function GraphEvidencePanel({
  pack,
  artifacts,
  mode = 'all',
}: {
  pack: WarroomEvidencePack | null
  artifacts: WarroomEvidenceArtifact[]
  mode?: 'all' | 'discovery' | 'intent' | 'network'
}) {
  const graph = pack?.site_graph
  const intents = graph?.intents ?? []
  const actions = graph?.actions ?? []
  const apis = graph?.apis ?? []
  const pages = graph?.pages ?? []
  const allowedStates = graph?.state_graph?.allowed_states ?? []
  const observedStates = Array.from(new Set(pages.flatMap((page) => page.states ?? []))).sort()
  const dom = artifacts.find((artifact) => artifact.kind === 'dom_snapshot')
  const network = artifacts.find((artifact) => artifact.kind === 'network_log')
  const showDiscovery = mode === 'all' || mode === 'discovery'
  const showIntent = mode === 'all' || mode === 'intent'
  const showNetwork = mode === 'all' || mode === 'network'

  if (!graph) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<GitBranch size={16} />} title={graphPanelTitle(mode)} />
        <Alert severity="info" sx={{ m: 2 }}>
          {t('productVerification.noGraphEvidence')}
        </Alert>
      </Paper>
    )
  }

  return (
    <Stack spacing={2}>
      {showDiscovery && <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Activity size={16} />} title={t('productVerification.discoveryEvidence')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) minmax(320px, 0.55fr)' }, gap: 1.25 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25, minWidth: 0 }}>
            {pages.slice(0, 8).map((page, index) => (
              <Box key={page.id ?? index} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={850} sx={{ overflowWrap: 'anywhere' }}>{page.url ?? `page_${index + 1}`}</Typography>
                <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
                  <EvidenceField label="Controls" value={String(page.control_count ?? 0)} />
                  <EvidenceField label="APIs" value={String(page.api_count ?? 0)} />
                  <EvidenceField label={t('hardcoded.body.chars.99e3bbcf')} value={String(page.body_chars ?? 0)} />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, overflowWrap: 'anywhere' }}>
                  {(page.states ?? []).join(', ') || 'state pending'}
                </Typography>
              </Box>
            ))}
            {pages.length === 0 && <EvidenceField label="Discovery" value="No pages captured yet" />}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={850} sx={{ mb: 1 }}>{t('hardcoded.action.candidates.427ffc7a')}</Typography>
            <Stack spacing={0.75}>
              {actions.slice(0, 8).map((action, index) => (
                <ContractRow
                  key={action.id ?? index}
                  label={action.label ?? action.kind ?? 'action'}
                  value={`${action.selector ?? 'selector pending'} · ${action.expected_state ?? 'actionable'}${action.intent_id ? ` · ${action.intent_id}` : ''}`}
                />
              ))}
              {actions.length === 0 && <EvidenceField label="Actions" value="No actions extracted yet" />}
            </Stack>
          </Box>
        </Box>
      </Paper>}

      {showIntent && <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<GitBranch size={16} />} title={t('productVerification.intentGraph')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
          {intents.slice(0, 8).map((intent, index) => (
            <EvidenceField
              key={String(intent.id ?? index)}
              label={String(intent.verb ?? 'intent')}
              value={`${String(intent.object ?? 'unknown')} · ${String(intent.source ?? 'observed')}`}
            />
          ))}
          {intents.length === 0 && <EvidenceField label={t('productVerification.intentGraph')} value="No intents extracted yet" />}
        </Box>
      </Paper>}

      {showNetwork && <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Network size={16} />} title={t('productVerification.stateApiGraph')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
          <EvidenceField label={t('hardcoded.observed.paths.bb13018a')} value={String(graph.observed_paths?.length ?? 0)} />
          <EvidenceField label={t('hardcoded.reachable.paths.c3733d97')} value={String(graph.reachable_paths?.length ?? 0)} />
          <EvidenceField label={t('hardcoded.api.edges.f9c0b3ab')} value={String(apis.length)} />
          <EvidenceField label={t('hardcoded.dom.artifact.e7282f3e')} value={dom ? dom.name : 'not captured'} />
          <EvidenceField label={t('hardcoded.network.artifact.ffab4e4d')} value={network ? network.name : 'not captured'} />
          <EvidenceField label={t('hardcoded.allowed.states.c652d980')} value={allowedStates.join(', ') || 'n/a'} />
        </Box>
        <Box sx={{ px: 2, pb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {observedStates.map((state) => <Chip key={state} size="small" label={state} />)}
        </Box>
      </Paper>}

      {showNetwork && <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<Network size={16} />} title={t('productVerification.networkApiEvidence')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) minmax(320px, 0.55fr)' }, gap: 1.25 }}>
          <Stack spacing={0.75} sx={{ minWidth: 0 }}>
            {apis.slice(0, 12).map((api, index) => (
              <ContractRow
                key={api.id ?? index}
                label={`${api.method ?? 'GET'} ${api.status ?? 'n/a'}`}
                value={`${api.url ?? 'unknown'}${api.trigger ? ` · trigger ${api.trigger}` : ''}${api.ghost_api_type ? ` · ${api.ghost_api_type}` : ''}`}
              />
            ))}
            {apis.length === 0 && <EvidenceField label={t('hardcoded.api.edges.f9c0b3ab')} value="No API edges captured yet" />}
          </Stack>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={850} sx={{ mb: 1 }}>{t('hardcoded.network.log.artifact.0fbeb402')}</Typography>
            <CodePreview value={artifactPreview(network)} />
          </Box>
        </Box>
      </Paper>}

      {showNetwork && <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<ScrollText size={16} />} title={t('productVerification.domSnapshotEvidence')} />
        <Box sx={{ p: 2 }}>
          <CodePreview value={artifactPreview(dom)} />
        </Box>
      </Paper>}
    </Stack>
  )
}

function graphPanelTitle(mode: 'all' | 'discovery' | 'intent' | 'network') {
  if (mode === 'discovery') return t('productVerification.discoveryEvidence')
  if (mode === 'intent') return t('productVerification.intentGraph')
  if (mode === 'network') return t('productVerification.networkApiEvidence')
  return t('productVerification.graphEvidence')
}

function DeterministicRulesPanel({
  summary,
  findings,
}: {
  summary: DeterministicRuleSummary
  findings: WarroomEvidenceFinding[]
}) {
  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<AlertTriangle size={16} />} title={t('productVerification.deterministicRules')} />
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
          {summary.rows.map((row) => (
            <EvidenceField key={row.code} label={row.label} value={`${row.count} ${row.status}`} />
          ))}
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <SectionHeader icon={<AlertTriangle size={16} />} title={t('productVerification.stateContradictions')} />
        <Box sx={{ p: 2 }}>
          <FindingList findings={findings} />
        </Box>
      </Paper>
    </Stack>
  )
}

function ContractRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '160px minmax(0, 1fr)' }, gap: 1, alignItems: 'start', p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
      <Typography variant="body2" sx={flytoTextStyles.codeValue}>{value}</Typography>
    </Box>
  )
}

export function LegacyProductVerificationRunRow({ run, selected, onSelect }: { run: WarroomCampaignExecution; selected: boolean; onSelect: () => void }) {
  const status = run.verdict ?? run.status
  return (
    <Paper
      variant="outlined"
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect()
      }}
      sx={{
        p: 2,
        borderRadius: 1,
        cursor: 'pointer',
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'action.hover' : 'background.paper',
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography variant="subtitle2" noWrap>{run.targetUrl}</Typography>
            <Chip size="small" color={statusColor[status] ?? statusColor[run.status] ?? 'default'} label={status} />
            {run.dryRun && <Chip size="small" variant="outlined" label={t('productVerification.dryRun')} />}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {formatDate(run.createdAt)} · {run.playbookId ?? 'warroom-deterministic-audit'}
          </Typography>
          {run.allowedTargets && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {compactScope(run.allowedTargets)}
            </Typography>
          )}
          {run.errorMessage && (
            <Box sx={{ mt: 1 }}>
              <InlineErrorNotice error={run.errorMessage} />
            </Box>
          )}
        </Box>
        <Stack direction="row" spacing={1} justifyContent={{ xs: 'flex-start', md: 'flex-end' }} flexWrap="wrap">
          <Chip size="small" label={`P0 ${run.criticalCount}`} color={run.criticalCount > 0 ? 'error' : 'default'} />
          <Chip size="small" label={`${run.findingsCount} findings`} />
          {run.runnerExecutionId && <Chip size="small" variant="outlined" label={run.runnerExecutionId} />}
        </Stack>
      </Stack>
    </Paper>
  )
}

function summarizeRuns(runs: WarroomCampaignExecution[]) {
  return {
    active: runs.filter((run) => run.status === 'dispatched' || run.status === 'running').length,
    withEvidence: runs.filter((run) => !!run.evidenceSig).length,
  }
}

function ghostApiCount(pack: WarroomEvidencePack | null) {
  const ghost = pack?.automation_test_model?.ghost_api
  if (ghost) {
    return (ghost.type_a_count ?? 0) + (ghost.type_b_count ?? 0) + (ghost.type_c_count ?? 0)
  }
  return normalizeEvidenceFindings(pack).filter((finding) => String(finding.code ?? finding.type ?? '').startsWith('ghost_api')).length
}

function normalizeEvidenceFindings(pack: WarroomEvidencePack | null): WarroomEvidenceFinding[] {
  if (!pack) return []
  if (Array.isArray(pack.findings)) return pack.findings
  if (Array.isArray(pack.site_graph?.findings)) return pack.site_graph.findings
  return []
}

function normalizeEvidenceGate(
  data: WarroomVerificationEvidenceResponse | undefined,
  pack: WarroomEvidencePack | null,
): EvidenceGateSummary {
  const scoreBreakdown = data?.scoreBreakdown ?? pack?.score_breakdown ?? {}
  const artifactCompleteness = data?.artifactCompleteness ?? pack?.artifact_completeness
  const blockers = data?.gateBlockers ?? pack?.gate_blockers ?? []
  const verdict = data?.gateVerdict ?? pack?.gate_verdict
  const score = data?.gateScore ?? pack?.gate_score
  return {
    verdict,
    score,
    scoreBreakdown,
    artifactCompleteness,
    blockers,
    hasGateMetadata: Boolean(
      verdict ||
      typeof score === 'number' ||
      Object.keys(scoreBreakdown).length > 0 ||
      artifactCompleteness ||
      blockers.length > 0
    ),
  }
}

function summarizeDeterministicRules(
  pack: WarroomEvidencePack | null,
  model: WarroomAutomationTestModel | undefined = pack?.automation_test_model,
): DeterministicRuleSummary {
  const findings = normalizeEvidenceFindings(pack)
  const counts = model?.deterministic_rules?.counts ?? {}
  const ghost = model?.ghost_api
  const rbac = model?.rbac_matrix
  const fallbackCounts = new Map<string, number>()
  for (const code of deterministicRuleOrder) {
    fallbackCounts.set(code, findings.filter((finding) => (finding.code ?? finding.type) === code).length)
  }
  if (ghost) {
    fallbackCounts.set('ghost_api_type_a', Math.max(fallbackCounts.get('ghost_api_type_a') ?? 0, ghost.type_a_count ?? 0))
    fallbackCounts.set('ghost_api_type_b', Math.max(fallbackCounts.get('ghost_api_type_b') ?? 0, ghost.type_b_count ?? 0))
    fallbackCounts.set('ghost_api_type_c', Math.max(fallbackCounts.get('ghost_api_type_c') ?? 0, ghost.type_c_count ?? 0))
  }
  if (rbac?.status && rbac.status !== 'not_provided' && rbac.fail_closed === false) {
    fallbackCounts.set('rbac_fail_open', Math.max(fallbackCounts.get('rbac_fail_open') ?? 0, 1))
  }

  const rows = deterministicRuleOrder.map((code) => {
    const count = typeof counts[code] === 'number' ? counts[code] : fallbackCounts.get(code) ?? 0
    return {
      code,
      label: formatScoreKey(code),
      count,
      status: count > 0 ? 'blocked' : 'clear',
    }
  })
  return {
    rows,
    total: rows.reduce((sum, row) => sum + row.count, 0),
  }
}

function formatScore(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a'
  if (value <= 1) return `${Math.round(value * 100)}%`
  return String(value)
}

function formatGateScore(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a'
  return `${Number.isInteger(value) ? value : value.toFixed(1)} / 100`
}

function formatScoreBreakdownValue(value: WarroomEvidenceScoreBreakdownItem) {
  const parts: string[] = []
  if (typeof value.points === 'number' || typeof value.max === 'number') {
    parts.push(`${formatNumberValue(value.points)} / ${formatNumberValue(value.max)} pts`)
  }
  if (typeof value.value === 'number') {
    parts.push(`value ${formatScore(value.value)}`)
  }
  if (typeof value.threshold === 'number') {
    parts.push(`threshold ${formatScore(value.threshold)}`)
  }
  if (typeof value.complete === 'boolean') {
    parts.push(value.complete ? 'complete' : 'incomplete')
  }
  if (value.label) {
    parts.push(value.label)
  }
  return parts.join(' · ') || 'n/a'
}

function formatNumberValue(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function formatScoreKey(value: string) {
  return value
    .split('_')
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(' ')
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function readJSONNumber(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return undefined
  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === 'number' ? candidate : undefined
}

function readNumber(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return undefined
  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined
}

function jsonPreview(value: unknown) {
  try {
    const text = JSON.stringify(value, null, 2)
    return text.length > 12_000 ? `${text.slice(0, 12_000)}\n... truncated ...` : text
  } catch {
    return String(value ?? 'not available')
  }
}

function artifactPreview(artifact: WarroomEvidenceArtifact | undefined) {
  if (!artifact) return 'artifact: not captured'
  if (artifact.json !== undefined) return jsonPreview(artifact.json)
  if (artifact.previewDataUrl) return `${artifact.name}\n${artifact.mimeType}\npreview: inline image`
  if (artifact.url) return `${artifact.name}\n${artifact.mimeType}\nblob: ${artifact.url}`
  return `${artifact.name}\n${artifact.mimeType}\n${formatBytes(artifact.sizeBytes)}`
}

function scenarioPreview(scenario: WarroomEvidencePack['scenarios'] | undefined) {
  if (!scenario) return 'scenario: pending'
  const lines = [
    `name: ${scenario.name ?? t('hardcoded.warroom.generated.regression.5446bc83')}`,
    `schema_version: ${scenario.schema_version ?? 'unknown'}`,
    `target: ${scenario.target ?? 'unknown'}`,
    `generated_from: ${scenario.generated_from ?? 'unknown'}`,
    'steps:',
  ]
  const steps = scenario.steps ?? []
  steps.slice(0, 16).forEach((step, index) => {
    lines.push(`  - id: ${step.id ?? `step_${index + 1}`}`)
    lines.push(`    module: ${step.module ?? 'unknown'}`)
    const params = summarizeScenarioParams(step.params)
    if (params) lines.push(`    params: ${params}`)
    if (step.assertions?.length) lines.push(`    assertions: ${step.assertions.length}`)
  })
  if (steps.length > 16) lines.push(`  # ${steps.length - 16} more steps`)
  return lines.join('\n')
}

function summarizeScenarioParams(params: Record<string, unknown> | undefined) {
  if (!params) return ''
  if (typeof params.url === 'string') return `{ url: ${params.url} }`
  if (typeof params.selector === 'string') return `{ selector: ${params.selector} }`
  if (typeof params.duration_ms === 'number') return `{ duration_ms: ${params.duration_ms} }`
  if (typeof params.script === 'string') return '{ script: browser assertion }'
  const keys = Object.keys(params).slice(0, 3)
  return keys.length > 0 ? `{ ${keys.join(', ')} }` : ''
}
