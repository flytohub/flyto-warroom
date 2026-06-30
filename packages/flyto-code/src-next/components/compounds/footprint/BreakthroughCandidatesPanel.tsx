/**
 * BreakthroughCandidatesPanel — BOY evidence-core attack-path candidates.
 *
 * This is separate from CandidatePathsPanel's ownership gate. Ownership
 * candidates answer "is this ours?"; BOY candidates answer "could this become
 * a real breakthrough, and what validation work proves or refutes it?"
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import Paper from '@mui/material/Paper'
import Divider from '@mui/material/Divider'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import CircularProgress from '@mui/material/CircularProgress'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import LinearProgress from '@mui/material/LinearProgress'
import { CheckCircle2, ClipboardCheck, FileText, GitBranch, ListFilter, RefreshCw, Send, ShieldCheck, XCircle } from 'lucide-react'

import {
  DataTable,
  EvidenceDrawer,
  type MRT_ColumnDef,
} from '@compounds/_shared'
import { ResearchFootprintDrawer } from './ResearchFootprintDrawer'
import { invalidateFootprintClosure } from '@lib/footprintLoop'
import { qk } from '@lib/queryKeys'
import { t, tOr } from '@lib/i18n';
import {
  completeBOYValidationTask,
  createBOYMissingEvidenceTask,
  createBOYValidationTask,
  getBOYAttackPathCandidates,
  getBOYAttackPathCandidateDetail,
  getBOYBreakthroughPathDetail,
  getBOYBreakthroughPaths,
  getBOYValidationTasks,
  researchFootprintCandidateSelector,
  researchFootprintPathSelector,
  recompileBOYBreakthroughPaths,
  type BOYAttackPathCandidate,
  type BOYBreakthroughPath,
  type BOYMissingEvidenceItem,
  type BOYValidationTask,
  type ResearchFootprintSelector,
} from '@lib/engine/code/footprintSurface'

interface Props {
  orgId: string
}

type ToastState = { open: boolean; severity: 'success' | 'error' | 'info'; msg: string }
type CompletionState = {
  task: BOYValidationTask
  candidate?: BOYAttackPathCandidate
}
type BreakthroughView = 'paths' | 'missing' | 'candidates' | 'queue'
type MissingGapRow = BOYMissingEvidenceItem & { path?: BOYBreakthroughPath }

const completionOptions = [
  { value: 'validated_exploitable', label: 'Record result: exploitable', labelKey: 'footprint.breakthrough.completionOption.exploitable' },
  { value: 'validated_not_exploitable', label: 'Record result: not exploitable', labelKey: 'footprint.breakthrough.completionOption.notExploitable' },
  { value: 'remediated', label: 'Record result: remediated', labelKey: 'footprint.breakthrough.completionOption.remediated' },
  { value: 'accepted_risk', label: 'Record result: accepted risk', labelKey: 'footprint.breakthrough.completionOption.acceptedRisk' },
] as const

function scoreTone(score: number): 'error' | 'warning' | 'info' | 'success' {
  if (score >= 80) return 'error'
  if (score >= 60) return 'warning'
  if (score >= 35) return 'info'
  return 'success'
}

function stateTone(state: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (state) {
    case 'validated':
      return 'success'
    case 'needs_validation':
      return 'warning'
    case 'dead_end':
      return 'default'
    case 'remediated':
      return 'info'
    case 'accepted_risk':
      return 'error'
    default:
      return 'default'
  }
}

function humanize(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function activeTask(tasks: BOYValidationTask[]): BOYValidationTask | undefined {
  return tasks.find(t => t.status === 'queued_for_validation' && !t.completed_at)
}

function latestTask(tasks: BOYValidationTask[]): BOYValidationTask | undefined {
  return [...tasks].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0]
}

function gapTone(status: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (status) {
    case 'missing':
      return 'warning'
    case 'task_queued':
      return 'info'
    case 'satisfied':
      return 'success'
    case 'refuted':
      return 'default'
    default:
      return 'default'
  }
}

function parseStringList(raw?: string): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function metric(label: string, value: number | string, tone: 'default' | 'success' | 'warning' | 'error' | 'info' = 'default') {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, minWidth: 0 }}>
      <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>
        {value}
      </Typography>
      <Typography sx={{
        fontSize: 12,
        color: tone === 'default' ? 'text.secondary' : `${tone}.main`,
        fontWeight: tone === 'default' ? 500 : 700,
      }}>
        {label}
      </Typography>
    </Paper>
  )
}

export function BreakthroughCandidatesPanel({ orgId }: Props) {
  const qc = useQueryClient()
  const [view, setView] = useState<BreakthroughView>('paths')
  const [drawerCandidate, setDrawerCandidate] = useState<BOYAttackPathCandidate | null>(null)
  const [drawerPath, setDrawerPath] = useState<BOYBreakthroughPath | null>(null)
  const [researchSelector, setResearchSelector] = useState<ResearchFootprintSelector | null>(null)
  const [completion, setCompletion] = useState<CompletionState | null>(null)
  const [completeStatus, setCompleteStatus] = useState<(typeof completionOptions)[number]['value']>('validated_exploitable')
  const [completeResult, setCompleteResult] = useState('')
  const [completeNotes, setCompleteNotes] = useState('')
  const [kindFilter, setKindFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState('all')
  const [verifierFilter, setVerifierFilter] = useState('all')
  const [minPriority, setMinPriority] = useState('0')
  const [toast, setToast] = useState<ToastState>({ open: false, severity: 'info', msg: '' })

  const candidatesQ = useQuery({
    queryKey: qk.footprint.breakthroughCandidates(orgId, 100),
    queryFn: () => getBOYAttackPathCandidates(orgId, 100),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const tasksQ = useQuery({
    queryKey: qk.footprint.validationTasks(orgId, 100),
    queryFn: () => getBOYValidationTasks(orgId, 100),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const pathsQ = useQuery({
    queryKey: qk.footprint.breakthroughPaths(orgId, 100),
    queryFn: () => getBOYBreakthroughPaths(orgId, 100),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const detailQ = useQuery({
    queryKey: qk.footprint.breakthroughCandidateDetail(orgId, drawerCandidate?.id),
    queryFn: () => getBOYAttackPathCandidateDetail(orgId, drawerCandidate?.id ?? ''),
    enabled: !!orgId && !!drawerCandidate?.id,
    staleTime: 30_000,
  })
  const pathDetailQ = useQuery({
    queryKey: qk.footprint.breakthroughPathDetail(orgId, drawerPath?.id),
    queryFn: () => getBOYBreakthroughPathDetail(orgId, drawerPath?.id ?? ''),
    enabled: !!orgId && !!drawerPath?.id,
    staleTime: 30_000,
  })

  const tasksByHypothesis = useMemo(() => {
    const m = new Map<string, BOYValidationTask[]>()
    for (const t of tasksQ.data?.tasks ?? []) {
      const list = m.get(t.hypothesis_id) ?? []
      list.push(t)
      m.set(t.hypothesis_id, list)
    }
    return m
  }, [tasksQ.data])

  const allRows = useMemo(() => candidatesQ.data?.candidates ?? [], [candidatesQ.data])
  const allPaths = useMemo(() => pathsQ.data?.paths ?? [], [pathsQ.data])
  const missingRows = useMemo<MissingGapRow[]>(
    () => allPaths.flatMap(path => (path.missing_evidence_items ?? []).map(gap => ({ ...gap, path }))),
    [allPaths],
  )
  const kindOptions = useMemo(() => Array.from(new Set(allRows.map(r => r.kind))).sort(), [allRows])
  const stateOptions = useMemo(() => Array.from(new Set(allRows.map(r => r.state))).sort(), [allRows])
  const verifierOptions = useMemo(() => Array.from(new Set(allRows.map(r => r.recommended_verifier || 'analyst_review'))).sort(), [allRows])
  const rows = useMemo(() => {
    const min = Number.parseInt(minPriority, 10) || 0
    return allRows.filter((row) => {
      if (kindFilter !== 'all' && row.kind !== kindFilter) return false
      if (stateFilter !== 'all' && row.state !== stateFilter) return false
      if (verifierFilter !== 'all' && (row.recommended_verifier || 'analyst_review') !== verifierFilter) return false
      if (row.priority_score < min) return false
      return true
    })
  }, [allRows, kindFilter, minPriority, stateFilter, verifierFilter])
  const queued = useMemo(() => (tasksQ.data?.tasks ?? []).filter(t => t.status === 'queued_for_validation' && !t.completed_at), [tasksQ.data])
  const deadEnds = allRows.filter(r => r.state === 'dead_end').length
  const queuedGapCount = missingRows.filter(g => g.status === 'task_queued').length

  const refresh = () => {
    invalidateFootprintClosure(qc, orgId)
  }

  const recompileMut = useMutation({
    mutationFn: () => recompileBOYBreakthroughPaths(orgId),
    onSuccess: (data) => {
      invalidateFootprintClosure(qc, orgId)
      setToast({
        open: true,
        severity: 'success',
        msg: t('footprint.breakthrough.toastRecompiled')
          .replace('{n}', String(data.compiled))
          .replace('{p}', String(data.paths ?? 0))
          .replace('{q}', String(data.auto_queued)),
      })
    },
    onError: (err) => {
      setToast({ open: true, severity: 'error', msg: (err as Error).message })
    },
  })

  const createMut = useMutation({
    mutationFn: (c: BOYAttackPathCandidate) => createBOYValidationTask(orgId, {
      hypothesis_id: c.id,
      verifier: c.recommended_verifier,
    }),
    onSuccess: (_data, c) => {
      invalidateFootprintClosure(qc, orgId)
      setToast({
        open: true,
        severity: 'success',
        msg: t('footprint.breakthrough.toastQueued').replace('{target}', c.subject_value),
      })
    },
    onError: (err) => {
      setToast({ open: true, severity: 'error', msg: (err as Error).message })
    },
  })

  const gapTaskMut = useMutation({
    mutationFn: (gap: BOYMissingEvidenceItem) => createBOYMissingEvidenceTask(orgId, gap.id),
    onSuccess: (_data, gap) => {
      invalidateFootprintClosure(qc, orgId)
      setToast({
        open: true,
        severity: 'success',
        msg: t('footprint.breakthrough.toastGapQueued').replace('{target}', gap.title),
      })
    },
    onError: (err) => {
      setToast({ open: true, severity: 'error', msg: (err as Error).message })
    },
  })

  const completeMut = useMutation({
    mutationFn: () => {
      if (!completion) throw new Error('No validation task selected')
      return completeBOYValidationTask(orgId, completion.task.id, {
        status: completeStatus,
        result: completeResult || completeStatus,
        notes: completeNotes,
      })
    },
    onSuccess: () => {
      setCompletion(null)
      setCompleteResult('')
      setCompleteNotes('')
      invalidateFootprintClosure(qc, orgId)
      setToast({ open: true, severity: 'success', msg: t('footprint.breakthrough.toastCompleted') })
    },
    onError: (err) => {
      setToast({ open: true, severity: 'error', msg: (err as Error).message })
    },
  })

  const openComplete = (task: BOYValidationTask, candidate?: BOYAttackPathCandidate) => {
    setCompletion({ task, candidate })
    setCompleteStatus('validated_exploitable')
    setCompleteResult('')
    setCompleteNotes('')
  }

  const columns = useMemo<MRT_ColumnDef<BOYAttackPathCandidate>[]>(
    () => [
      {
        accessorKey: 'subject_value',
        header: t('footprint.breakthrough.colSubject'),
        size: 230,
        Cell: ({ row }) => (
          <Stack spacing={0.25}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {row.original.subject_value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {row.original.subject_type} · {humanize(row.original.kind)}
            </Typography>
          </Stack>
        ),
      },
      {
        accessorKey: 'priority_score',
        header: t('footprint.breakthrough.colPriority'),
        size: 90,
        Cell: ({ row }) => (
          <Chip
            size="small"
            color={scoreTone(row.original.priority_score)}
            label={row.original.priority_score}
            sx={{ fontWeight: 800, minWidth: 48 }}
          />
        ),
      },
      {
        accessorKey: 'state',
        header: t('footprint.breakthrough.colState'),
        size: 130,
        Cell: ({ row }) => (
          <Chip size="small" color={stateTone(row.original.state)} label={humanize(row.original.state)} />
        ),
      },
      {
        accessorKey: 'recommended_verifier',
        header: t('footprint.breakthrough.colVerifier'),
        size: 150,
        Cell: ({ row }) => (
          <Typography variant="body2">
            {humanize(row.original.recommended_verifier || 'analyst_review')}
          </Typography>
        ),
      },
      {
        id: 'evidence',
        header: t('footprint.breakthrough.colEvidence'),
        size: 130,
        Cell: ({ row }) => (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            <Chip size="small" variant="outlined" label={`${row.original.evidence_count ?? row.original.evidence_ids.length} obs`} />
            {(row.original.relation_count ?? row.original.relation_ids.length) > 0 && (
              <Chip size="small" variant="outlined" label={`${row.original.relation_count ?? row.original.relation_ids.length} rel`} />
            )}
          </Stack>
        ),
      },
      {
        id: 'task',
        header: t('footprint.breakthrough.colValidation'),
        size: 190,
        enableSorting: false,
        Cell: ({ row }) => {
          const tasks = tasksByHypothesis.get(row.original.id) ?? []
          const active = activeTask(tasks)
          const latest = latestTask(tasks)
          if (active) {
            return (
              <Button
                size="small"
                variant="contained"
                color="warning"
                startIcon={<ClipboardCheck size={14} />}
                onClick={(e) => {
                  e.stopPropagation()
                  openComplete(active, row.original)
                }}
              >
                {t('footprint.breakthrough.btnComplete')}
              </Button>
            )
          }
          if (row.original.state === 'needs_validation') {
            return (
              <Button
                size="small"
                variant="outlined"
                startIcon={createMut.isPending ? <CircularProgress size={13} /> : <Send size={14} />}
                disabled={createMut.isPending}
                onClick={(e) => {
                  e.stopPropagation()
                  createMut.mutate(row.original)
                }}
              >
                {t('footprint.breakthrough.btnQueue')}
              </Button>
            )
          }
          return (
            <Chip
              size="small"
              variant="outlined"
              label={latest ? humanize(latest.status) : humanize(row.original.state)}
            />
          )
        },
      },
    ],
    [createMut, tasksByHypothesis],
  )

  const pathColumns = useMemo<MRT_ColumnDef<BOYBreakthroughPath>[]>(
    () => [
      {
        accessorKey: 'title',
        header: t('footprint.breakthrough.pathColPath'),
        size: 300,
        Cell: ({ row }) => (
          <Stack spacing={0.25}>
            <Typography variant="body2" sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}>
              {row.original.subject_value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {humanize(row.original.kind)} · {row.original.title}
            </Typography>
          </Stack>
        ),
      },
      {
        accessorKey: 'priority_score',
        header: t('footprint.breakthrough.pathColPriority'),
        size: 90,
        Cell: ({ row }) => (
          <Chip size="small" color={scoreTone(row.original.priority_score)} label={row.original.priority_score} sx={{ fontWeight: 800, minWidth: 48 }} />
        ),
      },
      {
        accessorKey: 'validation_readiness',
        header: t('footprint.breakthrough.pathColReadiness'),
        size: 150,
        Cell: ({ row }) => (
          <Stack spacing={0.5}>
            <LinearProgress
              variant="determinate"
              value={Math.max(0, Math.min(100, row.original.validation_readiness))}
              color={row.original.validation_readiness >= 70 ? 'success' : 'warning'}
              sx={{ height: 6, borderRadius: 3 }}
            />
            <Typography variant="caption" color="text.secondary">{row.original.validation_readiness}/100</Typography>
          </Stack>
        ),
      },
      {
        id: 'gaps',
        header: t('footprint.breakthrough.pathColGaps'),
        size: 170,
        Cell: ({ row }) => (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            <Chip size="small" color={row.original.missing_evidence > 0 ? 'warning' : 'success'} variant="outlined" label={`${row.original.missing_evidence} missing`} />
            {(row.original.missing_evidence_items ?? []).some(g => g.status === 'task_queued') && (
              <Chip size="small" color="info" variant="outlined" label="queued" />
            )}
          </Stack>
        ),
      },
      {
        accessorKey: 'state',
        header: t('footprint.breakthrough.pathColState'),
        size: 120,
        Cell: ({ row }) => <Chip size="small" color={stateTone(row.original.state)} label={humanize(row.original.state)} />,
      },
      {
        id: 'actions',
        header: t('footprint.breakthrough.pathColActions'),
        size: 210,
        enableSorting: false,
        Cell: ({ row }) => (
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            <Button
              size="small"
              variant="outlined"
              startIcon={<GitBranch size={14} />}
              onClick={(e) => {
                e.stopPropagation()
                setDrawerPath(row.original)
              }}
            >
              {t('common.details')}
            </Button>
            <Button
              size="small"
              variant="text"
              startIcon={<FileText size={14} />}
              onClick={(e) => {
                e.stopPropagation()
                setResearchSelector(researchFootprintPathSelector({ id: row.original.id }))
              }}
            >
              {t('footprint.breakthrough.btnResearch')}
            </Button>
          </Stack>
        ),
      },
    ],
    [],
  )

  const gapColumns = useMemo<MRT_ColumnDef<MissingGapRow>[]>(
    () => [
      {
        accessorKey: 'title',
        header: t('footprint.breakthrough.gapColGap'),
        size: 300,
        Cell: ({ row }) => (
          <Stack spacing={0.25}>
            <Typography variant="body2" sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}>
              {row.original.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {row.original.path?.subject_value ?? row.original.path_id} · {row.original.evidence_source}
            </Typography>
          </Stack>
        ),
      },
      {
        accessorKey: 'priority',
        header: t('footprint.breakthrough.gapColPriority'),
        size: 90,
        Cell: ({ row }) => <Chip size="small" color={scoreTone(row.original.priority)} label={row.original.priority} sx={{ fontWeight: 800, minWidth: 48 }} />,
      },
      {
        accessorKey: 'status',
        header: t('footprint.breakthrough.gapColStatus'),
        size: 120,
        Cell: ({ row }) => <Chip size="small" color={gapTone(row.original.status)} label={humanize(row.original.status)} />,
      },
      {
        accessorKey: 'verifier',
        header: t('footprint.breakthrough.gapColVerifier'),
        size: 160,
        Cell: ({ row }) => <Typography variant="body2">{humanize(row.original.verifier || 'analyst_review')}</Typography>,
      },
      {
        id: 'action',
        header: t('footprint.breakthrough.gapColAction'),
        size: 150,
        enableSorting: false,
        Cell: ({ row }) => (
          row.original.status === 'missing' ? (
            <Stack direction="row" spacing={0.5}>
              <Button
                size="small"
                variant="outlined"
                startIcon={gapTaskMut.isPending ? <CircularProgress size={13} /> : <Send size={14} />}
                disabled={gapTaskMut.isPending}
              onClick={(e) => {
                e.stopPropagation()
                gapTaskMut.mutate(row.original)
              }}
            >
              {t('footprint.breakthrough.btnQueue')}
            </Button>
            <Button
              size="small"
              variant="text"
              startIcon={<FileText size={14} />}
              onClick={(e) => {
                e.stopPropagation()
                setResearchSelector(researchFootprintPathSelector({ id: row.original.path_id }))
              }}
            >
              Research
            </Button>
            </Stack>
          ) : (
            <Button
              size="small"
              variant="text"
              startIcon={<FileText size={14} />}
              onClick={(e) => {
                e.stopPropagation()
                setResearchSelector(researchFootprintPathSelector({ id: row.original.path_id }))
              }}
            >
              Research
            </Button>
          )
        ),
      },
    ],
    [gapTaskMut],
  )

  const drawerModel = detailQ.data?.candidate ?? drawerCandidate
  const drawerObservations = detailQ.data?.observations ?? []
  const drawerRelations = detailQ.data?.relations ?? []
  const drawerTasks = detailQ.data?.validation_tasks ?? (drawerCandidate ? tasksByHypothesis.get(drawerCandidate.id) ?? [] : [])
  const drawerPlaybook = drawerModel?.validation_playbook
  const drawerPathModel = pathDetailQ.data?.path ?? drawerPath
  const drawerPathNodes = pathDetailQ.data?.nodes ?? []
  const drawerPathEdges = pathDetailQ.data?.edges ?? []
  const drawerPathGaps = pathDetailQ.data?.missing_evidence ?? drawerPathModel?.missing_evidence_items ?? []
  const drawerPathWhyNow = parseStringList(drawerPathModel?.why_now_json)

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 1.5 }}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
            {t('footprint.breakthrough.title')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('footprint.breakthrough.subtitle')}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Tooltip title={t('common.refresh')}>
            <span>
              <Button size="small" variant="outlined" startIcon={<RefreshCw size={14} />} onClick={refresh}>
                {t('common.refresh')}
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={t('footprint.breakthrough.recompileTip')}>
            <span>
              <Button
                size="small"
                variant="contained"
                startIcon={recompileMut.isPending ? <CircularProgress size={14} /> : <GitBranch size={14} />}
                disabled={recompileMut.isPending}
                onClick={() => recompileMut.mutate()}
              >
                {t('footprint.breakthrough.recompile')}
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, minmax(0, 1fr))' },
          gap: 1,
          mb: 1.5,
        }}
      >
        {metric(t('footprint.breakthrough.metricPaths'), allPaths.length)}
        {metric(t('footprint.breakthrough.metricMissingEvidence'), missingRows.filter(g => g.status === 'missing').length, 'warning')}
        {metric(t('footprint.breakthrough.metricQueued'), queued.length + queuedGapCount, 'info')}
        {metric(t('footprint.breakthrough.metricCandidates'), allRows.length)}
      </Box>

      <Paper variant="outlined" sx={{ mb: 1.5 }}>
        <Tabs
          value={view}
          onChange={(_e, next: BreakthroughView) => setView(next)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ minHeight: 42, px: 1 }}
        >
          <Tab value="paths" label={t('footprint.breakthrough.tabPaths')} sx={{ minHeight: 42 }} />
          <Tab value="missing" label={t('footprint.breakthrough.tabMissing')} sx={{ minHeight: 42 }} />
          <Tab value="candidates" label={t('footprint.breakthrough.tabCandidates')} sx={{ minHeight: 42 }} />
          <Tab value="queue" label={t('footprint.breakthrough.tabQueue')} sx={{ minHeight: 42 }} />
        </Tabs>
      </Paper>

      {view === 'candidates' && (
        <>
          <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'stretch', md: 'center' }}>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 112 }}>
            <ListFilter size={16} />
            <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
              {t('footprint.breakthrough.filters')}
            </Typography>
          </Stack>
          <TextField
            select
            size="small"
            label={t('footprint.breakthrough.filterKind')}
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            sx={{ minWidth: 170 }}
          >
            <MenuItem value="all">{t('common.all')}</MenuItem>
            {kindOptions.map(kind => <MenuItem key={kind} value={kind}>{humanize(kind)}</MenuItem>)}
          </TextField>
          <TextField
            select
            size="small"
            label={t('footprint.breakthrough.filterState')}
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="all">{t('common.all')}</MenuItem>
            {stateOptions.map(state => <MenuItem key={state} value={state}>{humanize(state)}</MenuItem>)}
          </TextField>
          <TextField
            select
            size="small"
            label={t('footprint.breakthrough.filterVerifier')}
            value={verifierFilter}
            onChange={(e) => setVerifierFilter(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="all">{t('common.all')}</MenuItem>
            {verifierOptions.map(verifier => <MenuItem key={verifier} value={verifier}>{humanize(verifier)}</MenuItem>)}
          </TextField>
          <TextField
            size="small"
            label={t('footprint.breakthrough.filterMinPriority')}
            value={minPriority}
            onChange={(e) => setMinPriority(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
            sx={{ width: { xs: '100%', md: 130 } }}
            inputProps={{ inputMode: 'numeric' }}
          />
          <Chip size="small" variant="outlined" label={`${rows.length}/${allRows.length}`} sx={{ alignSelf: { xs: 'flex-start', md: 'center' } }} />
        </Stack>
          </Paper>

          {(candidatesQ.error || tasksQ.error) && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          {t('footprint.breakthrough.apiUnavailable')}: {String(((candidatesQ.error ?? tasksQ.error) as Error | undefined)?.message ?? 'unknown')}
        </Alert>
          )}

          <DataTable
        columns={columns}
        data={rows}
        isLoading={candidatesQ.isLoading || tasksQ.isLoading}
        maxBodyHeight={500}
        emptyText={t('footprint.breakthrough.empty')}
        onRowClick={(row) => setDrawerCandidate(row)}
          />
        </>
      )}

      {view === 'paths' && (
        <>
          {pathsQ.error && (
            <Alert severity="warning" sx={{ mb: 1.5 }}>
              {t('footprint.breakthrough.pathApiUnavailable')}: {String((pathsQ.error as Error | undefined)?.message ?? 'unknown')}
            </Alert>
          )}
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            {pathsQ.isLoading ? (
              <Paper variant="outlined" sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={22} />
              </Paper>
            ) : allPaths.length === 0 ? (
              <Alert severity="info">
                {t('footprint.breakthrough.pathEmpty')}
              </Alert>
            ) : (
              <Stack spacing={1}>
                {allPaths.map(path => (
                  <Paper key={path.id} variant="outlined" sx={{ p: 1.25 }}>
                    <Stack spacing={1}>
                      <Box>
                        <Typography sx={{ fontSize: 14, fontWeight: 800, overflowWrap: 'anywhere' }}>
                          {path.subject_value}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>
                          {humanize(path.kind)} · {path.title}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                        <Chip size="small" color={scoreTone(path.priority_score)} label={`Priority ${path.priority_score}`} />
                        <Chip size="small" variant="outlined" label={`Readiness ${path.validation_readiness}/100`} />
                        <Chip size="small" color={path.missing_evidence > 0 ? 'warning' : 'success'} variant="outlined" label={`${path.missing_evidence} missing`} />
                        <Chip size="small" color={stateTone(path.state)} label={humanize(path.state)} />
                      </Stack>
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<GitBranch size={14} />}
                          onClick={() => setDrawerPath(path)}
                        >
                          {t('common.details')}
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<FileText size={14} />}
                          onClick={() => setResearchSelector(researchFootprintPathSelector({ id: path.id }))}
                        >
                          {t('footprint.breakthrough.btnResearch')}
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </Box>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <DataTable
              columns={pathColumns}
              data={allPaths}
              isLoading={pathsQ.isLoading}
              maxBodyHeight={520}
              emptyText={t('footprint.breakthrough.pathEmpty')}
              onRowClick={(row) => setDrawerPath(row)}
            />
          </Box>
        </>
      )}

      {view === 'missing' && (
        <DataTable
          columns={gapColumns}
          data={missingRows}
          isLoading={pathsQ.isLoading}
          maxBodyHeight={520}
          emptyText={t('footprint.breakthrough.gapEmpty')}
          onRowClick={(row) => {
            const path = row.path ?? allPaths.find(p => p.id === row.path_id)
            if (path) setDrawerPath(path)
          }}
        />
      )}

      {view === 'queue' && (tasksQ.data?.tasks?.length ?? 0) > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5, mt: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <ShieldCheck size={16} />
            <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
              {t('footprint.breakthrough.queueTitle')}
            </Typography>
            <Chip size="small" label={tasksQ.data?.tasks.length ?? 0} />
          </Stack>
          <Stack divider={<Divider flexItem />} spacing={1}>
            {(tasksQ.data?.tasks ?? []).slice(0, 6).map((task) => {
              const candidate = allRows.find(r => r.id === task.hypothesis_id)
              const isActive = task.status === 'queued_for_validation' && !task.completed_at
              return (
                <Stack key={task.id} direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>
                      {candidate?.subject_value ?? task.hypothesis_id}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                      {humanize(task.verifier || 'analyst_review')} · {humanize(task.status)}
                    </Typography>
                  </Box>
                  {isActive ? (
                    <Stack direction="row" spacing={0.75}>
                      <Button size="small" variant="outlined" startIcon={<FileText size={14} />} onClick={() => setResearchSelector(researchFootprintCandidateSelector({ id: task.hypothesis_id }))}>
                        Research
                      </Button>
                      <Button size="small" variant="outlined" startIcon={<ClipboardCheck size={14} />} onClick={() => openComplete(task, candidate)}>
                        {t('footprint.breakthrough.btnComplete')}
                      </Button>
                    </Stack>
                  ) : (
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <Button size="small" variant="text" startIcon={<FileText size={14} />} onClick={() => setResearchSelector(researchFootprintCandidateSelector({ id: task.hypothesis_id }))}>
                        Research
                      </Button>
                      <Chip size="small" color={task.status === 'validated_exploitable' ? 'info' : 'default'} label={humanize(task.status)} />
                    </Stack>
                  )}
                </Stack>
              )
            })}
          </Stack>
        </Paper>
      )}

      {view === 'queue' && (tasksQ.data?.tasks?.length ?? 0) === 0 && (
        <Alert severity="info">
          {t('footprint.breakthrough.queueEmpty')}
        </Alert>
      )}

      <EvidenceDrawer
        open={!!drawerPath}
        onClose={() => setDrawerPath(null)}
        title={drawerPathModel?.subject_value ?? ''}
        subtitle={drawerPathModel ? `${humanize(drawerPathModel.kind)} · ${humanize(drawerPathModel.state)} · ${drawerPathModel.priority_score}/100` : undefined}
        sections={
          drawerPathModel
            ? [
                {
                  title: t('footprint.breakthrough.pathDrawerOverview'),
                  content: (
                    <Stack spacing={1}>
                      <Typography variant="body2" sx={{ fontWeight: 800 }}>{drawerPathModel.title}</Typography>
                      <Typography variant="body2" color="text.secondary">{drawerPathModel.description}</Typography>
                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                        <Chip size="small" color={scoreTone(drawerPathModel.priority_score)} label={`priority ${drawerPathModel.priority_score}`} />
                        <Chip size="small" color={drawerPathModel.validation_readiness >= 70 ? 'success' : 'warning'} label={`readiness ${drawerPathModel.validation_readiness}`} />
                        <Chip size="small" variant="outlined" label={`${drawerPathModel.missing_evidence} gaps`} />
                      </Stack>
                      {pathDetailQ.isLoading && (
                        <Stack direction="row" spacing={1} alignItems="center">
                          <CircularProgress size={14} />
                          <Typography variant="caption" color="text.secondary">
                            {t('footprint.breakthrough.pathDetailLoading')}
                          </Typography>
                        </Stack>
                      )}
                    </Stack>
                  ),
                },
                {
                  title: t('footprint.breakthrough.pathDrawerWhyNow'),
                  content: (
                    <Stack spacing={0.75}>
                      {drawerPathWhyNow.length > 0
                        ? drawerPathWhyNow.map((item, idx) => <Typography key={`${item}-${idx}`} variant="body2">{item}</Typography>)
                        : <Typography variant="body2" color="text.secondary">{t('footprint.breakthrough.noWhyNow')}</Typography>}
                    </Stack>
                  ),
                },
                {
                  title: t('footprint.breakthrough.pathDrawerRoute'),
                  content: (
                    <Stack spacing={1}>
                      {drawerPathNodes.length > 0
                        ? drawerPathNodes.map(node => (
                            <Paper key={node.id} variant="outlined" sx={{ p: 1 }}>
                              <Typography sx={{ fontSize: 13, fontWeight: 800, overflowWrap: 'anywhere' }}>
                                {node.value || node.label}
                              </Typography>
                              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                                {humanize(node.node_type)} · {node.evidence_id || node.id}
                              </Typography>
                            </Paper>
                          ))
                        : <Typography variant="body2" color="text.secondary">{t('footprint.breakthrough.noNodes')}</Typography>}
                    </Stack>
                  ),
                },
                {
                  title: t('footprint.breakthrough.pathDrawerEdges'),
                  content: (
                    <Stack spacing={1}>
                      {drawerPathEdges.length > 0
                        ? drawerPathEdges.map(edge => (
                            <Paper key={edge.id} variant="outlined" sx={{ p: 1 }}>
                              <Typography sx={{ fontSize: 13, fontWeight: 800 }}>
                                {humanize(edge.relation_kind)} · {edge.confidence}
                              </Typography>
                              <Typography sx={{ fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>
                                {`${edge.from_node_id} -> ${edge.to_node_id}`}
                              </Typography>
                            </Paper>
                          ))
                        : <Typography variant="body2" color="text.secondary">{t('footprint.breakthrough.noEdges')}</Typography>}
                    </Stack>
                  ),
                },
                {
                  title: t('footprint.breakthrough.pathDrawerGaps'),
                  content: (
                    <Stack spacing={1}>
                      {drawerPathGaps.length > 0
                        ? drawerPathGaps.map(gap => (
                            <Paper key={gap.id} variant="outlined" sx={{ p: 1 }}>
                              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography sx={{ fontSize: 13, fontWeight: 800, overflowWrap: 'anywhere' }}>
                                    {gap.title}
                                  </Typography>
                                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                                    {humanize(gap.verifier)} · {gap.evidence_source}
                                  </Typography>
                                </Box>
                                <Chip size="small" color={gapTone(gap.status)} label={humanize(gap.status)} />
                              </Stack>
                              {gap.recommended_action && (
                                <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.75 }}>
                                  {gap.recommended_action}
                                </Typography>
                              )}
                            </Paper>
                          ))
                        : <Typography variant="body2" color="text.secondary">{t('footprint.breakthrough.noGaps')}</Typography>}
                    </Stack>
                  ),
                },
              ]
            : undefined
        }
        footer={
          drawerPathModel ? (
            <Stack spacing={1}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<FileText />}
                onClick={() => setResearchSelector(researchFootprintPathSelector(drawerPathModel))}
              >
                {t('footprint.research.title')}
              </Button>
              {drawerPathGaps.some(g => g.status === 'missing') && (
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={gapTaskMut.isPending ? <CircularProgress size={14} /> : <Send />}
                  disabled={gapTaskMut.isPending}
                  onClick={() => {
                    const gap = drawerPathGaps.find(g => g.status === 'missing')
                    if (gap) gapTaskMut.mutate(gap)
                  }}
                >
                  {t('footprint.breakthrough.btnQueueMissingEvidence')}
                </Button>
              )}
            </Stack>
          ) : undefined
        }
      />

      <EvidenceDrawer
        open={!!drawerCandidate}
        onClose={() => setDrawerCandidate(null)}
        title={drawerModel?.subject_value ?? ''}
        subtitle={drawerModel ? `${humanize(drawerModel.kind)} · ${humanize(drawerModel.state)} · ${drawerModel.priority_score}/100` : undefined}
        sections={
          drawerModel
            ? [
                {
                  title: t('footprint.breakthrough.drawerHypothesis'),
                  content: (
                    <Stack spacing={1}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{drawerModel.title}</Typography>
                      <Typography variant="body2" color="text.secondary">{drawerModel.description}</Typography>
                      {detailQ.isLoading && (
                        <Stack direction="row" spacing={1} alignItems="center">
                          <CircularProgress size={14} />
                          <Typography variant="caption" color="text.secondary">
                            {t('footprint.breakthrough.detailLoading')}
                          </Typography>
                        </Stack>
                      )}
                    </Stack>
                  ),
                },
                {
                  title: t('footprint.breakthrough.drawerWhyNow'),
                  content: (
                    <Stack spacing={0.75}>
                      {(drawerModel.why_now ?? []).length > 0
                        ? drawerModel.why_now?.map((item, idx) => (
                            <Typography key={`${item}-${idx}`} variant="body2">{item}</Typography>
                          ))
                        : <Typography variant="body2" color="text.secondary">{t('footprint.breakthrough.noWhyNow')}</Typography>}
                    </Stack>
                  ),
                },
                {
                  title: t('footprint.breakthrough.drawerDimensions'),
                  content: (
                    <Stack spacing={0.75}>
                      {Object.entries(drawerModel.dimensions ?? {}).map(([key, value]) => (
                        <Stack key={key} direction="row" alignItems="center" spacing={1}>
                          <Typography sx={{ fontSize: 13, minWidth: 150 }}>{humanize(key)}</Typography>
                          <Box sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: 'action.hover', overflow: 'hidden' }}>
                            <Box sx={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', bgcolor: 'primary.main' }} />
                          </Box>
                          <Typography sx={{ fontSize: 13, fontWeight: 700, width: 34, textAlign: 'right' }}>{value}</Typography>
                        </Stack>
                      ))}
                    </Stack>
                  ),
                },
                {
                  title: t('footprint.breakthrough.drawerPlaybook'),
                  content: (
                    <Stack spacing={1}>
                      <Chip size="small" color="info" label={humanize(drawerPlaybook?.verifier || drawerModel.recommended_verifier || 'analyst_review')} sx={{ alignSelf: 'flex-start' }} />
                      {(drawerPlaybook?.steps ?? []).map((step, idx) => (
                        <Typography key={`${idx}-${step}`} variant="body2">{idx + 1}. {step}</Typography>
                      ))}
                      {(drawerPlaybook?.required_evidence ?? []).length > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          {t('footprint.breakthrough.requiredEvidence')}: {(drawerPlaybook?.required_evidence ?? []).join(', ')}
                        </Typography>
                      )}
                      {(drawerPlaybook?.restrictions ?? []).map((restriction, idx) => (
                        <Alert key={`${idx}-${restriction}`} severity="info" variant="outlined">{restriction}</Alert>
                      ))}
                    </Stack>
                  ),
                },
                {
                  title: t('footprint.breakthrough.drawerObservations'),
                  content: (
                    <Stack spacing={1}>
                      {drawerObservations.length > 0
                        ? drawerObservations.map(obs => (
                            <Paper key={obs.id} variant="outlined" sx={{ p: 1 }}>
                              <Typography sx={{ fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>
                                {obs.subject_value} · {humanize(obs.observation_type)}
                              </Typography>
                              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                                {humanize(obs.source_type)} / {obs.source_name || 'unknown'} · confidence {obs.confidence} · reliability {obs.source_reliability}
                              </Typography>
                              {obs.raw_ref && (
                                <Typography sx={{ fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>
                                  {obs.raw_ref}
                                </Typography>
                              )}
                            </Paper>
                          ))
                        : (
                            <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.75}>
                              {drawerModel.evidence_ids.map(id => <Chip key={id} size="small" variant="outlined" label={id} />)}
                            </Stack>
                          )}
                    </Stack>
                  ),
                },
                {
                  title: t('footprint.breakthrough.drawerRelations'),
                  content: (
                    <Stack spacing={1}>
                      {drawerRelations.length > 0
                        ? drawerRelations.map(rel => (
                            <Paper key={rel.id} variant="outlined" sx={{ p: 1 }}>
                              <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                                {humanize(rel.relation_kind)} · {rel.confidence}
                              </Typography>
                              <Typography sx={{ fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>
                                {rel.from_observation_id} → {rel.to_observation_id}
                              </Typography>
                            </Paper>
                          ))
                        : (
                            <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.75}>
                              {drawerModel.relation_ids.map(id => <Chip key={id} size="small" variant="outlined" color="info" label={id} />)}
                            </Stack>
                          )}
                    </Stack>
                  ),
                },
                {
                  title: t('footprint.breakthrough.drawerTasks'),
                  content: (
                    <Stack spacing={1}>
                      {drawerTasks.length > 0
                        ? drawerTasks.map(task => (
                            <Paper key={task.id} variant="outlined" sx={{ p: 1 }}>
                              <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                                {humanize(task.status)} · {humanize(task.verifier || 'analyst_review')}
                              </Typography>
                              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                                {task.result || task.notes || task.id}
                              </Typography>
                            </Paper>
                          ))
                        : <Typography variant="body2" color="text.secondary">{t('footprint.breakthrough.noTasks')}</Typography>}
                    </Stack>
                  ),
                },
              ]
            : undefined
        }
        footer={
          drawerModel ? (
            (() => {
              const tasks = drawerTasks.length > 0 ? drawerTasks : tasksByHypothesis.get(drawerModel.id) ?? []
              const active = activeTask(tasks)
              if (active) {
                return (
                  <Stack spacing={1}>
                    <Button fullWidth variant="outlined" startIcon={<FileText />} onClick={() => setResearchSelector(researchFootprintCandidateSelector(drawerModel))}>
                      {t('footprint.research.title')}
                    </Button>
                    <Button fullWidth variant="contained" color="warning" startIcon={<ClipboardCheck />} onClick={() => openComplete(active, drawerModel)}>
                      {t('footprint.breakthrough.btnCompleteValidation')}
                    </Button>
                  </Stack>
                )
              }
              if (drawerModel.state === 'needs_validation') {
                return (
                  <Stack spacing={1}>
                    <Button fullWidth variant="outlined" startIcon={<FileText />} onClick={() => setResearchSelector(researchFootprintCandidateSelector(drawerModel))}>
                      {t('footprint.research.title')}
                    </Button>
                    <Button fullWidth variant="contained" startIcon={<Send />} disabled={createMut.isPending} onClick={() => createMut.mutate(drawerModel)}>
                      {t('footprint.breakthrough.btnQueueValidation')}
                    </Button>
                  </Stack>
                )
              }
              return (
                <Button fullWidth variant="outlined" startIcon={<FileText />} onClick={() => setResearchSelector(researchFootprintCandidateSelector(drawerModel))}>
                  {t('footprint.research.title')}
                </Button>
              )
            })()
          ) : undefined
        }
      />

      <ResearchFootprintDrawer
        orgId={orgId}
        open={!!researchSelector}
        selector={researchSelector}
        onClose={() => setResearchSelector(null)}
      />

      <Dialog open={!!completion} onClose={() => setCompletion(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('footprint.breakthrough.completeTitle')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              select
              size="small"
              label={t('footprint.breakthrough.completeStatus')}
              value={completeStatus}
              onChange={(e) => setCompleteStatus(e.target.value as typeof completeStatus)}
              fullWidth
            >
              {completionOptions.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>{tOr(opt.labelKey, opt.label)}</MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label={t('footprint.breakthrough.completeEvidence')}
              value={completeResult}
              onChange={(e) => setCompleteResult(e.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label={t('footprint.breakthrough.completeNotes')}
              value={completeNotes}
              onChange={(e) => setCompleteNotes(e.target.value)}
              minRows={3}
              multiline
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompletion(null)} startIcon={<XCircle size={16} />}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            startIcon={completeMut.isPending ? <CircularProgress size={14} /> : <CheckCircle2 size={16} />}
            disabled={completeMut.isPending}
            onClick={() => completeMut.mutate()}
          >
            {t('footprint.breakthrough.saveValidation')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={toast.severity} variant="filled" onClose={() => setToast((t) => ({ ...t, open: false }))}>
          {toast.msg}
        </Alert>
      </Snackbar>

      {deadEnds > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {t('footprint.breakthrough.deadEndCount').replace('{n}', String(deadEnds))}
        </Typography>
      )}
    </Box>
  )
}
