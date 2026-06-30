import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Box, Button, Chip, Divider, IconButton, MenuItem, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import {
  Box as BoxIcon, ShieldCheck, Terminal, Layers, Package,
  ArrowRight, GitBranch, Play, Save, FileText, CheckCircle2, RotateCcw, ShieldOff,
} from 'lucide-react'
import { useSnackbar } from 'notistack'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { FlytoCodeBlock } from '@atoms/FlytoCodeBlock'
import { FlytoSurface } from '@atoms/FlytoSurface'
import { LoadingState } from '@components/atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { useConnectedRepos, useOrg } from '@hooks/useOrg'
import {
  falsePositiveContainerFinding,
  getContainerScanRunEvidence,
  listContainerConnections,
  listContainerFindings,
  listContainerScanRuns,
  reopenContainerFinding,
  runContainerConnectionScan,
  upsertContainerConnection,
  verifyContainerFinding,
  type ContainerConnection,
  type ContainerConnectionInput,
  type ContainerScanRun,
} from '@lib/engine'
import { getContainerPosture, type ContainerPosture } from '@lib/engine/code/posture'
import { Loading, ScanViewRoot, ScanViewHeader } from './_shared'
import { ContainerPostureHeader } from './PostureHeader'
import { colors } from '@/styles/designTokens'
import { flytoFontFamily, flytoTextStyles } from '@/styles/visualSystem'

const MONO = flytoFontFamily.mono
const ACCENT = colors.tech
const SECURE = colors.semantic.success
const SEV: Record<string, string> = {
  CRITICAL: colors.severity.critical, HIGH: colors.severity.high, MEDIUM: colors.severity.medium, LOW: colors.severity.low,
}
const SEV_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const GRADE_COLOR: Record<string, string> = {
  good: SECURE, fair: colors.severity.medium, warn: colors.severity.high, bad: colors.severity.critical, neutral: colors.severity.low,
}
type ContainerSourceKind = 'repo_scan' | 'repo_manual' | 'registry_connection' | 'kubernetes_connection' | 'finding_verify' | 'unknown'

interface ContainerFinding {
  id: string
  repo_id?: string
  scan_run_id?: string
  source_type?: string
  source_ref?: string
  image_ref: string
  package_name: string
  installed_version: string
  fixed_version?: string
  severity: string
  cve_id?: string
  title: string
  status: string
  scanned_at: string
  resolved_at?: string
  resolution?: string
}

type ContainerFindingAction = 'verify' | 'false_positive' | 'reopen'

interface ContainerImageGroup {
  image: string
  items: ContainerFinding[]
  counts: Record<string, number>
  worst: number
}

interface ContainerSourceSection {
  key: string
  sourceKind: ContainerSourceKind
  sourceLabel: string
  sourceDescription: string
  subjectKindLabel: string
  subjectLabel: string
  subjectDetail: string
  items: ContainerFinding[]
  imageGroups: ContainerImageGroup[]
  counts: Record<string, number>
  worst: number
}

function normSev(s: string): string {
  const u = (s || '').toUpperCase()
  return u in SEV ? u : 'LOW'
}
function sevRank(s: string): number {
  const i = SEV_ORDER.indexOf(normSev(s))
  return i === -1 ? 99 : i
}
function countSev(items: ContainerFinding[]): Record<string, number> {
  const c: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  for (const f of items) c[normSev(f.severity)]++
  return c
}

