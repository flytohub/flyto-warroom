/**
 * RedTeamView — Red Team War Room (multi-campaign).
 *
 * All data is real:
 *   - Playbooks + fleet = pentest_scans grouped by scan_type
 *   - Target card + log = PentestProject + its scans
 *   - AI Tactics = AIInsight[] from analyzeDomain endpoint
 *
 * Multiple campaigns can run side-by-side — each gets its own tab with
 * live/breach/holding status dot + elapsed clock. Active tab drives the
 * three-panel stage. State persists to localStorage so closing and
 * reopening the tab resumes where you left off.
 *
 * Sub-components (CampaignTabs, LogPane, AIInsightsPane, DomainPicker,
 * PreviewModal) and shared helpers live under ./red_team/.
 */

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import {
  Activity, Eye, FileCode, Flame, Gauge, Loader2,
  Play, ShieldAlert, ShieldCheck, Swords, Target, Trophy, X,
  Crosshair, Bug, Radar,
} from 'lucide-react'
import { CampaignBudgetPanel } from './CampaignBudgetPanel'
import { CampaignFindings } from './CampaignFindings'
import { listCampaignBudgetIncidents } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { runnablePlaybooks, type SeedPlaybook } from '@lib/cloud/playbooks'
import { previewWorkflow, getExecution, type WorkflowDryRunPlan } from '@lib/cloud/workflows'
import { useRunnerStatus } from '@hooks/useRunnerStatus'
import { t } from '@lib/i18n';
import { useOrg } from '@hooks/useOrg'
import { useCampaignPipeline } from '@hooks/useCampaignPipeline'
import { CampaignPipelinePanel } from './CampaignPipelinePanel'
import {
  listPentestProjects, listPentestScans, triggerDiscovery, analyzeDomain,
  getPentestSuggestedTargets, listAttackSurface,
  type PentestProject, type PentestScan, type AIInsight, type SecurityAnalysis,
} from '@lib/engine'
// Footprint-candidate sourcing + promote — SHARED with the Pentest
// workspace so both red-team surfaces target the same host universe
// (fixes the "same subdomain shows in Pentest but not Red Team" silo).
import {
  buildPentestCandidates, ensurePentestProject,
  type PentestCandidate, type CampaignProjectRef,
} from '@compounds/_shared/targetCandidates'
import { BrowserLiveView } from '@compounds/_shared/BrowserLiveView'
import {
  type Campaign, LOG_TAIL, buildLog, buildPipelineLog, colorFor, formatElapsed,
  readSaved, writeSaved,
} from './shared'
import { CampaignTabs } from './CampaignTabs'
import { LogPane } from './LogPane'
import { AIInsightsPane } from './AIInsightsPane'
import { DomainPicker } from './DomainPicker'
import { PreviewModal, type PreviewState } from './PreviewModal'
import { KillChainStepper } from './KillChainStepper'
import { ReconRadar } from './ReconRadar'
import { RedTeamEmptyState } from './RedTeamEmptyState'
import styles from './RedTeamView.module.css'

/* ── Status-bar color map ──────────────────────────────────────────
 * Each status maps to a single --rt-* semantic alias (defined in the
 * css module, softened on light). Bg/border are derived with color-mix
 * so both light + dark read from one expression. */
const STATUS_VAR: Record<string, string> = {
  idle:   'var(--rt-muted)',
  live:   'var(--rt-ok)',
  breach: 'var(--rt-breach)',
  blocked: 'var(--rt-warn)',
  error:  'var(--rt-breach)',
  ready:  'var(--rt-ready)',
}
function statusTint(v: string, pct: number) {
  return `color-mix(in srgb, ${v} ${pct}%, transparent)`
}