export function ContainerScanView() {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const { org } = useOrg()
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const orgId = org?.id

  const reposQ = useConnectedRepos(orgId)
  const connectionsQ = useQuery({
    queryKey: qk.container.connections(orgId),
    queryFn: () => listContainerConnections(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const findingsQ = useQuery({
    queryKey: qk.container.findings(orgId),
    queryFn: () => listContainerFindings(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const postureQ = useQuery({
    queryKey: qk.container.posture(orgId),
    queryFn: () => getContainerPosture(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const findings = useMemo(
    () => (findingsQ.data?.findings ?? []) as ContainerFinding[],
    [findingsQ.data],
  )
  const posture = postureQ.data ?? null

  const sevCounts = useMemo(() => countSev(findings), [findings])
  const repoNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const repo of reposQ.data ?? []) m.set(repo.id, repo.fullName || repo.repoName || repo.id)
    return m
  }, [reposQ.data])
  const connectionById = useMemo(() => {
    const m = new Map<string, ContainerConnection>()
    for (const conn of connectionsQ.data?.connections ?? []) m.set(conn.id, conn)
    return m
  }, [connectionsQ.data])

  const lifecycleMut = useMutation({
    mutationFn: async ({ action, findingId }: { action: ContainerFindingAction; findingId: string }) => {
      if (!orgId) throw new Error('missing org')
      if (action === 'verify') return verifyContainerFinding(orgId, findingId)
      if (action === 'false_positive') return falsePositiveContainerFinding(orgId, findingId)
      return reopenContainerFinding(orgId, findingId)
    },
    onMutate: async ({ action, findingId }) => {
      if (!orgId || action === 'verify') return { previous: undefined }
      const key = qk.container.findings(orgId)
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<{ findings: ContainerFinding[] }>(key)
      const status = action === 'false_positive' ? 'false_positive' : 'open'
      const resolution = action === 'false_positive' ? 'false_positive' : 'reopened'
      qc.setQueryData<{ findings: ContainerFinding[] }>(key, old => ({
        ...(old ?? { findings: [] }),
        findings: (old?.findings ?? []).map(f => (
          f.id === findingId ? { ...f, status, resolution } : f
        )),
      }))
      return { previous }
    },
    onSuccess: () => {
      enqueueSnackbar(t('warroom.containerActionQueued'), { variant: 'success' })
    },
    onError: (_err, _vars, ctx) => {
      if (orgId && ctx?.previous) {
        qc.setQueryData(qk.container.findings(orgId), ctx.previous)
      }
      enqueueSnackbar(t('warroom.containerActionFailed'), { variant: 'error' })
    },
    onSettled: () => {
      if (!orgId) return
      qc.invalidateQueries({ queryKey: qk.container.findings(orgId) })
      qc.invalidateQueries({ queryKey: qk.container.runs(orgId) })
      qc.invalidateQueries({ queryKey: qk.container.posture(orgId) })
    },
  })

  const sourceSections = useMemo(
    () => buildContainerSourceSections(findings, repoNameById, connectionById),
    [findings, repoNameById, connectionById],
  )

  const loading = findingsQ.isLoading || postureQ.isLoading
  const errored = findingsQ.isError || postureQ.isError
  const loadError = findingsQ.error ?? postureQ.error

  return (
    <ScanViewRoot>
      <ScanViewHeader
        icon={BoxIcon}
        title={t('scoring.containerScan')}
        subtitle={t('warroom.containerSub')}
        count={findings.length}
      />

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 2, pr: 0.5 }}>
        <ContainerPostureHeader />
        <PostureBar posture={posture} sevCounts={sevCounts} dark={dark} />
        <ContainerClosedLoopPanel orgId={orgId} dark={dark} />

        {loading && <Loading />}

        {errored && !loading && (
          <QueryError
            error={loadError}
            onRetry={() => {
              void findingsQ.refetch()
              void postureQ.refetch()
            }}
            label={t('scoring.containerScan')}
            compact
          />
        )}

        {!loading && !errored && findings.length === 0 && (
          <SecurePanel imageCount={posture?.image_count ?? 0} dark={dark} />
        )}

        {!loading && !errored && sourceSections.map(section => (
          <ContainerSourceSectionView
            key={section.key}
            section={section}
            dark={dark}
            busyFindingId={lifecycleMut.variables?.findingId}
            onAction={(action, findingId) => lifecycleMut.mutate({ action, findingId })}
          />
        ))}
      </Box>
    </ScanViewRoot>
  )
}

function buildContainerSourceSections(
  findings: ContainerFinding[],
  repoNameById: Map<string, string>,
  connectionById: Map<string, ContainerConnection>,
): ContainerSourceSection[] {
  const buckets = new Map<string, ContainerSourceSection>()
  for (const finding of findings) {
    const context = containerFindingSourceContext(finding, repoNameById, connectionById)
    const key = `${context.sourceKind}:${context.subjectKindLabel}:${context.subjectLabel}:${finding.source_ref || finding.repo_id || ''}`
    let section = buckets.get(key)
    if (!section) {
      section = {
        key,
        ...context,
        items: [],
        imageGroups: [],
        counts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
        worst: 99,
      }
      buckets.set(key, section)
    }
    section.items.push(finding)
  }

  return [...buckets.values()]
    .map(section => {
      const imageGroups = groupContainerFindingsByImage(section.items)
      const counts = countSev(section.items)
      return {
        ...section,
        imageGroups,
        counts,
        worst: section.items.reduce((w, f) => Math.min(w, sevRank(f.severity)), 99),
      }
    })
    .sort((a, b) => (
      containerSourceRank(a.sourceKind) - containerSourceRank(b.sourceKind)
      || a.subjectLabel.localeCompare(b.subjectLabel)
      || a.worst - b.worst
    ))
}

function groupContainerFindingsByImage(findings: ContainerFinding[]): ContainerImageGroup[] {
  const m = new Map<string, ContainerFinding[]>()
  for (const f of findings) {
    const arr = m.get(f.image_ref) ?? []
    arr.push(f)
    m.set(f.image_ref, arr)
  }
  return [...m.entries()]
    .map(([image, items]) => ({
      image,
      items: [...items].sort((a, b) => sevRank(a.severity) - sevRank(b.severity)),
      counts: countSev(items),
      worst: items.reduce((w, f) => Math.min(w, sevRank(f.severity)), 99),
    }))
    .sort((a, b) => (a.worst - b.worst) || (b.items.length - a.items.length) || a.image.localeCompare(b.image))
}

function containerFindingSourceContext(
  finding: ContainerFinding,
  repoNameById: Map<string, string>,
  connectionById: Map<string, ContainerConnection>,
): Pick<ContainerSourceSection, 'sourceKind' | 'sourceLabel' | 'sourceDescription' | 'subjectKindLabel' | 'subjectLabel' | 'subjectDetail'> {
  const sourceType = finding.source_type || (finding.repo_id ? 'repo_scan' : 'unknown')
  if (sourceType === 'container_connection') {
    const conn = finding.source_ref ? connectionById.get(finding.source_ref) : undefined
    const isKubernetes = conn?.kind === 'kubernetes'
    return {
      sourceKind: isKubernetes ? 'kubernetes_connection' : 'registry_connection',
      sourceLabel: t(isKubernetes ? 'warroom.containerSourceKubernetes' : 'warroom.containerSourceRegistry'),
      sourceDescription: t(isKubernetes ? 'warroom.containerSourceKubernetesDesc' : 'warroom.containerSourceRegistryDesc'),
      subjectKindLabel: t('warroom.containerConnection'),
      subjectLabel: conn?.name || finding.source_ref || t('warroom.containerUnknownConnection'),
      subjectDetail: [conn?.provider || '', conn?.region || '', conn?.endpoint || ''].filter(Boolean).join(' · '),
    }
  }
  if (sourceType === 'repo_manual') {
    const repoID = finding.repo_id || finding.source_ref || ''
    return {
      sourceKind: 'repo_manual',
      sourceLabel: t('warroom.containerSourceRepoManual'),
      sourceDescription: t('warroom.containerSourceRepoManualDesc'),
      subjectKindLabel: t('warroom.containerProject'),
      subjectLabel: repoNameById.get(repoID) || repoID || t('warroom.containerUnknownProject'),
      subjectDetail: repoID,
    }
  }
  if (sourceType === 'repo_scan') {
    const repoID = finding.repo_id || finding.source_ref || ''
    return {
      sourceKind: 'repo_scan',
      sourceLabel: t('warroom.containerSourceRepoScan'),
      sourceDescription: t('warroom.containerSourceRepoScanDesc'),
      subjectKindLabel: t('warroom.containerProject'),
      subjectLabel: repoNameById.get(repoID) || repoID || t('warroom.containerUnknownProject'),
      subjectDetail: repoID,
    }
  }
  if (sourceType === 'finding_verify') {
    const repoID = finding.repo_id || ''
    return {
      sourceKind: 'finding_verify',
      sourceLabel: t('warroom.containerSourceVerify'),
      sourceDescription: t('warroom.containerSourceVerifyDesc'),
      subjectKindLabel: t('warroom.containerProject'),
      subjectLabel: repoNameById.get(repoID) || repoID || t('warroom.containerUnknownProject'),
      subjectDetail: finding.source_ref || finding.scan_run_id || '',
    }
  }
  return {
    sourceKind: 'unknown',
    sourceLabel: t('warroom.containerSourceUnknown'),
    sourceDescription: t('warroom.containerSourceUnknownDesc'),
    subjectKindLabel: t('warroom.containerSource'),
    subjectLabel: finding.source_ref || finding.repo_id || t('common.unknown'),
    subjectDetail: sourceType,
  }
}

function containerSourceRank(kind: ContainerSourceKind): number {
  switch (kind) {
    case 'kubernetes_connection': return 0
    case 'registry_connection': return 1
    case 'repo_scan': return 2
    case 'repo_manual': return 3
    case 'finding_verify': return 4
    default: return 5
  }
}

function containerSourceColor(kind: ContainerSourceKind): string {
  switch (kind) {
    case 'kubernetes_connection': return SECURE
    case 'registry_connection': return ACCENT
    case 'repo_scan': return colors.brand
    case 'repo_manual': return colors.brandDeep
    case 'finding_verify': return colors.severity.medium
    default: return colors.severity.low
  }
}

function ContainerClosedLoopPanel({ orgId, dark }: { orgId?: string; dark: boolean }) {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const [kind, setKind] = useState<'registry' | 'kubernetes'>('registry')
  const [name, setName] = useState('')
  const [provider, setProvider] = useState('registry')
  const [endpoint, setEndpoint] = useState('')
  const [region, setRegion] = useState('')
  const [imageRefsText, setImageRefsText] = useState('')
  const [credential, setCredential] = useState('')
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>()

  const connectionsQ = useQuery({
    queryKey: qk.container.connections(orgId),
    queryFn: () => listContainerConnections(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const runsQ = useQuery({
    queryKey: qk.container.runs(orgId),
    queryFn: () => listContainerScanRuns(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const evidenceQ = useQuery({
    queryKey: qk.container.evidence(orgId, selectedRunId),
    queryFn: () => getContainerScanRunEvidence(orgId!, selectedRunId!),
    enabled: !!orgId && !!selectedRunId,
    staleTime: 60_000,
  })

  const invalidateContainerLoop = () => {
    if (!orgId) return
    qc.invalidateQueries({ queryKey: qk.container.connections(orgId) })
    qc.invalidateQueries({ queryKey: qk.container.runs(orgId) })
    qc.invalidateQueries({ queryKey: qk.container.findings(orgId) })
    qc.invalidateQueries({ queryKey: qk.container.posture(orgId) })
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('missing org')
      const input: ContainerConnectionInput = {
        kind,
        provider: provider.trim() || kind,
        name: name.trim(),
        endpoint: endpoint.trim() || undefined,
        region: region.trim() || undefined,
        image_refs: parseImageRefs(imageRefsText),
        credential: credential.trim() || undefined,
        credential_kind: kind === 'kubernetes' ? 'kubeconfig' : 'registry_credential',
        status: 'active',
      }
      return upsertContainerConnection(orgId, input)
    },
    onSuccess: () => {
      setCredential('')
      enqueueSnackbar(t('warroom.containerConnectionSaved'), { variant: 'success' })
      invalidateContainerLoop()
    },
    onError: () => {
      enqueueSnackbar(t('warroom.containerConnectionSaveFailed'), { variant: 'error' })
    },
  })

  const runMut = useMutation({
    mutationFn: async (connectionId: string) => {
      if (!orgId) throw new Error('missing org')
      return runContainerConnectionScan(orgId, connectionId)
    },
    onSuccess: () => {
      enqueueSnackbar(t('warroom.containerScanQueued'), { variant: 'success' })
      invalidateContainerLoop()
    },
    onError: () => {
      enqueueSnackbar(t('warroom.containerScanQueueFailed'), { variant: 'error' })
    },
  })

  const connections = connectionsQ.data?.connections ?? []
  const runs = runsQ.data?.runs ?? []
  const canSave = !!orgId && !!name.trim() && !saveMut.isPending
  const prettyEvidence = useMemo(() => {
    const raw = evidenceQ.data?.evidence_json
    if (!raw) return ''
    try {
      return JSON.stringify(JSON.parse(raw), null, 2)
    } catch {
      return raw
    }
  }, [evidenceQ.data?.evidence_json])

  return (
    <FlytoSurface
      title={t('warroom.containerControlTitle')}
      icon={<BoxIcon size={15} />}
      action={(
        <Chip
          size="small"
          label={`${connections.length} ${t('warroom.containerConnections')}`}
          sx={{ borderRadius: 1, ...flytoTextStyles.codeTiny }}
        />
      )}
      tone="tech"
      density="compact"
      bodySx={{ p: 0 }}
      sx={{ minWidth: 0 }}
    >

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.05fr 0.95fr' }, gap: 0, minWidth: 0 }}>
        <Box sx={{ p: 1.5, borderRight: { lg: '1px solid' }, borderColor: { lg: 'divider' }, minWidth: 0 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '140px 1fr' }, gap: 1 }}>
            <TextField
              select
              size="small"
              label={t('warroom.containerKind')}
              value={kind}
              onChange={(event) => {
                const next = event.target.value as 'registry' | 'kubernetes'
                setKind(next)
                setProvider(next)
              }}
            >
              <MenuItem value="registry">{t('warroom.containerKindRegistry')}</MenuItem>
              <MenuItem value="kubernetes">{t('warroom.containerKindKubernetes')}</MenuItem>
            </TextField>
            <TextField
              size="small"
              label={t('warroom.containerConnectionName')}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <TextField
              size="small"
              label={t('warroom.containerProvider')}
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
            />
            <TextField
              size="small"
              label={t('warroom.containerEndpoint')}
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
            />
            <TextField
              size="small"
              label={t('warroom.containerRegion')}
              value={region}
              onChange={(event) => setRegion(event.target.value)}
            />
            <TextField
              size="small"
              label={t('warroom.containerImageRefs')}
              value={imageRefsText}
              onChange={(event) => setImageRefsText(event.target.value)}
              helperText={t('warroom.containerImageRefsHelp')}
              multiline
              minRows={2}
            />
            <TextField
              size="small"
              label={t(kind === 'kubernetes' ? 'warroom.containerKubeconfig' : 'warroom.containerCredential')}
              value={credential}
              onChange={(event) => setCredential(event.target.value)}
              helperText={t('warroom.containerCredentialHelp')}
              multiline={kind === 'kubernetes'}
              minRows={kind === 'kubernetes' ? 3 : 1}
              sx={{ gridColumn: { xs: 'auto', sm: '1 / -1' } }}
            />
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.25 }}>
            <Button
              size="small"
              variant="contained"
              startIcon={<Save size={14} />}
              disabled={!canSave}
              onClick={() => saveMut.mutate()}
            >
              {t('warroom.containerSaveConnection')}
            </Button>
          </Box>
        </Box>

        <Box sx={{ p: 1.5, minWidth: 0 }}>
          <Typography sx={{ ...flytoTextStyles.codeLabel, mb: 1 }}>
            {t('warroom.containerConnectionList')}
          </Typography>
          {connectionsQ.isLoading && <LoadingState variant="spinner" py={2} />}
          {!connectionsQ.isLoading && connections.length === 0 && (
            <Typography variant="body2" color="text.secondary">{t('warroom.containerConnectionEmpty')}</Typography>
          )}
          <Stack spacing={1}>
            {connections.map(conn => (
              <ContainerConnectionRow
                key={conn.id}
                conn={conn}
                running={runMut.isPending && runMut.variables === conn.id}
                onRun={() => runMut.mutate(conn.id)}
              />
            ))}
          </Stack>
        </Box>
      </Box>

      <Divider />

      <Box sx={{ p: 1.5, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography sx={flytoTextStyles.codeLabel}>
            {t('warroom.containerRunLedger')}
          </Typography>
          <Box sx={{ flex: 1 }} />
          {runsQ.isFetching && <LoadingState variant="spinner" py={0} />}
        </Box>
        {runs.length === 0 && !runsQ.isLoading && (
          <Typography variant="body2" color="text.secondary">{t('warroom.containerRunEmpty')}</Typography>
        )}
        <Stack spacing={0.75}>
          {runs.slice(0, 5).map(run => (
            <ContainerRunRow
              key={run.id}
              run={run}
              selected={selectedRunId === run.id}
              onEvidence={() => setSelectedRunId(selectedRunId === run.id ? undefined : run.id)}
            />
          ))}
        </Stack>
        {selectedRunId && (
          <FlytoCodeBlock
            label={t('warroom.containerEvidence')}
            detail={evidenceQ.data?.evidence_signature ?? ''}
            icon={<FileText size={13} />}
            value={evidenceQ.isLoading ? t('common.loading') : prettyEvidence}
            density="compact"
            maxHeight={220}
            sx={{ mt: 1 }}
            preSx={{
              ...flytoTextStyles.codeTiny,
              bgcolor: dark ? alpha(colors.brandDarkest, 0.22) : alpha(colors.semantic.neutral, 0.09),
            }}
          />
        )}
      </Box>
    </FlytoSurface>
  )
}

function ContainerConnectionRow({ conn, running, onRun }: {
  conn: ContainerConnection
  running: boolean
  onRun: () => void
}) {
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' },
      gap: 1,
      alignItems: 'center',
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1,
      px: 1,
      py: 0.75,
      minWidth: 0,
    }}>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          <Typography sx={flytoTextStyles.codeValue} noWrap>
            {conn.name}
          </Typography>
          <Chip size="small" label={t(containerConnectionStatusKey(conn.status))} sx={{ height: 20, borderRadius: 1, ...flytoTextStyles.codeTiny }} />
          {conn.has_credential && (
            <Chip size="small" label={t('warroom.containerCredentialSealed')} sx={{ height: 20, borderRadius: 1, ...flytoTextStyles.codeTiny }} />
          )}
        </Box>
        <Typography sx={{ ...flytoTextStyles.codeTiny, color: 'text.secondary' }} noWrap>
          {t(containerConnectionKindKey(conn.kind))} · {conn.provider || conn.kind} · {(conn.image_refs ?? []).length} {t('warroom.containerImages')}
        </Typography>
        {conn.last_error && (
          <Typography sx={{ ...flytoTextStyles.codeTiny, color: 'error.main' }} noWrap>
            {conn.last_error}
          </Typography>
        )}
      </Box>
      <Button
        size="small"
        variant="outlined"
        startIcon={<Play size={13} />}
        disabled={conn.status !== 'active' || running}
        onClick={onRun}
      >
        {t(running ? 'warroom.containerScanRunning' : 'warroom.containerRunScan')}
      </Button>
    </Box>
  )
}

function ContainerRunRow({ run, selected, onEvidence }: {
  run: ContainerScanRun
  selected: boolean
  onEvidence: () => void
}) {
  const statusColor = run.status === 'failed' ? colors.severity.critical : run.status === 'complete' ? SECURE : ACCENT
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' },
      gap: 1,
      alignItems: 'center',
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1,
      px: 1,
      py: 0.75,
      minWidth: 0,
    }}>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          <Chip
            size="small"
            label={t(containerRunStatusKey(run.status))}
            sx={{ height: 20, borderRadius: 1, ...flytoTextStyles.codeTiny, color: statusColor, borderColor: alpha(statusColor, 0.4) }}
            variant="outlined"
          />
          <Typography sx={flytoTextStyles.codeLabel} noWrap>
            {run.source_type}
          </Typography>
          <Typography sx={{ ...flytoTextStyles.codeTiny, color: 'text.secondary' }} noWrap>
            {formatMaybeDate(run.created_at)}
          </Typography>
        </Box>
        <Typography sx={{ ...flytoTextStyles.codeTiny, color: 'text.secondary' }} noWrap>
          {run.images_scanned}/{run.images_requested} {t('warroom.containerImages')} · {run.findings_created} {t('warroom.containerFindings')}
        </Typography>
        {run.error && (
          <Typography sx={{ ...flytoTextStyles.codeTiny, color: 'error.main' }} noWrap>
            {run.error}
          </Typography>
        )}
      </Box>
      <Button
        size="small"
        variant={selected ? 'contained' : 'outlined'}
        startIcon={<FileText size={13} />}
        onClick={onEvidence}
        disabled={!run.evidence_signature && run.status !== 'complete' && run.status !== 'failed'}
      >
        {t('warroom.containerViewEvidence')}
      </Button>
    </Box>
  )
}

function parseImageRefs(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map(ref => ref.trim())
    .filter(Boolean)
}

function formatMaybeDate(raw?: string): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

function containerConnectionKindKey(kind: string): string {
  return kind === 'kubernetes' ? 'warroom.containerKindKubernetes' : 'warroom.containerKindRegistry'
}

function containerConnectionStatusKey(status: string): string {
  return status === 'disabled' ? 'warroom.containerConnectionDisabled' : 'warroom.containerConnectionActive'
}

function containerRunStatusKey(status: string): string {
  if (status === 'queued') return 'warroom.containerRunQueued'
  if (status === 'running') return 'warroom.containerRunRunning'
  if (status === 'complete') return 'warroom.containerRunComplete'
  if (status === 'failed') return 'warroom.containerRunFailed'
  return 'warroom.containerRunUnknown'
}

// ── Posture bar — terminal header + coverage ring + grade + sev tiles ─

function PostureBar({ posture, sevCounts, dark }: {
  posture: ContainerPosture | null
  sevCounts: Record<string, number>
  dark: boolean
}) {
  const imageCount = posture?.image_count ?? 0
  const scored = posture?.scored_count ?? 0
  const images = posture?.images ?? []
  const running = images.filter((img) => img.running).length
  const exposed = images.filter((img) => img.exposed).length
  const coverage = imageCount > 0 ? Math.round((scored / imageCount) * 100) : 0
  const grade = posture?.avg_grade
  const gradeColor = grade ? (GRADE_COLOR[grade] ?? colors.severity.low) : colors.severity.low

  return (
    <Paper variant="outlined" sx={{
      borderColor: alpha(ACCENT, dark ? 0.35 : 0.25),
      borderRadius: 2,
      overflow: 'hidden',
      minWidth: 0,
      bgcolor: dark ? alpha('#0b1220', 0.55) : 'background.paper',
      boxShadow: dark ? `inset 0 1px 0 ${alpha(ACCENT, 0.25)}` : 'none',
    }}>
      {/* Command-line header strip */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.85,
        borderBottom: '1px solid', borderColor: alpha(ACCENT, 0.2),
        bgcolor: alpha(ACCENT, dark ? 0.1 : 0.06),
      }}>
        <Terminal size={14} style={{ color: ACCENT }} />
        <Typography sx={{ ...flytoTextStyles.codeValue, color: ACCENT }}>
          $ trivy image --scanners vuln
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ ...flytoTextStyles.codeSmall, color: 'text.secondary', minWidth: 0 }} noWrap>
          {imageCount} {t('warroom.images')} · {scored} {t('warroom.scored')} · {running} {t('warroom.runningImages')} · {exposed} {t('warroom.exposedImages')}
        </Typography>
      </Box>

      <Box sx={{
        display: 'grid', gap: 2, p: 2,
        gridTemplateColumns: { xs: '1fr', sm: 'auto auto 1fr' }, alignItems: 'center',
      }}>
        {/* Coverage ring */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Ring pct={coverage} color={ACCENT} />
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ ...flytoTextStyles.codeTiny, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {t('warroom.coverage')}
            </Typography>
            <Typography sx={flytoTextStyles.codeValue}>
              {scored}/{imageCount}
            </Typography>
          </Box>
        </Box>

        {/* Grade */}
        <Box sx={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          px: 2.5, mx: { sm: 1 }, borderLeft: { sm: '1px solid' }, borderRight: { sm: '1px solid' },
          borderColor: { sm: 'divider' },
        }}>
          <Typography sx={{ ...flytoTextStyles.codeStrong, fontSize: 30, lineHeight: 1, color: gradeColor }}>
            {posture?.avg_display != null ? posture.avg_display : '—'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ ...flytoTextStyles.codeTiny, textTransform: 'uppercase', letterSpacing: '0.08em', mt: 0.25 }}>
            {grade ? grade : t('warroom.unscored')}
          </Typography>
        </Box>

        {/* Severity tiles */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1, minWidth: 0 }}>
          {SEV_ORDER.map(sev => (
            <SevTile key={sev} sev={sev} count={sevCounts[sev] ?? 0} dark={dark} />
          ))}
        </Box>
      </Box>
    </Paper>
  )
}