export function RedTeamView() {
  const { org } = useOrg()
  const qc = useQueryClient()

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [restoreAttempted, setRestoreAttempted] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [previewState, setPreviewState] = useState<PreviewState>(null)

  // Tick once a second while any campaign is open so elapsed clocks move.
  useEffect(() => {
    if (campaigns.length === 0) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [campaigns.length])

  const { data: projectsData } = useQuery({
    queryKey: qk.pentest.projects(org?.id),
    queryFn: () => listPentestProjects(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })
  const projects = projectsData?.projects ?? []

  // ── Footprint candidates — discovered hosts that are NOT projects yet.
  // Same source as the Pentest workspace bridge, so the same subdomains
  // are attackable here. Picking one promotes it to a project, then
  // launches the campaign — no "go promote it on the Pentest page first".
  const { data: suggestedTargetsData } = useQuery({
    queryKey: qk.pentest.suggestedTargets(org?.id),
    queryFn: () => getPentestSuggestedTargets(org!.id),
    enabled: !!org?.id,
    staleTime: 30_000,
    retry: false,
  })
  const { data: attackSurfaceData } = useQuery({
    queryKey: qk.attackSurface(org?.id),
    queryFn: () => listAttackSurface(org!.id),
    enabled: !!org?.id,
    staleTime: 30_000,
    retry: false,
  })
  const projectHosts = useMemo(
    () => new Set(projects.map(p => p.target_url.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase())),
    [projects],
  )
  // Candidates the operator hasn't promoted yet (drop any already a project).
  const candidates = useMemo(
    () => buildPentestCandidates(suggestedTargetsData?.targets ?? [], attackSurfaceData?.assets ?? [])
      .filter(c => !projectHosts.has(c.value.toLowerCase())),
    [suggestedTargetsData, attackSurfaceData, projectHosts],
  )

  // Fan out scan queries — one per open campaign. Active polls fast,
  // background tabs poll slower to keep their status dot honest.
  const scansQueries = useQueries({
    queries: campaigns.map(c => ({
      queryKey: qk.pentest.scans(c.projectId),
      queryFn: () => listPentestScans(c.projectId),
      enabled: !!c.projectId,
      refetchInterval: (q: { state: { data?: { scans: PentestScan[] } } }) => {
        const d = q.state.data
        const isActive = activeId === c.projectId
        if (!d) return isActive ? 3000 : 6000
        const live = d.scans.some(s => ['running', 'queued', 'pending'].includes(s.status))
        if (!live) return false
        return isActive ? 3000 : 6000
      },
      staleTime: 0,
    })),
  })

  const campaignById = useMemo(() => {
    const m: Record<string, { campaign: Campaign; scans: PentestScan[]; loading: boolean; project?: PentestProject }> = {}
    campaigns.forEach((c, i) => {
      const scans = (scansQueries[i]?.data as { scans: PentestScan[] } | undefined)?.scans ?? []
      m[c.projectId] = {
        campaign: c,
        scans,
        loading: scansQueries[i]?.isLoading ?? false,
        project: projects.find(p => p.id === c.projectId),
      }
    })
    return m
  }, [campaigns, scansQueries, projects])

  const active = activeId ? campaignById[activeId] : undefined
  const activeProject = active?.project
  const activeScans = active?.scans ?? []
  // Latest completed scan drives the per-scan findings drill-down (its
  // findings_count is the rollup; CampaignFindings fetches the detail).
  const latestScanId = (activeScans.find(s => s.status === 'complete') ?? activeScans[0])?.id ?? null

  // AI analysis only for the active campaign — insights don't stream.
  const { data: analysis, isFetching: analysing } = useQuery<SecurityAnalysis>({
    queryKey: qk.pentest.analyze(activeId),
    queryFn: () => analyzeDomain(activeId!),
    enabled: !!activeId,
    staleTime: 30_000,
    retry: false,
  })
  const insights: AIInsight[] = analysis?.insights?.items ?? []

  const launchMut = useMutation({
    mutationFn: (projectId: string) => triggerDiscovery(projectId),
    onSuccess: (_, projectId) => {
      qc.invalidateQueries({ queryKey: qk.pentest.scans(projectId) })
      qc.invalidateQueries({ queryKey: qk.pentest.analyze(projectId) })
    },
  })

  // 5-phase pipeline (Baseline → Probe → Verify → Recheck → Report) is
  // the SOLE campaign driver. Legacy useRedTeamCampaign was killed
  // 2026-04-25 because running both raced the budget.
  const pipeline = useCampaignPipeline({ orgId: org?.id ?? null })
  // Poll the execution-backend status whenever a campaign tab is open (not
  // only while the pipeline reports running) so the war room can tell the
  // operator the truth: "backend offline → nothing will progress" instead of
  // a ticking clock over empty panels.
  const runnerStatus = useRunnerStatus(org?.id ?? null, !!activeId)

  const { data: incidentsResp } = useQuery({
    queryKey: qk.pentest.campaignBudgetIncidents(org?.id),
    queryFn: () => listCampaignBudgetIncidents(org!.id),
    enabled: !!org?.id,
  })
  const openIncidents = incidentsResp?.incidents?.length ?? 0

  // When the active tab changes, hydrate the pipeline hook from
  // localStorage so the phase timeline + report card survive nav.
  useEffect(() => {
    if (!activeId || !org?.id) return
    pipeline.load(activeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, org?.id])

  // Restore on first render once projects load — drop campaigns whose target vanished.
  useEffect(() => {
    if (restoreAttempted || !org?.id) return
    const saved = readSaved(org.id)
    if (projects.length === 0 && saved.campaigns.length > 0) return
    const alive = saved.campaigns.filter(c => projects.some(p => p.id === c.projectId))
    setCampaigns(alive)
    setActiveId(alive.find(c => c.projectId === saved.activeId)?.projectId ?? alive[0]?.projectId ?? null)
    setRestoreAttempted(true)
  }, [restoreAttempted, org?.id, projects])

  useEffect(() => {
    if (!org?.id || !restoreAttempted) return
    writeSaved(org.id, { activeId, campaigns })
  }, [org?.id, restoreAttempted, activeId, campaigns])

  // Accepts either an existing project OR a freshly-promoted candidate
  // (CampaignProjectRef) — both carry the 4 fields the launch needs.
  function openFor(project: CampaignProjectRef) {
    setPickerOpen(false)
    if (campaigns.some(c => c.projectId === project.id)) {
      setActiveId(project.id)
      return
    }
    const next = { projectId: project.id, startedAt: Date.now(), focusType: null }
    setCampaigns(prev => [...prev, next])
    setActiveId(project.id)
    void pipeline.start({
      projectId: project.id,
      targetUrl: project.target_url,
      projectConfig: project.config,
      environment: project.environment,
    }).then(result => {
      if (result.started) {
        launchMut.mutate(project.id)
      }
    })
  }

  function startActiveCampaign() {
    if (!activeProject) return
    void pipeline.start({
      projectId: activeProject.id,
      targetUrl: activeProject.target_url,
      projectConfig: activeProject.config,
      environment: activeProject.environment,
    }).then(result => {
      if (result.started) {
        launchMut.mutate(activeProject.id)
      }
    })
  }

  // Promote a footprint candidate → pentest project → launch campaign,
  // in one click. Reuses the SAME ensurePentestProject the Pentest page
  // uses, so a host promoted from either surface is identical.
  const promoteMut = useMutation({
    mutationFn: (candidate: PentestCandidate) => ensurePentestProject(org!.id, candidate),
    onSuccess: (projectRef) => {
      qc.invalidateQueries({ queryKey: qk.pentest.projects(org?.id) })
      qc.invalidateQueries({ queryKey: qk.pentest.suggestedTargets(org?.id) })
      qc.invalidateQueries({ queryKey: qk.attackSurface(org?.id) })
      openFor(projectRef)
    },
  })

  function openPreview() {
    if (!activeProject) return
    setPreviewState({ phase: 'picking' })
  }

  async function runPreview(playbook: SeedPlaybook) {
    if (!activeProject) return
    setPreviewState({ phase: 'loading', playbook })
    try {
      const resp = await previewWorkflow({
        workflowYaml: playbook.yaml,
        pentest_id: activeProject.id,
        campaign_id: activeProject.id,
        params: { target_url: activeProject.target_url },
      })
      const exec = await getExecution(resp.execution_id)
      // exec.output is Record<string,unknown>|null; the 'status' guard below
      // validates the shape at runtime, so a single cast (not as-unknown-as) is safe.
      const plan = exec.output as (WorkflowDryRunPlan | null)
      if (!plan || !('status' in plan)) {
        setPreviewState({ phase: 'error', playbook, error: 'runner returned no plan' })
        return
      }
      setPreviewState({ phase: 'plan', playbook, plan })
    } catch (e) {
      setPreviewState({
        phase: 'error',
        playbook,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // Candidate playbooks — same filter the campaign orchestrator uses.
  const previewPlaybooks = useMemo(() => {
    if (!activeProject) return []
    return runnablePlaybooks({ target_url: activeProject.target_url })
  }, [activeProject])

  function closeCampaign(projectId: string) {
    setCampaigns(prev => {
      const next = prev.filter(c => c.projectId !== projectId)
      if (activeId === projectId) {
        setActiveId(next[0]?.projectId ?? null)
        if (next.length === 0) pipeline.reset()
      }
      return next
    })
  }

  function setActiveFocus(type: string | null) {
    if (!activeId) return
    setCampaigns(prev => prev.map(c => c.projectId === activeId ? { ...c, focusType: type } : c))
  }

  // Derived — everything below is about the ACTIVE campaign.
  const focusType = active?.campaign.focusType ?? null
  const filtered = useMemo(
    () => (focusType ? activeScans.filter(s => s.scan_type === focusType) : activeScans),
    [activeScans, focusType],
  )

  const playbooks = useMemo(() => {
    const m: Record<string, { type: string; count: number; live: number }> = {}
    for (const s of activeScans) {
      if (!m[s.scan_type]) m[s.scan_type] = { type: s.scan_type, count: 0, live: 0 }
      m[s.scan_type].count++
      if (['running', 'queued', 'pending'].includes(s.status)) m[s.scan_type].live++
    }
    return Object.values(m).sort((a, b) => b.count - a.count)
  }, [activeScans])

  const fleet = useMemo(() => {
    const grouped: Record<string, { type: string; count: number; critical: number; findings: number; lastT: number; running: boolean }> = {}
    for (const s of filtered) {
      if (!grouped[s.scan_type]) grouped[s.scan_type] = { type: s.scan_type, count: 0, critical: 0, findings: 0, lastT: 0, running: false }
      const g = grouped[s.scan_type]
      g.count++
      g.critical += s.critical_count
      g.findings += s.findings_count
      const t = new Date(s.created_at).getTime()
      if (t > g.lastT) g.lastT = t
      if (['running', 'queued', 'pending'].includes(s.status)) g.running = true
    }
    return Object.values(grouped).sort((a, b) => b.lastT - a.lastT)
  }, [filtered])

  const stats = useMemo(() => {
    const s = { complete: 0, running: 0, failed: 0, findings: 0, critical: 0 }
    for (const sc of filtered) {
      if (['complete', 'completed', 'done'].includes(sc.status)) s.complete++
      else if (['running', 'queued', 'pending'].includes(sc.status)) s.running++
      else if (['failed', 'error'].includes(sc.status)) s.failed++
      s.findings += sc.findings_count
      s.critical += sc.critical_count
    }
    return s
  }, [filtered])

  const log = useMemo(() => {
    const scanLog = buildLog(filtered)
    const pipelineLog = buildPipelineLog({
      status: pipeline.status,
      phases: pipeline.phases,
      preflight: pipeline.preflight,
      error: pipeline.error,
      evidenceCount: pipeline.allEvidence.length,
      tokenCount: pipeline.totalTokens.input + pipeline.totalTokens.output,
    })
    return [...scanLog, ...pipelineLog].sort((a, b) => a.t - b.t).slice(-LOG_TAIL)
  }, [filtered, pipeline.status, pipeline.phases, pipeline.preflight, pipeline.error, pipeline.allEvidence.length, pipeline.totalTokens.input, pipeline.totalTokens.output])

  // Latest dispatched runner execution (for live-view WS).
  const currentExecutionId = useMemo(() => {
    for (let i = pipeline.allEvidence.length - 1; i >= 0; i--) {
      const eid = pipeline.allEvidence[i].executionId
      if (eid) return eid
    }
    return null
  }, [pipeline.allEvidence])
  const round = filtered.length
  const breached = stats.critical > 0
  const empty = !activeProject
  const pipelineBlocked = !empty && pipeline.status === 'blocked'
  const pipelineFailed = !empty && (pipeline.status === 'error' || pipeline.status === 'orphaned')
  const runningCount = pipeline.isRunning ? Math.max(stats.running, 1) : stats.running
  const executionActive = !empty && !pipelineBlocked && !pipelineFailed && runningCount > 0
  // The center "stage" is lit when something is actually happening — a real
  // breach or an in-flight scan. Drives the outer accent wash (spec: outer
  // wash only when center lit) and the panel's left-border accent hue.
  const centerLit = !empty && !pipelineBlocked && !pipelineFailed && (breached || executionActive)
  const centerAccent = pipelineFailed
    ? 'var(--rt-breach)'
    : pipelineBlocked ? 'var(--rt-warn)' : breached ? 'var(--rt-breach)' : executionActive ? 'var(--rt-ok)' : 'var(--rt-ready)'

  const elapsedMs = executionActive && active ? now - active.campaign.startedAt : 0
  const elapsed = executionActive ? formatElapsed(elapsedMs) : '--:--'

  const statusMode = empty ? 'idle' : pipelineFailed ? 'error' : pipelineBlocked ? 'blocked' : breached ? 'breach' : executionActive ? 'live' : 'ready'
  const statusLabel = (
    empty     ? t('warroom.redTeamAwait')
    : pipelineFailed ? t('warroom.redTeamError')
    : pipelineBlocked ? t('warroom.redTeamBlocked')
    : breached ? t('warroom.redTeamBreach')
    : executionActive ? t('warroom.redTeamLive')
    : t('warroom.redTeamReady')
  )
  const statusColor = STATUS_VAR[statusMode] || STATUS_VAR.idle

  // Command-echo header host — purely cosmetic, but data-true.
  const targetHost = (() => {
    if (!activeProject) return null
    try { return new URL(activeProject.target_url).host }
    catch { return activeProject.target_url }
  })()

  return (
    <Box className={styles.root} sx={{ height: '100%', overflow: { xs: 'auto', md: 'hidden' }, display: 'flex', flexDirection: 'column' }}>
      {/* No big page header — the war-room section tab already labels this
          page "Red Team". Reclaiming that vertical space for the columns so
          the full-bleed view fits without clipping. */}
      <Box sx={{ pt: 1.5 }} />

      <CampaignTabs
        campaigns={campaigns}
        activeId={activeId}
        campaignById={campaignById}
        now={now}
        activeExecution={executionActive}
        onSwitch={setActiveId}
        onClose={closeCampaign}
        onNew={() => setPickerOpen(true)}
      />

      {/* Kill-chain stepper — lit-up attack path mirroring the real pipeline */}
      <KillChainStepper
        empty={empty}
        loading={!!active?.loading}
        currentPhase={pipeline.currentPhase}
        phases={pipeline.phases}
        hasReport={!!pipeline.report}
        evidenceCount={pipeline.allEvidence.length}
        activeScanCount={activeScans.length}
        running={runningCount}
        complete={stats.complete}
        critical={stats.critical}
      />

      {/* Status bar — 2 rows: top = status + stats, bottom = actions */}
      <Box sx={{ mx: { xs: 2, sm: 3 }, mb: 1.5 }}>
        {/* Single command row: status + stats + actions, all inline */}
        <Paper
          variant="outlined"
          className={styles.scanlines}
          sx={{
            px: 2.5, py: 1.5,
            display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
            bgcolor: statusTint(statusColor, 6), borderColor: 'var(--rt-hair)',
            borderRadius: 'var(--flyto-radius-lg)',
            position: 'relative', overflow: 'hidden',
          }}
        >
          {/* Live indicator: breach keeps the glow dot; live/ready/idle get
              a terminal block-cursor next to the label. */}
          {statusMode === 'breach' ? (
            <Box
              className={styles.pulse}
              sx={{
                width: 10, height: 10, borderRadius: '50%', bgcolor: statusColor, flexShrink: 0,
                boxShadow: 'var(--rt-glow-breach)',
              }}
            />
          ) : (
            <Box
              component="span"
              className={statusMode === 'live' ? styles.cursor : undefined}
              sx={{
                width: '0.55em', height: '1.05em', flexShrink: 0,
                bgcolor: statusColor,
                opacity: statusMode === 'live' ? 1 : 0.5,
              }}
            />
          )}
          <Typography variant="body2" className={statusMode !== 'idle' ? styles.statGlow : undefined} sx={{ fontWeight: 700, color: statusColor, letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'var(--flyto-font-mono)' }}>
            {statusLabel}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('warroom.redTeamRound')} <b>{round}</b>
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
            <Activity size={14} />
            <Typography variant="body2">{empty ? '--:--' : elapsed}</Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'var(--rt-breach)' }}>
              <Flame size={14} /> <Typography variant="body2" fontWeight={600} className={stats.critical > 0 ? styles.statGlow : undefined}>{stats.critical}</Typography>
            </Box>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'var(--rt-warn)' }}>
              <ShieldAlert size={14} /> <Typography variant="body2" fontWeight={600} className={stats.findings > 0 ? styles.statGlow : undefined}>{stats.findings}</Typography>
            </Box>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'var(--rt-ok)' }}>
              <ShieldCheck size={14} /> <Typography variant="body2" fontWeight={600} className={stats.complete > 0 ? styles.statGlow : undefined}>{stats.complete}</Typography>
            </Box>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'var(--rt-ready)' }}>
              <Activity size={14} /> <Typography variant="body2" fontWeight={600} className={runningCount > 0 ? styles.statGlow : undefined}>{runningCount}</Typography>
            </Box>
            {runnerStatus.data?.reachable ? (
              <Box
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'var(--rt-recon)' }}
                title={t('warroom.redTeamRunnerTip')}
              >
                <Loader2 size={14} className={pipeline.isRunning ? 'animate-spin' : ''} />{' '}
                <Typography variant="body2">
                  {runnerStatus.data.in_flight}/{runnerStatus.data.max_concurrent}
                  {' · '}
                  {runnerStatus.data.tokens.toFixed(0)}t
                </Typography>
              </Box>
            ) : runnerStatus.data && !runnerStatus.data.reachable ? (
              // HONEST backend state: the execution backend (local runner /
              // cloud orchestrator) is unreachable → the 5-phase pipeline
              // cannot progress. Say so instead of letting the elapsed clock
              // imply work is happening.
              <Box
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'var(--rt-warn)' }}
                title={t('warroom.redTeamBackendOfflineTip')}
              >
                <Loader2 size={14} />{' '}
                <Typography variant="body2" fontWeight={600}>
                  {t('warroom.redTeamBackendOffline')}
                </Typography>
              </Box>
            ) : null}
          </Box>
          {/* Actions — inline so the command bar stays ONE row */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => setBudgetOpen(true)}
            sx={{
              px: 1.5, py: 0.5, fontSize: 12, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: 0.5,
              fontFamily: 'var(--flyto-font-mono)',
              bgcolor: openIncidents > 0 ? 'color-mix(in srgb, var(--rt-breach) 12%, transparent)' : 'action.hover',
              color: 'text.primary',
              borderColor: openIncidents > 0 ? 'var(--rt-breach)' : 'divider',
              '&:hover': { bgcolor: openIncidents > 0 ? 'color-mix(in srgb, var(--rt-breach) 18%, transparent)' : 'action.selected' },
            }}
            title={t('warroom.redTeamBudgetTip')}
          >
            <Gauge size={13} style={{ marginRight: 6 }} />
            {t('warroom.redTeamBudget')}
            {openIncidents > 0 && <span style={{ marginLeft: 4 }}>{openIncidents}</span>}
          </Button>
          {empty ? (
            <Button
              size="small"
              variant="contained"
              onClick={() => setPickerOpen(true)}
              disabled={launchMut.isPending}
              sx={{
                px: 2, py: 0.5, fontSize: 12, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: 0.5,
                fontFamily: 'var(--flyto-font-mono)',
                // Always white on the purple brand gradient (it's dark in
                // BOTH modes). --flyto-text-inverse is dark navy → black-on-
                // purple, unreadable (esp. dark mode).
                color: '#fff',
                background: 'linear-gradient(135deg, var(--rt-ready), var(--color-brand-dark))', boxShadow: 'var(--rt-glow-ready)',
                '&:hover': { background: 'linear-gradient(135deg, var(--color-brand-dark), var(--rt-ready))', boxShadow: 'var(--rt-glow-ready)' },
              }}
            >
              <Play size={13} fill="currentColor" style={{ marginRight: 6 }} />
              {t('warroom.redTeamStart')}
            </Button>
          ) : (
            <>
              {!executionActive && (
                <Button
                  size="small"
                  variant="contained"
                  onClick={startActiveCampaign}
                  disabled={launchMut.isPending || pipeline.isRunning}
                  sx={{
                    px: 2, py: 0.5, fontSize: 12, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: 0.5,
                    fontFamily: 'var(--flyto-font-mono)',
                    color: '#fff',
                    background: 'linear-gradient(135deg, var(--rt-ready), var(--color-brand-dark))',
                    boxShadow: 'var(--rt-glow-ready)',
                    '&:hover': { background: 'linear-gradient(135deg, var(--color-brand-dark), var(--rt-ready))', boxShadow: 'var(--rt-glow-ready)' },
                  }}
                >
                  <Play size={13} fill="currentColor" style={{ marginRight: 6 }} />
                  {t('warroom.redTeamStart')}
                </Button>
              )}
              <Button
                size="small"
                variant="outlined"
                onClick={openPreview}
                disabled={!activeProject}
                sx={{
                  px: 1.5, py: 0.5, fontSize: 12, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: 0.5,
                  fontFamily: 'var(--flyto-font-mono)',
                  bgcolor: 'action.hover', color: 'text.primary', borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.selected' },
                }}
                title={t('warroom.redTeamPreviewTip')}
              >
                <Eye size={13} style={{ marginRight: 6 }} />
                {t('warroom.redTeamPreview')}
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => closeCampaign(activeId!)}
                disabled={launchMut.isPending}
                sx={{
                  px: 1.5, py: 0.5, fontSize: 12, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: 0.5,
                  fontFamily: 'var(--flyto-font-mono)',
                  color: 'var(--rt-breach)', borderColor: 'color-mix(in srgb, var(--rt-breach) 30%, transparent)',
                  '&:hover': { bgcolor: 'color-mix(in srgb, var(--rt-breach) 10%, transparent)', borderColor: 'var(--rt-breach)' },
                }}
              >
                <X size={13} style={{ marginRight: 6 }} />
                {t('warroom.redTeamEnd')}
              </Button>
            </>
          )}
          </Box>
        </Paper>
      </Box>

      {/* Honest execution-backend banner. A selected target is not the same as
          execution. When a campaign is blocked, degraded, or stalled, explain
          the condition instead of implying work is happening. */}
      {(() => {
        // Two honest "nothing is actually happening" signals:
        //  1. backendDown — runner-status reports the backend unreachable.
        //  2. stalled — the pipeline says it's running but after 25s the
        //     backend has reported ZERO progress (no phase advanced, no
        //     evidence, no tokens). This catches the dev case where the
        //     backend is reachable but can't call back to this engine, so a
        //     campaign dispatches and then silently goes nowhere.
        const backendDown = !!runnerStatus.data && !runnerStatus.data.reachable
        const blocked = pipelineBlocked
        const failed = pipelineFailed
        const degraded = !blocked && !failed && (pipeline.preflight?.warnings?.length ?? 0) > 0
        const stalled =
          pipeline.isRunning &&
          pipeline.allEvidence.length === 0 &&
          (pipeline.totalTokens.input + pipeline.totalTokens.output) === 0 &&
          !pipeline.report &&
          elapsedMs > 25_000
        if (empty || (!blocked && !failed && !degraded && !backendDown && !stalled)) return null
        const message = blocked
          ? (pipeline.preflight?.message || pipeline.error || 'Campaign preflight blocked before execution. No probes were dispatched.')
          : failed
            ? (pipeline.error || (pipeline.status === 'orphaned'
              ? t('hardcoded.engine.restarted.while.this.campaign.was.running.start.22595902')
              : 'Campaign failed before completion. Open the pipeline timeline for the persisted phase error.'))
            : degraded
              ? (pipeline.preflight?.message || 'AI strategy is unavailable. Evidence probes are still running with an evidence-only fallback.')
            : backendDown
              ? t('warroom.redTeamBackendBanner')
              : t('warroom.redTeamStalledBanner')
        return (
          <Box sx={{ mx: { xs: 2, sm: 3 }, mb: 1.5 }}>
            <Paper
              variant="outlined"
              sx={{
                px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1,
                borderRadius: 'var(--flyto-radius-lg)',
                bgcolor: 'color-mix(in srgb, var(--rt-warn) 9%, transparent)',
                borderColor: 'color-mix(in srgb, var(--rt-warn) 35%, transparent)',
              }}
            >
              <ShieldAlert size={15} color="var(--rt-warn)" style={{ flexShrink: 0 }} />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {message}
              </Typography>
            </Paper>
          </Box>
        )
      })()}

      {/* ── Unified C2 console — ONE bordered surface, hairline-divided
            columns (no floating cards, no inter-column gaps). The grid bg +
            scanlines + glass live on the console itself so the whole thing
            reads as a single ops terminal. ── */}
      <Box sx={{ px: { xs: 2, sm: 2.5 }, pb: { xs: 2, sm: 2.5 }, minHeight: 0, flex: { xs: '0 0 auto', md: 1 }, display: 'flex' }}>
        <Paper
          variant="outlined"
          className={`${styles.grid} ${styles.scanlines} ${styles.glassPanel}`}
          sx={{
            flex: 1, minHeight: { xs: 'auto', md: 0 }, display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(230px, 0.85fr) 1.6fr minmax(290px, 1fr)' },
            borderRadius: 'var(--flyto-radius-lg)', borderColor: 'var(--rt-hair)',
            overflow: { xs: 'visible', md: 'hidden' }, position: 'relative',
          }}
        >
        {/* ════ Col 1 — ARSENAL ════ */}
        <Box
          sx={{
            display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, position: 'relative',
            ['--rt-accent' as string]: 'var(--rt-ready)',
          }}
        >
          <Box className={`${styles.aboveDecoration} ${styles.panelHeader}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'var(--rt-hair)' }}>
            <FileCode size={16} color="var(--rt-ready)" />
            <Typography variant="body2" sx={{ fontWeight: 700, letterSpacing: 0.5, color: 'text.secondary', textTransform: 'uppercase', fontFamily: 'var(--flyto-font-mono)' }}>
              {t('warroom.redTeamPlaybooks')}
            </Typography>
            <Chip label={playbooks.length} size="small" sx={{ height: 22, fontSize: 12, bgcolor: 'action.hover', color: 'text.secondary' }} />
          </Box>
          <Box className={styles.aboveDecoration} sx={{ flex: 1, overflow: 'auto', p: 1 }}>
            {playbooks.length === 0 && (
              empty ? (
                <RedTeamEmptyState
                  icon={FileCode}
                  accent="var(--rt-ready)"
                  title={t('warroom.rt.playbooksEmptyTitle')}
                  body={t('warroom.rt.playbooksEmptyBody')}
                  cta={{ label: t('warroom.redTeamPickTarget'), onClick: () => setPickerOpen(true) }}
                />
              ) : active?.loading ? (
                <RedTeamEmptyState
                  icon={Loader2}
                  accent="var(--rt-recon)"
                  title={t('warroom.rt.playbooksWarmTitle')}
                  body={t('warroom.redTeamDispatching')}
                />
              ) : (
                <RedTeamEmptyState
                  icon={FileCode}
                  accent="var(--rt-recon)"
                  title={t('warroom.rt.playbooksNoneTitle')}
                  body={t('warroom.rt.playbooksNoneBody')}
                />
              )
            )}
            {playbooks.map(p => {
              const isActive = focusType === p.type
              const color = colorFor(p.type)
              return (
                <Box
                  key={p.type}
                  component="button"
                  onClick={() => setActiveFocus(isActive ? null : p.type)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5, width: '100%',
                    px: 1.5, py: 1, border: 'none', cursor: 'pointer',
                    borderRadius: '8px', textAlign: 'left',
                    bgcolor: isActive ? 'action.selected' : 'transparent',
                    '&:hover': { bgcolor: 'action.hover' },
                    transition: 'background 0.15s',
                  }}
                >
                  <Box sx={{ width: 4, height: 20, borderRadius: 1, bgcolor: color, flexShrink: 0 }} />
                  <Typography variant="body2" sx={{ flex: 1, color: 'text.primary', fontFamily: 'var(--flyto-font-mono)' }}>
                    {p.type}
                  </Typography>
                  {p.live > 0 ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box className={styles.pulse} sx={{
                        width: 7, height: 7, borderRadius: '50%', bgcolor: 'var(--rt-ok)',
                      }} />
                      <Typography variant="body2" sx={{ color: 'var(--rt-ok)' }}>{p.live}</Typography>
                    </Box>
                  ) : (
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{p.count}x</Typography>
                  )}
                </Box>
              )
            })}
          </Box>
          {focusType && (
            <Box
              component="button"
              onClick={() => setActiveFocus(null)}
              sx={{
                border: 'none', cursor: 'pointer', p: 1.5,
                bgcolor: 'transparent', color: 'text.secondary', fontSize: 13,
                borderTop: '1px solid', borderColor: 'var(--rt-hair)',
                '&:hover': { color: 'text.primary' },
              }}
            >
              {t('warroom.redTeamClearFilter')}
            </Box>
          )}
        </Box>

        {/* ════ Col 2 — TARGET / LIVE STAGE (hero) ════ */}
        <Box
          className={styles.crt}
          sx={{
            borderLeft: { xs: 0, md: '1px solid' },
            borderTop: { xs: '1px solid', md: 0 },
            borderColor: 'var(--rt-hair)',
            display: 'flex', flexDirection: 'column', overflow: 'auto', minHeight: 0, position: 'relative',
            ['--rt-accent' as string]: centerAccent,
          }}
        >
          <Box className={`${styles.aboveDecoration} ${styles.panelHeader}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'var(--rt-hair)' }}>
            <Target size={16} color={centerLit ? centerAccent : 'var(--rt-muted)'} />
            <Typography variant="body2" sx={{ fontWeight: 700, letterSpacing: 0.5, color: 'text.secondary', textTransform: 'uppercase', fontFamily: 'var(--flyto-font-mono)' }}>
              {t('warroom.redTeamTarget')}
            </Typography>
          </Box>

          {/* Target card */}
          <Paper
            elevation={0}
            className={styles.aboveDecoration}
            sx={{
              m: 2, p: 2.5, borderRadius: 'var(--flyto-radius-lg)', position: 'relative',
              bgcolor: breached ? 'color-mix(in srgb, var(--rt-breach) 6%, transparent)' : empty ? 'background.paper' : 'color-mix(in srgb, var(--rt-ready) 4%, transparent)',
              border: '1px solid',
              borderColor: breached ? 'color-mix(in srgb, var(--rt-breach) 30%, transparent)' : 'divider',
            }}
          >
            {/* Recon radar — overlaid top-right, real fleet blips */}
            {!empty && (
              <Box sx={{ position: 'absolute', top: 8, right: breached ? 92 : 8, pointerEvents: 'none' }}>
                <ReconRadar
                  blips={fleet.map(f => ({ type: f.type, critical: f.critical }))}
                  scanning={executionActive}
                />
              </Box>
            )}
            {/* Ring indicator */}
            <Box sx={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: 5,
              borderRadius: 'var(--flyto-radius-lg) 0 0 var(--flyto-radius-lg)',
              background: breached
                ? 'linear-gradient(180deg, var(--rt-breach), var(--flyto-error-dark))'
                : empty ? 'var(--flyto-border)'
                : pipelineFailed ? 'var(--rt-breach)'
                : pipelineBlocked ? 'var(--rt-warn)'
                : executionActive ? 'var(--rt-ok)' : 'var(--rt-ready)',
            }} />
            {empty ? (
              <RedTeamEmptyState
                icon={Crosshair}
                accent="var(--rt-recon)"
                title={t('warroom.redTeamIdleUrl')}
                body={t('warroom.redTeamIdleMeta')}
                cta={{ label: t('warroom.redTeamPickTarget'), onClick: () => setPickerOpen(true) }}
              />
            ) : (
              <Box sx={{ pl: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, minWidth: 0 }}>
                  <Crosshair size={15} color={pipelineFailed ? 'var(--rt-breach)' : pipelineBlocked ? 'var(--rt-warn)' : breached ? 'var(--rt-breach)' : executionActive ? 'var(--rt-ok)' : 'var(--rt-ready)'} style={{ flexShrink: 0 }} />
                  <Typography
                    variant="body1"
                    sx={{ fontWeight: 600, color: 'text.primary', fontFamily: 'var(--flyto-font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={activeProject!.target_url}
                  >
                    {activeProject!.target_url}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Box className={executionActive ? styles.pulse : undefined} sx={{
                    width: 6, height: 6, borderRadius: '50%',
                    bgcolor: pipelineFailed ? 'var(--rt-breach)' : pipelineBlocked ? 'var(--rt-warn)' : breached ? 'var(--rt-breach)' : executionActive ? 'var(--rt-ok)' : 'var(--rt-ready)',
                  }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {pipelineFailed ? t('warroom.redTeamStatusError')
                      : pipelineBlocked ? t('warroom.redTeamStatusBlocked')
                      : breached ? t('warroom.redTeamStatusBreach')
                      : executionActive ? t('warroom.redTeamStatusFire')
                      : t('warroom.redTeamStatusReady')}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>·</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>{activeProject!.environment}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>·</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>round {round}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>·</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>{elapsed}</Typography>
                </Box>
              </Box>
            )}
            {breached && (
              <Chip
                icon={<Trophy size={13} />}
                label="BREACH"
                size="small"
                sx={{
                  position: 'absolute', top: 8, right: 8,
                  bgcolor: 'color-mix(in srgb, var(--rt-breach) 12%, transparent)', color: 'var(--rt-breach)', fontWeight: 700,
                  fontSize: 12, height: 22, boxShadow: 'var(--rt-glow-breach)',
                  '& .MuiChip-icon': { color: 'var(--rt-breach)' },
                }}
              />
            )}
          </Paper>

          {/* Per-scan findings drill-down — option C: findings stay in the
              Red Team domain (pentest_findings), surfaced here rather than
              cross-written into the unified Findings panel. */}
          {!empty && activeProject && (
            <CampaignFindings
              projectId={activeProject.id}
              scanId={latestScanId}
              ingestedEvidence={pipeline.verifyEvidence}
            />
          )}

          {/* Chrome live view */}
          {currentExecutionId && pipeline.isRunning && !empty && import.meta.env.VITE_AUTOMATION_URL && (
            <Paper
              variant="outlined"
              className={styles.aboveDecoration}
              sx={{ mx: 2, mb: 2, borderRadius: 'var(--flyto-radius-lg)', overflow: 'hidden', borderColor: 'divider' }}
            >
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
                bgcolor: 'color-mix(in srgb, var(--rt-ok) 6%, transparent)', borderBottom: '1px solid', borderColor: 'var(--rt-hair)',
              }}>
                <Box className={styles.pulse} sx={{
                  width: 6, height: 6, borderRadius: '50%', bgcolor: 'var(--rt-ok)',
                }} />
                <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'var(--flyto-font-mono)', fontSize: 12 }}>
                  LIVE · execution {currentExecutionId.slice(0, 8)} · phase {pipeline.currentPhase ?? '—'}
                </Typography>
              </Box>
              <BrowserLiveView
                executionId={currentExecutionId}
                liveViewUrl={`wss://${new URL(import.meta.env.VITE_AUTOMATION_URL).host}/ws/browser/${currentExecutionId}`}
              />
            </Paper>
          )}

          {/* Fleet */}
          <Box className={styles.aboveDecoration} sx={{ mx: 2, mb: 2, ...(fleet.length === 0 && pipeline.allEvidence.length > 0 ? { maxHeight: 0, overflow: 'hidden' } : {}) }}>
            {fleet.length === 0 ? (
              pipeline.allEvidence.length > 0 ? null : empty ? (
                <RedTeamEmptyState
                  icon={Swords}
                  accent="var(--rt-recon)"
                  title={t('warroom.rt.fleetIdleTitle')}
                  body={t('warroom.redTeamFleetIdle')}
                  cta={{ label: t('warroom.redTeamPickTarget'), onClick: () => setPickerOpen(true) }}
                />
              ) : active?.loading ? (
                <RedTeamEmptyState
                  icon={Radar}
                  accent="var(--rt-ok)"
                  title={t('warroom.rt.fleetWarmTitle')}
                  body={t('warroom.redTeamFleetWarm')}
                />
              ) : (
                <RedTeamEmptyState
                  icon={Swords}
                  accent="var(--rt-recon)"
                  title={t('warroom.rt.fleetEmptyTitle')}
                  body={t('warroom.redTeamFleetEmpty')}
                />
              )
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 1.5 }}>
                {fleet.slice(0, 12).map(f => {
                  const color = colorFor(f.type)
                  const won = f.critical > 0
                  const blocked = f.findings === 0 && f.count > 0 && !f.running
                  return (
                    <Paper
                      key={f.type}
                      variant="outlined"
                      sx={{
                        p: 1.5, borderRadius: 'var(--flyto-radius-lg)', textAlign: 'center',
                        bgcolor: won ? 'color-mix(in srgb, var(--rt-breach) 6%, transparent)' : blocked ? 'color-mix(in srgb, var(--rt-muted) 8%, transparent)' : 'transparent',
                        borderColor: won ? 'color-mix(in srgb, var(--rt-breach) 30%, transparent)' : f.running ? `color-mix(in srgb, ${color} 35%, transparent)` : 'divider',
                        transition: 'all 0.2s',
                      }}
                      title={`${f.type} · ${f.count} scans · ${f.findings} findings · ${f.critical} critical`}
                    >
                      <Box sx={{ color: won ? 'var(--rt-breach)' : blocked ? 'text.secondary' : color, mb: 1 }}>
                        {won ? <ShieldAlert size={20} /> : blocked ? <ShieldCheck size={20} /> : f.running ? <Loader2 size={20} className="animate-spin" /> : <Swords size={20} />}
                      </Box>
                      <Typography variant="body2" sx={{ display: 'block', color: 'text.secondary', fontFamily: 'var(--flyto-font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', mb: 0.5 }}>
                        {f.type}
                      </Typography>
                      <Typography
                        variant="body2"
                        className={f.critical > 0 || f.findings > 0 ? styles.statGlow : undefined}
                        sx={{ fontWeight: 600, color: f.critical > 0 ? 'var(--rt-breach)' : f.findings > 0 ? 'var(--rt-warn)' : 'text.secondary' }}
                      >
                        {f.critical > 0 ? `${f.critical}c` : f.findings > 0 ? `${f.findings}` : `${f.count}x`}
                      </Typography>
                    </Paper>
                  )
                })}
              </Box>
            )}
          </Box>

          {/* Stat footer */}
          <Box className={styles.aboveDecoration} sx={{
            display: 'flex', alignItems: 'center', gap: 3, px: 2, py: 1.5,
            borderTop: '1px solid', borderColor: 'var(--rt-hair)', flexWrap: 'wrap',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Flame size={14} color="var(--rt-breach)" />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('warroom.redTeamCritical')}{' '}
                <Box component="b" className={stats.critical > 0 ? styles.statGlow : undefined} sx={{ color: 'var(--rt-breach)' }}>{stats.critical}</Box>
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Bug size={14} color="var(--rt-warn)" />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('warroom.redTeamFindings')}{' '}
                <Box component="b" className={stats.findings > 0 ? styles.statGlow : undefined} sx={{ color: 'var(--rt-warn)' }}>{stats.findings}</Box>
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <ShieldCheck size={14} color="var(--rt-ok)" />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('warroom.redTeamComplete')}{' '}
                <Box component="b" className={stats.complete > 0 ? styles.statGlow : undefined} sx={{ color: 'var(--rt-ok)' }}>{stats.complete}</Box>
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Activity size={14} color="var(--rt-ready)" />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('warroom.redTeamRunning')}{' '}
                <Box component="b" className={runningCount > 0 ? styles.statGlow : undefined} sx={{ color: 'var(--rt-ready)' }}>{runningCount}</Box>
              </Typography>
            </Box>
          </Box>

          {!empty && (
            <Box className={styles.aboveDecoration}>
              <CampaignPipelinePanel
                status={pipeline.status}
                phases={pipeline.phases}
                currentPhase={pipeline.currentPhase}
                report={pipeline.report}
                totalTokens={pipeline.totalTokens}
                runId={pipeline.runId}
                campaignId={active?.campaign.projectId ?? null}
                onRetest={pipeline.retest}
              />
            </Box>
          )}
        </Box>

        {/* ════ Col 3 — ATTACK LOG + AI (right rail) ════ */}
        <Box sx={{
          borderLeft: { xs: 0, md: '1px solid' },
          borderTop: { xs: '1px solid', md: 0 },
          borderColor: 'var(--rt-hair)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'auto',
        }}>
          <LogPane log={log} empty={empty} loading={!!active?.loading && !empty} cmdHost={targetHost} round={round} />
          <Box sx={{ borderTop: '1px solid', borderColor: 'var(--rt-hair)' }}>
            <AIInsightsPane insights={insights} loading={analysing} empty={empty} onPickTarget={() => setPickerOpen(true)} />
          </Box>
        </Box>
        </Paper>
      </Box>

      <DomainPicker
        opened={pickerOpen}
        projects={projects}
        candidates={candidates}
        openIds={new Set(campaigns.map(c => c.projectId))}
        onPick={openFor}
        onPickCandidate={(c) => promoteMut.mutate(c)}
        promotingKey={promoteMut.isPending ? (promoteMut.variables?.key ?? null) : null}
        onClose={() => setPickerOpen(false)}
      />

      <PreviewModal
        state={previewState}
        playbooks={previewPlaybooks}
        onPick={runPreview}
        onBack={() => setPreviewState({ phase: 'picking' })}
        onClose={() => setPreviewState(null)}
      />

      <Dialog
        open={budgetOpen}
        onClose={() => setBudgetOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Gauge size={14} /> {t('warroom.redTeamBudgetTitle')}
          </Box>
        </DialogTitle>
        <DialogContent>
          <CampaignBudgetPanel />
        </DialogContent>
      </Dialog>
    </Box>
  )
}