function SevTile({ sev, count, dark }: { sev: string; count: number; dark: boolean }) {
  const color = SEV[sev]
  const hot = count > 0 && (sev === 'CRITICAL' || sev === 'HIGH')
  return (
    <Box sx={{
      borderRadius: 1.5, px: 1.25, py: 1,
      border: '1px solid', borderColor: alpha(color, count > 0 ? 0.5 : 0.18),
      bgcolor: alpha(color, count > 0 ? (dark ? 0.14 : 0.08) : 0.04),
      boxShadow: hot ? `0 0 14px ${alpha(color, 0.45)}` : 'none',
      transition: 'box-shadow .2s',
      minWidth: 0,
    }}>
      <Typography sx={{ ...flytoTextStyles.codeStrong, fontSize: 20, lineHeight: 1, color: count > 0 ? color : 'text.disabled' }}>
        {count}
      </Typography>
      <Typography sx={{ ...flytoTextStyles.codeTiny, fontWeight: 700, letterSpacing: '0.06em', color: count > 0 ? color : 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis' }} noWrap>
        {sev}
      </Typography>
    </Box>
  )
}

function Ring({ pct, color, size = 64 }: { pct: number; color: string; size?: number }) {
  const sw = 6
  const r = (size - sw) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={alpha(color, 0.18)} strokeWidth={sw} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        style={{ fontFamily: MONO, fontWeight: 800, fontSize: 14, fill: 'currentColor' }}>
        {pct}%
      </text>
    </svg>
  )
}

// ── Per-image scan report card ──────────────────────────────────────

const ROW_CAP = 8

function ContainerSourceSectionView({ section, dark, busyFindingId, onAction }: {
  section: ContainerSourceSection
  dark: boolean
  busyFindingId?: string
  onAction: (action: ContainerFindingAction, findingId: string) => void
}) {
  const color = containerSourceColor(section.sourceKind)
  const sourceCounts = SEV_ORDER.filter(s => section.counts[s] > 0)
  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
      borderTop: '1px solid',
      borderColor: alpha(color, dark ? 0.35 : 0.25),
      pt: 1.25,
      minWidth: 0,
    }}>
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) auto' },
        gap: 1,
        alignItems: 'center',
        minWidth: 0,
      }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
            <Chip
              size="small"
              label={section.sourceLabel}
              sx={{
                height: 22,
                borderRadius: 1,
                ...flytoTextStyles.codeTiny,
                fontWeight: 900,
                color,
                bgcolor: alpha(color, dark ? 0.16 : 0.1),
                border: `1px solid ${alpha(color, 0.38)}`,
              }}
            />
            <Typography sx={{ ...flytoTextStyles.codeStrong, fontSize: 14, minWidth: 0 }} noWrap title={section.subjectLabel}>
              {section.subjectKindLabel}: {section.subjectLabel}
            </Typography>
            {section.subjectDetail && (
              <Typography sx={{ ...flytoTextStyles.codeTiny, color: 'text.secondary', minWidth: 0 }} noWrap title={section.subjectDetail}>
                {section.subjectDetail}
              </Typography>
            )}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4, maxWidth: 860 }}>
            {section.sourceDescription}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
          <Chip size="small" label={`${section.imageGroups.length} ${t('warroom.containerImages')}`} sx={{ height: 22, borderRadius: 1, ...flytoTextStyles.codeTiny }} />
          <Chip size="small" label={`${section.items.length} ${t('warroom.containerFindings')}`} sx={{ height: 22, borderRadius: 1, ...flytoTextStyles.codeTiny }} />
          {sourceCounts.map(sev => (
            <Chip
              key={sev}
              size="small"
              label={`${section.counts[sev]} ${sev[0]}`}
              sx={{
                height: 22,
                borderRadius: 1,
                ...flytoTextStyles.codeTiny,
                fontWeight: 800,
                color: SEV[sev],
                bgcolor: alpha(SEV[sev], dark ? 0.16 : 0.1),
              }}
            />
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        {section.imageGroups.map(group => (
          <ImageReport
            key={`${section.key}:${group.image}`}
            group={group}
            dark={dark}
            busyFindingId={busyFindingId}
            onAction={onAction}
          />
        ))}
      </Box>
    </Box>
  )
}

function ImageReport({ group, dark, busyFindingId, onAction }: {
  group: { image: string; items: ContainerFinding[]; counts: Record<string, number>; worst: number }
  dark: boolean
  busyFindingId?: string
  onAction: (action: ContainerFindingAction, findingId: string) => void
}) {
  const worstColor = SEV[SEV_ORDER[group.worst] ?? 'LOW']
  const shown = group.items.slice(0, ROW_CAP)
  const hidden = group.items.length - shown.length
  const repo = group.items[0]?.repo_id

  return (
    <Paper variant="outlined" sx={{
      borderColor: 'divider', borderRadius: 2, overflow: 'hidden',
      borderLeft: '3px solid', borderLeftColor: worstColor,
      minWidth: 0,
    }}>
      {/* Title bar — monospace image ref + severity summary */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1,
        borderBottom: '1px solid', borderColor: 'divider',
        bgcolor: alpha(worstColor, dark ? 0.1 : 0.05),
        flexWrap: 'wrap',
      }}>
        <Layers size={14} style={{ color: worstColor, flexShrink: 0 }} />
        <Typography sx={{
          flex: '1 1 220px',
          ...flytoTextStyles.codeValue,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }} title={group.image} noWrap>
          {group.image}
        </Typography>
        <Box sx={{ flex: { xs: '0 0 100%', sm: 1 }, display: { xs: 'none', sm: 'block' } }} />
        {SEV_ORDER.filter(s => group.counts[s] > 0).map(s => (
          <Chip key={s} size="small" label={`${group.counts[s]} ${s[0]}`}
            sx={{
              height: 20, ...flytoTextStyles.codeTiny, fontWeight: 800, borderRadius: 1,
              color: SEV[s], bgcolor: alpha(SEV[s], dark ? 0.16 : 0.1),
              border: `1px solid ${alpha(SEV[s], 0.4)}`,
            }} />
        ))}
        {repo && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 0.5, minWidth: 0, maxWidth: { xs: '100%', sm: 220 } }}>
            <GitBranch size={11} style={{ opacity: 0.5 }} />
            <Typography sx={{ ...flytoTextStyles.codeTiny, color: 'text.secondary' }} noWrap>{repo}</Typography>
          </Box>
        )}
      </Box>

      {/* CVE rows */}
      <Box>
        {shown.map(f => {
          const color = SEV[normSev(f.severity)]
          return (
            <Box key={f.id} sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'auto minmax(0, 1fr)', md: 'auto 150px minmax(0, 1fr) auto auto' },
              alignItems: 'center', gap: 1.25, px: 1.5, py: 0.85,
              borderTop: '1px solid', borderColor: 'divider',
              '&:hover': { bgcolor: 'action.hover' },
              minWidth: 0,
            }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, boxShadow: `0 0 6px ${alpha(color, 0.6)}`, flexShrink: 0 }} />
              <Typography sx={{ ...flytoTextStyles.codeValue, color, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} noWrap>
                {f.cve_id || '—'}
              </Typography>
              <Typography sx={{ ...flytoTextStyles.codeSmall, color: 'text.secondary', display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.5, minWidth: 0 }} noWrap>
                <Package size={11} style={{ opacity: 0.6, flexShrink: 0 }} />
                {f.package_name}@{f.installed_version}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifySelf: { xs: 'start', md: 'end' }, gridColumn: { xs: '2 / -1', md: 'auto' }, minWidth: 0 }}>
                {f.fixed_version ? (
                  <>
                    <ArrowRight size={12} style={{ color: SECURE }} />
                    <Typography sx={{ ...flytoTextStyles.codeValue, color: SECURE, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} noWrap>
                      {f.fixed_version}
                    </Typography>
                  </>
                ) : (
                  <Typography sx={{ ...flytoTextStyles.codeSmall, color: 'text.disabled' }} noWrap>
                    {t('warroom.containerNoFix')}
                  </Typography>
                )}
              </Box>
              <FindingActions
                finding={f}
                busy={busyFindingId === f.id}
                onAction={onAction}
              />
            </Box>
          )
        })}
      </Box>

      {hidden > 0 && (
        <Box sx={{ px: 1.5, py: 0.75, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
          <Typography sx={{ ...flytoTextStyles.codeTiny, color: 'text.secondary' }}>
            + {hidden} {t('warroom.moreCves')}
          </Typography>
        </Box>
      )}
    </Paper>
  )
}

function FindingActions({ finding, busy, onAction }: {
  finding: ContainerFinding
  busy: boolean
  onAction: (action: ContainerFindingAction, findingId: string) => void
}) {
  const disabled = busy
  return (
    <Box sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 0.25,
      justifySelf: { xs: 'start', md: 'end' },
      gridColumn: { xs: '2 / -1', md: 'auto' },
    }}>
      <Tooltip title={t('warroom.containerVerifyFixed')}>
        <span>
          <IconButton
            size="small"
            aria-label={t('warroom.containerVerifyFixed')}
            disabled={disabled || finding.status === 'false_positive'}
            onClick={() => onAction('verify', finding.id)}
            sx={{ width: 30, height: 30 }}
          >
            <CheckCircle2 size={14} />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('warroom.containerFalsePositive')}>
        <span>
          <IconButton
            size="small"
            aria-label={t('warroom.containerFalsePositive')}
            disabled={disabled || finding.status === 'false_positive'}
            onClick={() => onAction('false_positive', finding.id)}
            sx={{ width: 30, height: 30 }}
          >
            <ShieldOff size={14} />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t('warroom.containerReopen')}>
        <span>
          <IconButton
            size="small"
            aria-label={t('warroom.containerReopen')}
            disabled={disabled || finding.status === 'open'}
            onClick={() => onAction('reopen', finding.id)}
            sx={{ width: 30, height: 30 }}
          >
            <RotateCcw size={14} />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  )
}

// ── "All clear" panel — shown when there are zero findings ──────────

function SecurePanel({ imageCount, dark }: { imageCount: number; dark: boolean }) {
  return (
    <Paper variant="outlined" sx={{
      borderColor: alpha(SECURE, dark ? 0.4 : 0.3), borderRadius: 2,
      p: { xs: 3, md: 5 }, textAlign: 'center',
      bgcolor: alpha(SECURE, dark ? 0.06 : 0.04),
      boxShadow: dark ? `inset 0 0 60px ${alpha(SECURE, 0.06)}` : 'none',
    }}>
      <Box sx={{
        width: 64, height: 64, mx: 'auto', mb: 2, borderRadius: 2,
        display: 'grid', placeItems: 'center',
        bgcolor: alpha(SECURE, 0.14), border: `1px solid ${alpha(SECURE, 0.4)}`,
        boxShadow: `0 0 24px ${alpha(SECURE, 0.35)}`, color: SECURE,
      }}>
        <ShieldCheck size={30} />
      </Box>
      <Typography sx={{ ...flytoTextStyles.codeStrong, fontSize: 22, letterSpacing: '0.05em', color: SECURE }}>
        {t('warroom.containerSecure')}
      </Typography>
      <Typography sx={{ ...flytoTextStyles.codeSmall, color: 'text.secondary', mt: 1 }}>
        {imageCount} {t('warroom.imagesScannedClean')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2, maxWidth: 560, mx: 'auto', lineHeight: 1.5 }}>
        {t('warroom.containerEmptyDesc')}
      </Typography>
    </Paper>
  )
}
