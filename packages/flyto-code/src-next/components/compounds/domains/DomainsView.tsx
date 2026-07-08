import { useState, useMemo, useRef, useCallback, useEffect, type SyntheticEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Alert from '@mui/material/Alert'
import MenuItem from '@mui/material/MenuItem'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import Tooltip from '@mui/material/Tooltip'
import CircularProgress from '@mui/material/CircularProgress'
import { alpha } from '@mui/material/styles'
import { Globe, Plus, ShieldCheck, ArrowRight, Radar, Upload, Eye, Search as SearchIcon } from 'lucide-react'
import { colors } from '@/styles/designTokens'
import { t, tOr } from '@lib/i18n';
import { formatEngineError } from '@lib/engine/errors'
import { useOrg } from '@hooks/useOrg'
import {
  markDiscoveryComplete,
  markDiscoveryStarted,
  useCancelDiscovery,
  useDiscoverySeed,
  useDiscoveryStatus,
} from '@hooks/useDiscoveryStatus'
import { Pagination } from '@atoms/Pagination'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { QueryError } from '@atoms/QueryError'
import { EmptyStateGuide } from '@atoms/EmptyStateGuide'
import { GatedButton } from '@atoms/GatedButton'
import { SearchField } from '@atoms/SearchField'
import {
  listPentestProjects,
  deleteDomain,
  discoverAllDomains,
  getEnrichedAttackSurface,
} from '@lib/engine'
// Direct-path import (decoupling rule): per-asset lifecycle clients live
// in the footprint domain folder, NOT the @lib/engine barrel.
import {
  createExternalTarget,
  createDomainVerification,
  scanAttackSurfaceAsset,
  verifyDomainVerification,
  type TargetRelationship,
  type DomainVerification,
} from '@lib/engine/code/footprintSurface'
import { PROJECT_TYPES, LIST_PAGE_SIZE, CHECKS_PAGE_SIZE, SCOPE_LABELS, type DomainIssue, type DomainRow } from './types'
import { buildDomainRows, flattenAttackSurfaceAssets } from './buildDomainRows'
import { extractHostFromAssetValue, getExternalPostureKernel } from '@compounds/_shared/externalPosture'
import { qk } from '@lib/queryKeys'
import { GroupedDomainList, groupRows } from './GroupedDomainList'
import { DomainDetail } from './DomainDetail'
import { DomainImportModal } from './DomainImportModal'

type DomainScopeFilter = 'owned' | 'vendor' | 'candidate' | 'all'
const DOMAIN_TOOLBAR_H = 36
const domainToolbarControlSx = {
  height: DOMAIN_TOOLBAR_H,
  minHeight: DOMAIN_TOOLBAR_H,
  maxHeight: DOMAIN_TOOLBAR_H,
  boxSizing: 'border-box',
  textTransform: 'none',
  fontWeight: 600,
  borderRadius: 1.5,
  fontSize: 13,
}

function readScopeFilter(raw: string | null): DomainScopeFilter {
  return raw === 'vendor' || raw === 'candidate' || raw === 'all' ? raw : 'owned'
}

function rowScopeBucket(row: DomainRow): string {
  if (row.scopeBucket) return row.scopeBucket
  if (row.verifierStatus === 'inconclusive') return 'candidate'
  return 'core_owned'
}

function rowMatchesScope(row: DomainRow, filter: DomainScopeFilter): boolean {
  if (filter === 'all') return true
  const bucket = rowScopeBucket(row)
  if (filter === 'owned') {
    return bucket === 'core_owned' || bucket === 'owned_asset' || (bucket === 'vendor_operated' && row.issues.length > 0)
  }
  if (filter === 'vendor') return bucket === 'vendor_operated' || bucket === 'external_context'
  return bucket === 'candidate' || row.verifierStatus === 'inconclusive'
}

export function DomainsView() {
  const { org } = useOrg()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  // Server-side discovery state (SSE-driven, plus authoritative
  // seed from GET /discoveries/active so SSE drops don't strand
  // the chip forever). Operator fix 2026-05-23.
  useDiscoverySeed(org?.id)
  const { scanningSet, scanningCount, serverRows } = useDiscoveryStatus()
  const cancelDiscovery = useCancelDiscovery(org?.id)

  /** Sync a single filter key to the URL. Empty/default values are removed. */
  const updateParam = useCallback((key: string, value: string, defaultValue = '') => {
    setSearchParams(prev => {
      if (value === defaultValue) prev.delete(key)
      else prev.set(key, value)
      return prev
    }, { replace: true })
  }, [setSearchParams])

  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verifyDomain, setVerifyDomain] = useState('')
  const [verification, setVerification] = useState<DomainVerification | null>(null)
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [targetRelationship, setTargetRelationship] = useState<TargetRelationship>('owned')
  const [assessmentIntent, setAssessmentIntent] = useState<'passive_full_footprint' | 'active_authorized_testing'>('passive_full_footprint')
  const [mainTab, setMainTab] = useState<'domains' | 'checks'>(() => {
    const v = searchParams.get('tab')
    return v === 'checks' ? 'checks' : 'domains'
  })
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '')
  const [searchAnchorEl, setSearchAnchorEl] = useState<HTMLElement | null>(null)
  const searchActive = Boolean(searchAnchorEl) || Boolean(search)
  const [scopeFilter, setScopeFilter] = useState<DomainScopeFilter>(() => readScopeFilter(searchParams.get('scope')))
  const [selectedDomain, setSelectedDomain] = useState<string | null>(() => searchParams.get('domain'))
  const [checkFilter, setCheckFilter] = useState<string>('')
  const [authOnly, setAuthOnly] = useState(false)
  // Domain layering — filter + create form state.
  const [envFilter] = useState<string>('all')
  const [createEnv] = useState<string>('production')
  const [createRole] = useState<string>('primary')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  // resource_id of the footprint/kernel row whose per-asset scan is in flight.
  const [scanningResourceId, setScanningResourceId] = useState<string | null>(null)
  // Show Footprint-discovered but not-yet-verified candidates. Default OFF
  // so the surface stays the precise confirmed-only inventory; flipping it
  // passes include_candidates=true so unverified discoveries appear too.
  const [showCandidates, setShowCandidates] = useState(() => searchParams.get('candidates') === '1')
  const latestDomainRowsRef = useRef<DomainRow[]>([])
  const [scanBaselineDomains, setScanBaselineDomains] = useState<Set<string> | null>(null)

  const { data: pentestData } = useQuery({
    queryKey: qk.pentest.projects(org?.id),
    queryFn: () => listPentestProjects(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })

  const {
    data: kernelPostureData,
    isLoading: isKernelLoading,
    isError: isKernelError,
    error: kernelError,
    refetch: refetchKernel,
  } = useQuery({
    queryKey: qk.externalPostureKernel(org?.id),
    queryFn: () => getExternalPostureKernel(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })

  // Attack-surface firehose — ONLY fetched when the operator opts into
  // unverified candidates. The confirmed list derives its rows + counts
  // entirely from external-posture/kernel (single source); the org-wide
  // attack-surface payload (≈1.2 MB, 2-9 s) contributes zero rows in
  // confirmed mode — every active-without-`resolves` and refuted row is
  // dropped by buildDomainRows — so fetching it just to browse the list
  // was pure cost and a flicker source (two slow queries racing under the
  // scan-time SSE invalidation storm). Per-domain raw assets for the
  // detail tabs are now hydrated lazily inside DomainDetail. Candidates
  // mode still needs it: that's where the unverified discovery rows live.
  const {
    data: attackSurfaceData,
    isLoading: isAttackSurfaceLoading,
    isError: isAttackSurfaceError,
    error: attackSurfaceError,
    refetch: refetchAttackSurface,
  } = useQuery({
    queryKey: qk.attackSurfaceVariant(org?.id, showCandidates ? 'with-candidates' : 'confirmed'),
    queryFn: () => getEnrichedAttackSurface(org!.id, showCandidates),
    enabled: !!org?.id && showCandidates,
    staleTime: 60_000,
  })

  const createMut = useMutation({
    mutationFn: async () => {
      return createExternalTarget(org!.id, {
        name,
        target: targetUrl,
        target_url: targetUrl,
        relationship: targetRelationship,
        assessment_intent: assessmentIntent,
        project_type: selectedType!,
        environment: createEnv,
        role: createRole,
      })
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: qk.pentest.projects(org?.id) })
      qc.invalidateQueries({ queryKey: qk.attackSurface(org?.id) })
      qc.invalidateQueries({ queryKey: qk.attackSurfaceVariant(org?.id, 'confirmed') })
      qc.invalidateQueries({ queryKey: qk.attackSurfaceVariant(org?.id, 'with-candidates') })
      qc.invalidateQueries({ queryKey: qk.assetMapKernel(org?.id) })
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: qk.externalPostureKernel(org?.id) })
        qc.invalidateQueries({ queryKey: qk.assetMapKernel(org?.id) })
      }, 6000)
      if (!result.project) {
        const scope = SCOPE_LABELS[result.target.scope_bucket] ?? result.target.scope_bucket
        const action = result.target.required_action ? ` · ${result.target.required_action}` : ''
        showToast(`${result.message || t('domains.targetStoredAsFootprint')} · ${scope}${action}`, 6000)
      }
      resetCreate()
    },
    onError: (err) => {
      if (import.meta.env.DEV) console.error('Failed to create project:', err)
      const label = t('domains.mutationFailed.create')
      showToast(formatEngineError(err, label), 7000)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (domain: string) => deleteDomain(org!.id, domain),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.pentest.projects(org?.id) })
      qc.invalidateQueries({ queryKey: qk.externalPostureKernel(org?.id) })
      qc.invalidateQueries({ queryKey: qk.attackSurface(org?.id) })
    },
    onError: (err) => {
      if (import.meta.env.DEV) console.error('Failed to delete project:', err)
      const label = t('domains.mutationFailed.delete')
      showToast(formatEngineError(err, label), 7000)
    },
  })

  const scanAllMut = useMutation({
    onMutate: () => {
      const currentRows = latestDomainRowsRef.current
      if (currentRows.length > 0) {
        setScanBaselineDomains(new Set(currentRows.map(row => row.domain)))
      }
    },
    // Server responds instantly even when nothing is triggered; without a
    // floor the spinner flickers and spam-clicks look like no-ops.
    mutationFn: async () => {
      const [res] = await Promise.all([
        discoverAllDomains(org!.id),
        new Promise(r => setTimeout(r, 800)),
      ])
      return res
    },
    onSuccess: (data) => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: qk.externalPostureKernel(org?.id) })
        qc.invalidateQueries({ queryKey: qk.attackSurface(org?.id) })
      }, 10000)
      // `triggered` only counts project-bound scans; footprint/kernel
      // domains land in `scanning`/`kernel_domains`. Prefer the real
      // total so a footprint-only org doesn't see "all busy" at n=0.
      const n = data?.scanning ?? ((data?.triggered ?? 0) + (data?.kernel_domains ?? 0))
      showToast(
        n > 0
          ? tOr('domains.scanAllTriggered', `Triggered ${n} scans`).replace('{n}', String(n))
          : t('domains.scanAllAllBusy'),
      )
    },
    onError: (err) => {
      if (import.meta.env.DEV) console.error('Failed to scan all domains:', err)
      showToast(formatEngineError(err, t('domains.scanAllFailed')), 7000)
    },
  })

  // Per-domain scan for a footprint/kernel-origin row (no PentestProject).
  // The per-asset endpoint resolves kernel-first, so passing the row's
  // kernel resource_id scans a discovered domain without promoting it.
  // Mirrors AssetMapView's scanMut — same endpoint, same contract.
  const scanRowMut = useMutation({
    mutationFn: (row: DomainRow) => scanAttackSurfaceAsset(org!.id, row.resourceId!),
    onMutate: (row) => {
      setScanningResourceId(row.resourceId ?? null)
      if (row.resourceId) markDiscoveryStarted(row.resourceId)
    },
    onSuccess: (_data, row) => {
      if (row.resourceId) {
        markDiscoveryStarted(row.resourceId)
        qc.invalidateQueries({ queryKey: qk.exposure.discoveriesActive(org?.id) })
      }
      showToast(t('domains.scanStarted'))
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: qk.externalPostureKernel(org?.id) })
        qc.invalidateQueries({ queryKey: qk.attackSurface(org?.id) })
        qc.invalidateQueries({ queryKey: qk.assetMapKernel(org?.id) })
      }, 8000)
    },
    onError: (err, row) => {
      if (row.resourceId) markDiscoveryComplete(row.resourceId)
      const label = t('domains.scanFailed')
      showToast(formatEngineError(err, label), 7000)
    },
    onSettled: () => setScanningResourceId(null),
  })

  const createVerificationMut = useMutation({
    mutationFn: () => createDomainVerification(org!.id, verifyDomain),
    onSuccess: (data) => {
      setVerification(data)
      qc.invalidateQueries({ queryKey: qk.attackSurface(org?.id) })
      showToast(t('domains.verificationRecordReady'), 4000)
    },
    onError: (err) => showToast(formatEngineError(err, t('domains.verificationCreateFailed')), 7000),
  })

  const checkVerificationMut = useMutation({
    mutationFn: () => verifyDomainVerification(org!.id, verification?.domain || verifyDomain),
    onSuccess: (data) => {
      setVerification(data)
      qc.invalidateQueries({ queryKey: qk.attackSurface(org?.id) })
      qc.invalidateQueries({ queryKey: qk.pentest.projects(org?.id) })
      showToast(
        data.status === 'verified'
          ? t('domains.verificationVerified')
          : formatEngineError(new Error(data.failureReason || 'DNS TXT record not found'), t('domains.verificationFailed')),
        6000,
      )
    },
    onError: (err) => showToast(formatEngineError(err, t('domains.verificationCheckFailed')), 7000),
  })

  // Auto-hide the result chip after 4 seconds. Used for both the
  // happy path of scanAll AND for surfacing failures across the four
  // mutation paths (create / delete / link / createAndLink) that
  // previously only logged in DEV — silent fails left the operator
  // wondering why the row didn't update.
  const [scanAllToast, setScanAllToast] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Show a toast message that auto-hides after `ms` milliseconds. */
  const showToast = useCallback((msg: string, ms = 4000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setScanAllToast(msg)
    toastTimerRef.current = setTimeout(() => setScanAllToast(null), ms)
  }, [])

  function resetCreate() {
    setCreating(false)
    setSelectedType(null)
    setName('')
    setTargetUrl('')
    setTargetRelationship('owned')
    setAssessmentIntent('passive_full_footprint')
  }

  // Backend-computed per-domain score (unified scoring engine).
  // The Domains view does NOT recompute — it just renders what
  // /external-posture/kernel says. See [[backend-score-canonical]].
  const domainRows = useMemo(() => {
    const projects = pentestData?.projects ?? []
    const assets = flattenAttackSurfaceAssets(attackSurfaceData?.assets ?? [])
    return buildDomainRows(assets, projects, undefined, kernelPostureData?.assets, showCandidates)
  }, [attackSurfaceData, pentestData, kernelPostureData, showCandidates])
  const projectDomainBaseline = useMemo(() => {
    const domains = new Set<string>()
    for (const project of pentestData?.projects ?? []) {
      const domain = extractHostFromAssetValue(project.target_url)
      if (domain) domains.add(domain)
    }
    return domains
  }, [pentestData])
  const scanListFrozen = scanAllMut.isPending || scanningCount > 0
  useEffect(() => {
    latestDomainRowsRef.current = domainRows
  }, [domainRows])
  const visibleDomainRows = useMemo(() => {
    const baseline = scanListFrozen
      ? scanBaselineDomains ?? (projectDomainBaseline.size > 0 ? projectDomainBaseline : null)
      : null
    if (!baseline || baseline.size === 0) return domainRows
    return domainRows.filter(row => baseline.has(row.domain))
  }, [domainRows, projectDomainBaseline, scanBaselineDomains, scanListFrozen])
  const domainInventoryStats = useMemo(() => {
    const candidateRows = visibleDomainRows.filter(r => r.verifierStatus === 'inconclusive')
    const confirmedRows = visibleDomainRows.length - candidateRows.length
    return {
      confirmedRows,
      candidateRows: candidateRows.length,
      totalRows: visibleDomainRows.length,
      confirmedLabel: t('domains.confirmedCountLabel')
        .replace('{n}', String(confirmedRows)),
      candidateLabel: t('domains.candidateCountLabel')
        .replace('{n}', String(candidateRows.length)),
    }
  }, [visibleDomainRows])
  const scopeStats = useMemo(() => ({
    owned: visibleDomainRows.filter(r => rowMatchesScope(r, 'owned')).length,
    vendor: visibleDomainRows.filter(r => rowMatchesScope(r, 'vendor')).length,
    candidate: visibleDomainRows.filter(r => rowMatchesScope(r, 'candidate')).length,
    all: visibleDomainRows.length,
  }), [visibleDomainRows])
  // Group count — reuse GroupedDomainList's own grouper so the chip
  // and the rendered list can never disagree (in particular the
  // `byId.has(pid)` guard that promotes dangling-parent rows to
  // their own group rather than a phantom merge bucket). Telling
  // the operator "G groups · D domains" instead of just the raw
  // row total — a page showing 1 root + 5 subdomains otherwise
  // reads as "5" and the parent grouping is invisible up here.
  const groupCount = useMemo(() => groupRows(visibleDomainRows).length, [visibleDomainRows])
  const domainDataLoading = isKernelLoading || isAttackSurfaceLoading
  const domainDataError = isKernelError || isAttackSurfaceError
  const domainQueryError = kernelError ?? attackSurfaceError
  const refetchDomainData = useCallback(() => {
    void refetchKernel()
    void refetchAttackSurface()
  }, [refetchAttackSurface, refetchKernel])

  // Check catalog (all possible rules)
  const allChecks = useMemo(() => CHECK_CATALOG.map(c => ({ ...c })), [])

  const filtered = useMemo(() => {
    if (mainTab === 'checks') return visibleDomainRows
    let rows = visibleDomainRows
    if (envFilter !== 'all') {
      rows = rows.filter(r => r.project?.environment === envFilter)
    }
    rows = rows.filter(r => rowMatchesScope(r, scopeFilter))
    if (!search) return rows
    const q = search.toLowerCase()
    return rows.filter(r => r.domain.toLowerCase().includes(q))
  }, [visibleDomainRows, search, mainTab, envFilter, scopeFilter])

  const filteredChecks = useMemo(() => {
    let list = allChecks
    if (checkFilter) list = list.filter(c => c.category === checkFilter)
    if (authOnly) list = list.filter(c => c.authenticated)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c => c.title.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q))
    }
    return list
  }, [allChecks, search, checkFilter, authOnly])

  const totalPages = mainTab === 'domains'
    ? Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE))
    : Math.max(1, Math.ceil(filteredChecks.length / CHECKS_PAGE_SIZE))
  const pagedDomains = filtered.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE)
  const pagedChecks = filteredChecks.slice((page - 1) * CHECKS_PAGE_SIZE, page * CHECKS_PAGE_SIZE)

  // Domain detail
  const detail = selectedDomain ? visibleDomainRows.find(r => r.domain === selectedDomain) : null
  if (selectedDomain && !detail) {
    if (import.meta.env.DEV) console.warn('DomainsView: selectedDomain not found', selectedDomain)
  }
  if (detail) {
    return (
      <>
        <DomainDetail row={detail} onBack={() => { setSelectedDomain(null); updateParam('domain', '') }} onDelete={(id) => { setDeleteTarget(id) }} orgId={org?.id ?? ''} />
        {deleteTarget && (
          <Box sx={{
            position: 'fixed', inset: 0, zIndex: 1300,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: 'rgba(0,0,0,0.5)',
          }} onClick={() => setDeleteTarget(null)}>
            <Paper sx={{ p: 3, maxWidth: 400, borderRadius: 3 }} onClick={e => e.stopPropagation()}>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
                {t('domains.confirmDeleteTitle')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {t('domains.confirmDeleteDesc')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button size="small" onClick={() => setDeleteTarget(null)} sx={{ textTransform: 'none' }}>
                  {t('common.cancel')}
                </Button>
                <GatedButton size="small" action="domain:remove" variant="contained" color="error" sx={{ textTransform: 'none' }}
                  onClick={() => { deleteMut.mutate(deleteTarget); setDeleteTarget(null); setSelectedDomain(null); updateParam('domain', '') }}>
                  {t('common.delete')}
                </GatedButton>
              </Box>
            </Paper>
          </Box>
        )}
      </>
    )
  }

  const selectedTypeInfo = selectedType ? PROJECT_TYPES.find(p => p.id === selectedType) : null

  const tabIndex = mainTab === 'domains' ? 0 : 1
  function handleTabChange(_: SyntheticEvent, value: number) {
    const tab = value === 0 ? 'domains' : 'checks'
    setMainTab(tab)
    updateParam('tab', tab, 'domains')
    setPage(1)
  }

  const sevLabel = (sev: string) => {
    switch (sev) {
      case 'CRITICAL': return t('issues.critical')
      case 'HIGH': return t('issues.high')
      case 'MEDIUM': return t('issues.moderate')
      default: return t('issues.low')
    }
  }

  return (
    <>
    {/* Create Dialog */}
    <Dialog
      open={creating}
      onClose={resetCreate}
      maxWidth={selectedType ? 'sm' : 'md'}
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'background.paper',
          backgroundImage: 'none',
        },
      }}
    >
      <DialogTitle sx={{ borderBottom: 1, borderColor: 'divider', fontWeight: 700, fontSize: 16 }}>
        {selectedType ? t(selectedTypeInfo!.nameKey) : t('pentest.chooseType')}
      </DialogTitle>
      <DialogContent sx={{ p: 2.5 }}>
        {!selectedType ? (
          <Box className="grid grid-cols-2 gap-3 pt-2">
            {PROJECT_TYPES.map((pt) => {
              const Icon = pt.icon
              return (
                <Paper
                  key={pt.id}
                  elevation={0}
                  onClick={() => { setSelectedType(pt.id); setName(''); setTargetUrl('') }}
                  sx={{
                    p: 2.5,
                    cursor: 'pointer',
                    borderRadius: 3,
                    border: 1,
                    borderColor: 'divider',
                    transition: 'border-color 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                    '&:hover': {
                      borderColor: pt.color,
                    },
                  }}
                >
                  <Box className="flex items-center gap-3">
                    <Box sx={{ color: pt.color }}><Icon size={28} /></Box>
                    <Typography variant="subtitle2" fontWeight={700}>{t(pt.nameKey)}</Typography>
                  </Box>
                  <Box sx={{ minHeight: 22, mt: 1 }}>
                    {pt.staging && (
                      <Chip label={t('pentest.stagingOnly')} size="small" color="warning" variant="outlined" sx={{ fontSize: 12, height: 22 }} />
                    )}
                  </Box>
                  <Typography variant="body2" sx={{ flex: 1, mt: 0.5, lineHeight: 1.5 }}>{t(pt.descKey)}</Typography>
                  <Box className="flex justify-end mt-1.5">
                    <ArrowRight size={14} style={{ opacity: 0.4 }} />
                  </Box>
                </Paper>
              )
            })}
          </Box>
        ) : (
          <Box className="flex flex-col gap-4 pt-2">
            <TextField
              label={t('pentest.projectName')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('pentest.projectNamePlaceholder')}
              size="small"
              fullWidth
              autoFocus
            />
            <TextField
              label={t('pentest.targetUrl')}
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://example.com"
              size="small"
              fullWidth
              onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter' && name.trim() && targetUrl.trim()) createMut.mutate() }}
            />
            <TextField
              select
              label={t('domains.targetRelationship')}
              value={targetRelationship}
              onChange={(e) => setTargetRelationship(e.target.value as TargetRelationship)}
              size="small"
              fullWidth
            >
              <MenuItem value="owned">{t('domains.relationshipOwned')}</MenuItem>
              <MenuItem value="vendor">{t('domains.relationshipVendor')}</MenuItem>
              <MenuItem value="external_context">{t('domains.relationshipExternalContext')}</MenuItem>
              <MenuItem value="candidate">{t('domains.relationshipCandidate')}</MenuItem>
            </TextField>
            <TextField
              select
              label={t('domains.assessmentIntent')}
              value={assessmentIntent}
              onChange={(e) => setAssessmentIntent(e.target.value as 'passive_full_footprint' | 'active_authorized_testing')}
              size="small"
              fullWidth
            >
              <MenuItem value="passive_full_footprint">{t('domains.intentPassive')}</MenuItem>
              <MenuItem value="active_authorized_testing">{t('domains.intentActive')}</MenuItem>
            </TextField>
            <Alert severity={targetRelationship === 'owned' ? 'info' : assessmentIntent === 'active_authorized_testing' ? 'warning' : 'info'}>
              {targetRelationship === 'owned'
                ? t('domains.ownedTargetGateHint')
                : t('domains.externalTargetGateHint')}
            </Alert>
            {selectedTypeInfo?.staging && (
              <Typography variant="caption" color="warning.main">{t('pentest.stagingWarn')}</Typography>
            )}
            <Box className="flex justify-end gap-2">
              <Button variant="outlined" size="small" onClick={() => setSelectedType(null)}>
                {t('pentest.back')}
              </Button>
              <GatedButton
                action="domain:add"
                variant="contained"
                size="small"
                disabled={!name.trim() || !targetUrl.trim() || createMut.isPending}
                onClick={() => createMut.mutate()}
                startIcon={createMut.isPending ? <CircularProgress size={14} /> : <Plus size={14} />}
              >
                {t('pentest.create')}
              </GatedButton>
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>

    {/* DNS verification dialog */}
    <Dialog
      open={verifying}
      onClose={() => setVerifying(false)}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { bgcolor: 'background.paper', backgroundImage: 'none' } }}
    >
      <DialogTitle sx={{ borderBottom: 1, borderColor: 'divider', fontWeight: 700, fontSize: 16 }}>
        {t('domains.verifyDnsTitle')}
      </DialogTitle>
      <DialogContent sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('domains.verifyDnsDesc')}
          </Typography>
          <TextField
            label={t('domains.domain')}
            value={verifyDomain}
            onChange={(e) => setVerifyDomain(e.target.value)}
            placeholder="example.com"
            size="small"
            fullWidth
          />
          {verification && (
            <Box sx={{
              border: 1,
              borderColor: verification.status === 'verified' ? 'success.main' : 'divider',
              borderRadius: 2,
              p: 2,
              bgcolor: alpha(verification.status === 'verified' ? '#22c55e' : '#94a3b8', 0.08),
              display: 'flex',
              flexDirection: 'column',
              gap: 1.25,
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Typography variant="subtitle2" fontWeight={700}>
                  {verification.domain}
                </Typography>
                <Chip
                  label={verification.status}
                  size="small"
                  color={verification.status === 'verified' ? 'success' : verification.status === 'failed' ? 'warning' : 'default'}
                  variant="outlined"
                />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">{t('domains.txtName')}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}>
                    {verification.recordName}
                  </Typography>
                  <Button size="small" onClick={() => navigator.clipboard?.writeText(verification.recordName)}>
                    {t('common.copy')}
                  </Button>
                </Box>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">{t('domains.txtValue')}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}>
                    {verification.recordValue}
                  </Typography>
                  <Button size="small" onClick={() => navigator.clipboard?.writeText(verification.recordValue)}>
                    {t('common.copy')}
                  </Button>
                </Box>
              </Box>
              {verification.failureReason && verification.status !== 'verified' && (
                <Typography variant="caption" color="warning.main">
                  {verification.failureReason}
                </Typography>
              )}
            </Box>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button size="small" onClick={() => setVerifying(false)}>
              {t('common.close')}
            </Button>
            <GatedButton
              action="domain:validate"
              size="small"
              variant="outlined"
              disabled={!verifyDomain.trim() || createVerificationMut.isPending}
              onClick={() => createVerificationMut.mutate()}
            >
              {createVerificationMut.isPending
                ? t('common.creating')
                : t('domains.createVerification')}
            </GatedButton>
            <GatedButton
              action="domain:validate"
              size="small"
              variant="contained"
              disabled={(!verification && !verifyDomain.trim()) || checkVerificationMut.isPending}
              onClick={() => checkVerificationMut.mutate()}
            >
              {checkVerificationMut.isPending
                ? t('domains.checkingDns')
                : t('domains.checkDns')}
            </GatedButton>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>

    {/* Main */}
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden', p: 2, gap: 2 }}>
      <FlytoPageHeader
        title={
          // Section-accent icon (exposure cyan) so engineer mode reads as
          // the same page as the manager-mode posture summary, which carries
          // the same colors.section.exposure accent on its title icon.
          <Box className="flex items-center gap-2.5">
            <Box
              sx={{
                display: 'grid', placeItems: 'center',
                width: 34, height: 34, borderRadius: 2, flexShrink: 0,
                color: colors.section.exposure,
                bgcolor: alpha(colors.section.exposure, 0.12),
              }}
            >
              <Globe size={19} />
            </Box>
            {t('dast.attackSurface')}
          </Box>
        }
        subtitle={t('dast.subtitle')}
        count={
          <Chip
            label={showCandidates && domainInventoryStats.candidateRows > 0
              ? `${domainInventoryStats.confirmedRows} + ${domainInventoryStats.candidateRows}`
              : (groupCount !== visibleDomainRows.length ? `${groupCount} · ${visibleDomainRows.length}` : visibleDomainRows.length)}
            size="small"
            title={showCandidates && domainInventoryStats.candidateRows > 0
              ? `${domainInventoryStats.confirmedLabel} · ${domainInventoryStats.candidateLabel}`
              : (groupCount !== visibleDomainRows.length
                  ? tOr('domains.countTooltip', `${groupCount} group(s) · ${visibleDomainRows.length} domain(s) total`)
                  : undefined)}
            sx={{ fontWeight: 700, height: 22, fontSize: 13, bgcolor: 'rgba(148, 163, 184, 0.16)', color: 'text.primary' }}
          />
        }
        action={
          <>
            <GatedButton
              action="domain:validate"
              variant="outlined"
              size="medium"
              onClick={() => {
                setVerifyDomain(selectedDomain ?? '')
                setVerification(null)
                setVerifying(true)
              }}
              startIcon={<ShieldCheck size={16} />}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, px: 3 }}
            >
              {t('domains.verifyDns')}
            </GatedButton>
            <GatedButton
              action="domain:add"
              variant="outlined"
              size="medium"
              onClick={() => setImporting(true)}
              startIcon={<Upload size={16} />}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, px: 3 }}
            >
              {t('domains.importCsv')}
            </GatedButton>
            <GatedButton
              action="domain:add"
              variant="contained"
              color="primary"
              size="medium"
              onClick={() => setCreating(true)}
              startIcon={<Plus size={16} />}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, px: 3 }}
            >
              {t('pentest.addDomain')}
            </GatedButton>
          </>
        }
      />

      <Tabs
        value={tabIndex}
        onChange={handleTabChange}
        variant="standard"
        sx={{
          minHeight: 44,
          flexShrink: 0,
          borderBottom: 1, borderColor: 'divider',
          '& .MuiTab-root': {
            textTransform: 'none',
            fontWeight: 600,
            fontSize: 15,
            minHeight: 44,
          },
        }}
      >
        <Tab label={
          <Box className="flex items-center gap-1.5">
            {t('dast.domainName')}
            <Chip
              label={showCandidates && domainInventoryStats.candidateRows > 0
                ? `${domainInventoryStats.confirmedRows} + ${domainInventoryStats.candidateRows}`
                : (groupCount !== visibleDomainRows.length ? `${groupCount} · ${visibleDomainRows.length}` : visibleDomainRows.length)}
              size="small"
              title={showCandidates && domainInventoryStats.candidateRows > 0
                ? `${domainInventoryStats.confirmedLabel} · ${domainInventoryStats.candidateLabel}`
                : undefined}
              sx={{ height: 22, fontSize: 13, fontWeight: 700 }}
            />
          </Box>
        } />
        <Tab label={
          <Box className="flex items-center gap-1.5">
            {t('dast.checks')}
            <Chip label={allChecks.length} size="small" sx={{ height: 22, fontSize: 13, fontWeight: 700 }} />
          </Box>
        } />
      </Tabs>

      <Box className="flex items-center gap-2 mb-1 flex-wrap">
        <Tooltip title={t('common.search')}>
          <IconButton
            size="small"
            aria-label={t('common.search')}
            aria-pressed={searchActive}
            onClick={(event) => setSearchAnchorEl(event.currentTarget)}
            sx={{
              ...domainToolbarControlSx,
              width: DOMAIN_TOOLBAR_H,
              minWidth: DOMAIN_TOOLBAR_H,
              p: 0,
              flexShrink: 0,
              border: 1,
              borderColor: colors.brand,
              bgcolor: searchActive ? colors.brand : alpha(colors.brand, 0.07),
              color: searchActive ? 'common.white' : colors.brand,
              boxShadow: `inset 0 0 0 1px ${alpha(colors.brand, searchActive ? 0.18 : 0.08)}`,
              '& svg': {
                width: 19,
                height: 19,
                strokeWidth: 2.25,
              },
              '&:hover': {
                bgcolor: searchActive ? colors.brand : alpha(colors.brand, 0.12),
                borderColor: colors.brand,
                color: searchActive ? 'common.white' : colors.brand,
                boxShadow: `inset 0 0 0 1px ${alpha(colors.brand, 0.14)}`,
              },
            }}
          >
            <SearchIcon size={19} />
          </IconButton>
        </Tooltip>
        <Popover
          open={Boolean(searchAnchorEl)}
          anchorEl={searchAnchorEl}
          onClose={() => setSearchAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          slotProps={{
            paper: {
              sx: {
                mt: 1,
                p: 1,
                width: 360,
                maxWidth: 'calc(100vw - 32px)',
                borderRadius: 2,
                border: 1,
                borderColor: alpha(colors.brand, 0.22),
                boxShadow: '0 18px 40px rgba(15,23,42,0.16)',
              },
            },
          }}
        >
          <SearchField
            autoFocus
            height={DOMAIN_TOOLBAR_H}
            placeholder={t('common.search')}
            value={search}
            onChange={(v) => { setSearch(v); updateParam('q', v); setPage(1) }}
            sx={{
              width: '100%',
              '& .MuiOutlinedInput-root': {
                height: DOMAIN_TOOLBAR_H,
                minHeight: DOMAIN_TOOLBAR_H,
                maxHeight: DOMAIN_TOOLBAR_H,
                borderRadius: 1.5,
                bgcolor: alpha(colors.brand, 0.035),
              },
              '&& .MuiOutlinedInput-root': {
                height: DOMAIN_TOOLBAR_H,
                minHeight: DOMAIN_TOOLBAR_H,
                maxHeight: DOMAIN_TOOLBAR_H,
              },
              '& .MuiOutlinedInput-notchedOutline': {
                top: 0,
                borderColor: alpha(colors.brand, 0.45),
              },
              '& .MuiOutlinedInput-notchedOutline legend': {
                display: 'none',
              },
              '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: alpha(colors.brand, 0.75),
              },
              '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: colors.brand,
                borderWidth: 1,
              },
              '& .MuiInputBase-input': {
                height: DOMAIN_TOOLBAR_H,
                py: 0,
                lineHeight: `${DOMAIN_TOOLBAR_H}px`,
                boxSizing: 'border-box',
              },
              '& .MuiInputAdornment-root svg': {
                width: 18,
                height: 18,
              },
            }}
          />
        </Popover>
        {[
          { id: 'owned' as const, label: t('domains.scopeOwned'), count: scopeStats.owned },
          { id: 'vendor' as const, label: t('domains.scopeVendors'), count: scopeStats.vendor },
          { id: 'candidate' as const, label: t('domains.scopeCandidates'), count: scopeStats.candidate },
          { id: 'all' as const, label: t('domains.scopeAll'), count: scopeStats.all },
        ].map(item => {
          const active = scopeFilter === item.id
          return (
            <Chip
              key={item.id}
              label={`${item.label} · ${item.count}`}
              variant={active ? 'filled' : 'outlined'}
              color={active ? 'primary' : 'default'}
              onClick={() => {
                setScopeFilter(item.id)
                updateParam('scope', item.id, 'owned')
                setPage(1)
              }}
              sx={{ ...domainToolbarControlSx, flexShrink: 0, px: 0.5 }}
            />
          )
        })}
        {/* Reveal Footprint-discovered, not-yet-verified candidates. Off
            by default so the surface stays the precise confirmed inventory;
            on → include_candidates=true. Candidate rows are badged below. */}
        <Chip
          icon={<Eye size={14} />}
          label={showCandidates && domainInventoryStats.candidateRows > 0
            ? `${t('dast.showCandidates')} · ${domainInventoryStats.candidateRows}`
            : t('dast.showCandidates')}
          variant={showCandidates ? 'filled' : 'outlined'}
          color={showCandidates ? 'primary' : 'default'}
          title={showCandidates
            ? t('domains.candidateModeHint')
            : t('domains.candidateModeOffHint')}
          onClick={() => {
            const next = !showCandidates
            setShowCandidates(next)
            updateParam('candidates', next ? '1' : '')
            setPage(1)
          }}
          // Share the domains toolbar's fixed height so search, filters, and scan align.
          sx={{ ...domainToolbarControlSx, flexShrink: 0, px: 0.5 }}
        />
        {visibleDomainRows.length > 0 && (
          <Box className="flex items-center gap-2">
            <GatedButton
              action="scan:trigger"
              variant="outlined"
              size="small"
              onClick={() => scanAllMut.mutate()}
              // Two guards: HTTP in flight (mut.isPending) AND
              // server reports any discovery active (scanningCount).
              // The second is the one that actually matters — the
              // first only covers ~200ms of HTTP latency.
              disabled={scanAllMut.isPending || scanningCount > 0}
              startIcon={(scanAllMut.isPending || scanningCount > 0) ? <CircularProgress size={14} /> : <Radar size={14} />}
              sx={{
                ...domainToolbarControlSx,
                px: 1.25,
                borderColor: colors.brand,
                bgcolor: alpha(colors.brand, 0.07),
                boxShadow: `inset 0 0 0 1px ${alpha(colors.brand, 0.08)}`,
                '&:hover': {
                  borderColor: colors.brand,
                  bgcolor: alpha(colors.brand, 0.12),
                  boxShadow: `inset 0 0 0 1px ${alpha(colors.brand, 0.14)}`,
                },
              }}
              title={scanningCount > 0
                ? tOr('dast.scanAllInProgress', `${scanningCount} discovery scan(s) in progress — wait for them to complete`)
                : undefined}
            >
              {scanningCount > 0
                ? t('dast.scanAllRunning')
                : t('dast.scanAll')}
            </GatedButton>
            {scanAllToast && (
              <Chip
                label={scanAllToast}
                size="small"
                color={scanAllMut.isError ? 'error' : 'success'}
                variant="outlined"
                sx={{ fontSize: 12 }}
              />
            )}
          </Box>
        )}
      </Box>

      {/* In-flight discovery chips — one per active scan so the operator
          can cancel a runaway. Rendered as a full-width WRAPPING row
          (its own line, not crammed beside the Scan button) so many
          concurrent scans flow onto multiple lines + scroll instead of
          overflowing the toolbar horizontally and breaking the layout.
          Server-seeded via useDiscoverySeed → survives pod restarts +
          SSE drops. */}
      {scanningCount > 0 && serverRows.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1, maxHeight: 132, overflowY: 'auto', flexShrink: 0 }}>
          {serverRows.map((row) => {
            const elapsedMin = Math.floor(row.elapsed_sec / 60)
            const elapsedSec = row.elapsed_sec % 60
            const label = `${row.target} · ${elapsedMin}m${String(elapsedSec).padStart(2, '0')}s`
            return (
              <Chip
                key={row.project_id}
                label={label}
                size="small"
                variant="outlined"
                onDelete={() => cancelDiscovery.mutate(row.project_id)}
                disabled={cancelDiscovery.isPending}
                sx={{
                  fontSize: 12,
                  maxWidth: 260,
                  borderColor: 'warning.main',
                  color: 'warning.main',
                  '& .MuiChip-deleteIcon': { color: 'warning.main' },
                }}
                title={t('dast.cancelScan')}
              />
            )
          })}
        </Box>
      )}

      {domainDataLoading && (
        <Box className="flex items-center justify-center py-16">
          <CircularProgress size={20} />
        </Box>
      )}

      {domainDataError && (
        <Paper elevation={1} className="rounded-xl" sx={{ p: 4 }}>
          <QueryError error={domainQueryError} onRetry={refetchDomainData} label={t('domains.label')} />
        </Paper>
      )}

      {/* Domains tab — local-scroll region. Outer DomainsView Box
          owns the page-level overflow:hidden, so the list must own
          its own scroll otherwise long lists get clipped and the
          user can't reach the bottom. Pagination is pinned (no flex)
          so it stays visible while the list scrolls behind it. */}
      {mainTab === 'domains' && !domainDataLoading && (
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {visibleDomainRows.length === 0 ? (
            <Paper elevation={1} className="rounded-xl" sx={{ py: 4, px: 4 }}>
              <EmptyStateGuide
                icon={<Globe size={28} />}
                title={t('dast.emptyTitle')}
                description={t('dast.emptyDesc')}
                primaryAction={{
                  label: t('pentest.addDomain'),
                  onClick: () => setCreating(true),
                  icon: <Plus size={16} />,
                }}
                secondaryAction={{
                  label: t('domains.importCsv'),
                  onClick: () => setImporting(true),
                  icon: <Upload size={16} />,
                }}
              />
            </Paper>
          ) : (
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', pr: 0.5 }}>
              {filtered.length === 0 ? (
                <Paper elevation={1} className="rounded-xl" sx={{ py: 5, px: 4, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('domains.noScopeMatches')}
                  </Typography>
                </Paper>
              ) : (
                <GroupedDomainList
                  rows={pagedDomains}
                  onSelect={(d) => { setSelectedDomain(d); updateParam('domain', d ?? '') }}
                  onDelete={(domain) => setDeleteTarget(domain)}
                  onScan={(row) => scanRowMut.mutate(row)}
                  scanningResourceId={scanningResourceId}
                  scanningResourceIds={scanningSet}
                />
              )}
            </Box>
          )}
          <Box sx={{ flexShrink: 0 }}>
            <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={LIST_PAGE_SIZE} onPageChange={setPage} />
          </Box>
        </Box>
      )}

      {/* Checks tab */}
      {mainTab === 'checks' && !domainDataLoading && (
        <Paper elevation={1} className="rounded-xl" sx={{
          bgcolor: 'background.paper', flex: 1, minHeight: 0,
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          {/* Filters — pinned. Cleaner version per operator 2026-05-23
              "好醜": removed the nested count chip inside All Types
              (the right-side N/Total chip already shows that), used
              a single filter-row visual (button-style with subtle
              brand-tint on the active filter, no MUI "primary"
              filled bright purple). */}
          <Box sx={{ px: 2.5, pt: 1.5, pb: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
            <Box className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: '', label: t('issues.allTypes') },
                { id: 'frontend', label: t('pentest.frontend') },
                { id: 'rest_api', label: t('dast.restApi') },
                { id: 'graphql', label: t('dast.graphql') },
                { id: 'attack_surface', label: t('pentest.attackSurface') },
              ].map(f => {
                const active = checkFilter === f.id
                return (
                  <Chip
                    key={f.id}
                    label={f.label}
                    size="small"
                    onClick={() => { setCheckFilter(f.id); setPage(1) }}
                    sx={{
                      fontSize: 13, height: 26, cursor: 'pointer', fontWeight: active ? 700 : 500,
                      bgcolor: active ? 'rgba(139,92,246,0.16)' : 'transparent',
                      color: active ? '#a78bfa' : 'text.secondary',
                      border: '1px solid',
                      borderColor: active ? 'rgba(139,92,246,0.45)' : 'divider',
                      '&:hover': { bgcolor: active ? 'rgba(139,92,246,0.22)' : 'action.hover' },
                    }}
                  />
                )
              })}
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={authOnly}
                    onChange={(e) => { setAuthOnly(e.target.checked); setPage(1) }}
                  />
                }
                label={<Typography variant="caption" sx={{ fontSize: 13 }}>{t('dast.authOnly')}</Typography>}
                sx={{ ml: 0.5 }}
              />
              <Typography
                sx={{
                  ml: 'auto', fontSize: 13, fontWeight: 600, color: 'text.secondary',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {filteredChecks.length} / {allChecks.length}
              </Typography>
            </Box>
          </Box>

          {/* Table — scrollable */}
          {filteredChecks.length === 0 ? (
            <Box className="flex flex-col items-center gap-2 py-12">
              <ShieldCheck size={32} style={{ opacity: 0.15 }} />
              <Typography variant="body2" color="text.secondary">
                {t('dast.noChecksTitle')}
              </Typography>
            </Box>
          ) : (
            <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
              <Table stickyHeader size="small" sx={{
                '& td, & th': { fontSize: 13, py: 1.25, px: 2.5 },
                '& tr:nth-of-type(even) td': { bgcolor: 'action.hover' },
                '& tr:hover td': { bgcolor: 'action.selected' },
              }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>{t('issues.name')}</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', width: 130, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>{t('dast.category')}</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 12, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', width: 110, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }} align="right">{t('issues.severity')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pagedChecks.map((check, idx) => {
                    // Calm severity palette — soft tinted backgrounds
                    // instead of MUI's bright filled chips. Per CLAUDE.md
                    // feedback_ui_design_philosophy: "Brand young, data
                    // calm". For a 32-row reference catalog, alarming
                    // red on every row visually competes with actual
                    // open findings on other pages.
                    const sev = check.severity?.toLowerCase() || 'medium'
                    const sevTone =
                      sev === 'critical' ? { fg: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
                      : sev === 'high'   ? { fg: '#f97316', bg: 'rgba(249,115,22,0.12)' }
                      : sev === 'medium' ? { fg: '#eab308', bg: 'rgba(234,179,8,0.12)' }
                      : sev === 'low'    ? { fg: '#38bdf8', bg: 'rgba(56,189,248,0.12)' }
                      :                    { fg: '#94a3b8', bg: 'rgba(148,163,184,0.12)' }
                    return (
                      <TableRow key={idx}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, mb: 0.25 }}>
                            <Typography component="span" variant="body2" fontWeight={600} color="text.primary" sx={{ fontSize: 14, lineHeight: 1.4, minWidth: 0 }}>
                              {tOr(check.titleKey, check.title)}
                            </Typography>
                            {check.authenticated && (
                              <Chip
                                label={t('dast.authenticatedOnly')}
                                size="small"
                                sx={{
                                  height: 18, fontSize: 12, fontWeight: 600, flexShrink: 0,
                                  bgcolor: 'rgba(139,92,246,0.12)', color: '#a78bfa',
                                  border: '1px solid rgba(139,92,246,0.30)',
                                }}
                              />
                            )}
                          </Box>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 13, lineHeight: 1.45 }}>
                            {tOr(check.descKey, check.desc)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={
                              check.category === 'rest_api'        ? t('domains.checkCategory.restApi')
                              : check.category === 'graphql'       ? t('domains.checkCategory.graphql')
                              : check.category === 'attack_surface'? t('domains.checkCategory.surface')
                              :                                      t('domains.checkCategory.frontend')
                            }
                            size="small"
                            sx={{
                              fontSize: 12, height: 22, fontWeight: 600,
                              bgcolor: 'action.hover', color: 'text.secondary',
                              border: '1px solid', borderColor: 'divider',
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Chip
                            label={sevLabel(check.severity)}
                            size="small"
                            sx={{
                              fontSize: 12, fontWeight: 700, height: 22,
                              bgcolor: sevTone.bg, color: sevTone.fg,
                              border: `1px solid ${sevTone.fg}33`,
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Pagination — pinned bottom */}
          {filteredChecks.length > CHECKS_PAGE_SIZE && (
            <Box sx={{ px: 2, py: 1, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
              <Pagination page={page} totalPages={totalPages} total={filteredChecks.length} pageSize={CHECKS_PAGE_SIZE} onPageChange={setPage} />
            </Box>
          )}
        </Paper>
      )}
    </Box>

    <Dialog
      open={!!deleteTarget}
      onClose={() => setDeleteTarget(null)}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { bgcolor: 'background.paper', backgroundImage: 'none' } }}
    >
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18 }}>
        {t('domains.confirmDeleteTitle')}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          {t('domains.confirmDeleteDesc')}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={() => setDeleteTarget(null)} sx={{ textTransform: 'none' }}>
          {t('common.cancel')}
        </Button>
        <GatedButton
          action="domain:remove"
          size="small"
          variant="contained"
          color="error"
          sx={{ textTransform: 'none' }}
          onClick={() => {
            if (deleteTarget) deleteMut.mutate(deleteTarget)
            setDeleteTarget(null)
          }}
        >
          {t('common.delete')}
        </GatedButton>
      </DialogActions>
    </Dialog>

    {/* Import CSV Modal */}
    <DomainImportModal opened={importing} onClose={() => setImporting(false)} />
    </>
  )
}

// Static check catalog
const CHECK_CATALOG: Array<DomainIssue & { domain: string; titleKey: string; descKey: string }> = [
  { title: 'JWT token has weak secret', desc: 'The JWT token uses a weak or known compromised secret.', titleKey: 'domains.check.jwt_token_has_weak_secret.title', descKey: 'domains.check.jwt_token_has_weak_secret.desc', severity: 'CRITICAL', authenticated: true, category: 'rest_api', domain: '' },
  { title: 'Server accepts invalid JWT tokens', desc: 'The server accepts JWT tokens with invalid signatures.', titleKey: 'domains.check.server_accepts_invalid_jwt_tokens.title', descKey: 'domains.check.server_accepts_invalid_jwt_tokens.desc', severity: 'CRITICAL', authenticated: true, category: 'rest_api', domain: '' },
  { title: 'Heartbleed OpenSSL Vulnerability', desc: 'OpenSSL Heartbeat Extension vulnerability.', titleKey: 'domains.check.heartbleed_openssl_vulnerability.title', descKey: 'domains.check.heartbleed_openssl_vulnerability.desc', severity: 'CRITICAL', category: 'frontend', domain: '' },
  { title: 'CSP header not set', desc: 'Content Security Policy is not configured.', titleKey: 'domains.check.csp_header_not_set.title', descKey: 'domains.check.csp_header_not_set.desc', severity: 'CRITICAL', category: 'frontend', domain: '' },
  { title: 'HSTS not enforced', desc: 'HTTP Strict Transport Security is not configured.', titleKey: 'domains.check.hsts_not_enforced.title', descKey: 'domains.check.hsts_not_enforced.desc', severity: 'CRITICAL', category: 'frontend', domain: '' },
  { title: 'Directory browsing detected', desc: 'Directory listings are enabled.', titleKey: 'domains.check.directory_browsing_detected.title', descKey: 'domains.check.directory_browsing_detected.desc', severity: 'CRITICAL', category: 'attack_surface', domain: '' },
  { title: '.env file publicly readable', desc: 'Environment files expose credentials.', titleKey: 'domains.check.env_file_publicly_readable.title', descKey: 'domains.check.env_file_publicly_readable.desc', severity: 'CRITICAL', category: 'attack_surface', domain: '' },
  { title: "Server accepts 'none' algorithm JWT", desc: "JWT signed with 'none' algorithm bypasses verification.", titleKey: 'domains.check.server_accepts_none_algorithm_jwt.title', descKey: 'domains.check.server_accepts_none_algorithm_jwt.desc', severity: 'CRITICAL', authenticated: true, category: 'rest_api', domain: '' },
  { title: 'Server accepts self-signed JWK', desc: 'Self-signed JWK keys allow impersonation.', titleKey: 'domains.check.server_accepts_self_signed_jwk.title', descKey: 'domains.check.server_accepts_self_signed_jwk.desc', severity: 'CRITICAL', authenticated: true, category: 'rest_api', domain: '' },
  { title: 'Session cookie not secured', desc: 'Session cookie missing httpOnly/secure.', titleKey: 'domains.check.session_cookie_not_secured.title', descKey: 'domains.check.session_cookie_not_secured.desc', severity: 'HIGH', authenticated: true, category: 'frontend', domain: '' },
  { title: 'Session token in browser storage', desc: 'Session tokens in localStorage are vulnerable.', titleKey: 'domains.check.session_token_in_browser_storage.title', descKey: 'domains.check.session_token_in_browser_storage.desc', severity: 'HIGH', authenticated: true, category: 'frontend', domain: '' },
  { title: 'CSP allows inline JavaScript', desc: 'Inline JS is a common XSS vector.', titleKey: 'domains.check.csp_allows_inline_javascript.title', descKey: 'domains.check.csp_allows_inline_javascript.desc', severity: 'HIGH', category: 'frontend', domain: '' },
  { title: 'SSL Certificate near expiration', desc: 'TLS certificate is about to expire.', titleKey: 'domains.check.ssl_certificate_near_expiration.title', descKey: 'domains.check.ssl_certificate_near_expiration.desc', severity: 'HIGH', category: 'attack_surface', domain: '' },
  { title: 'CSP does not block eval()', desc: 'eval() enables code injection.', titleKey: 'domains.check.csp_does_not_block_eval.title', descKey: 'domains.check.csp_does_not_block_eval.desc', severity: 'HIGH', category: 'frontend', domain: '' },
  { title: 'CSP missing fallback directive', desc: 'Browser treats unrestricted content types as allowed.', titleKey: 'domains.check.csp_missing_fallback_directive.title', descKey: 'domains.check.csp_missing_fallback_directive.desc', severity: 'HIGH', category: 'frontend', domain: '' },
  { title: 'Site accessible over HTTP', desc: 'HTTP without redirect to HTTPS.', titleKey: 'domains.check.site_accessible_over_http.title', descKey: 'domains.check.site_accessible_over_http.desc', severity: 'HIGH', category: 'frontend', domain: '' },
  { title: 'Cookie sent unencrypted', desc: 'Cookie without secure flag.', titleKey: 'domains.check.cookie_sent_unencrypted.title', descKey: 'domains.check.cookie_sent_unencrypted.desc', severity: 'HIGH', category: 'frontend', domain: '' },
  { title: 'Cookie missing HttpOnly', desc: 'JavaScript can access the cookie.', titleKey: 'domains.check.cookie_missing_httponly.title', descKey: 'domains.check.cookie_missing_httponly.desc', severity: 'HIGH', category: 'frontend', domain: '' },
  { title: 'Missing anti-clickjacking header', desc: 'No X-Frame-Options or CSP frame-ancestors.', titleKey: 'domains.check.missing_anti_clickjacking_header.title', descKey: 'domains.check.missing_anti_clickjacking_header.desc', severity: 'MEDIUM', category: 'frontend', domain: '' },
  { title: 'X-Content-Type-Options missing', desc: 'MIME-type confusion possible.', titleKey: 'domains.check.x_content_type_options_missing.title', descKey: 'domains.check.x_content_type_options_missing.desc', severity: 'MEDIUM', category: 'frontend', domain: '' },
  { title: 'SPF not configured', desc: 'Email spoofing possible.', titleKey: 'domains.check.spf_not_configured.title', descKey: 'domains.check.spf_not_configured.desc', severity: 'MEDIUM', category: 'attack_surface', domain: '' },
  { title: 'DMARC not configured', desc: 'Phishing via your domain possible.', titleKey: 'domains.check.dmarc_not_configured.title', descKey: 'domains.check.dmarc_not_configured.desc', severity: 'MEDIUM', category: 'attack_surface', domain: '' },
  { title: 'Server leaks X-Powered-By', desc: 'Framework information exposed.', titleKey: 'domains.check.server_leaks_x_powered_by.title', descKey: 'domains.check.server_leaks_x_powered_by.desc', severity: 'MEDIUM', category: 'frontend', domain: '' },
  { title: 'Cookie poisoning possible', desc: 'URL params can set cookie values.', titleKey: 'domains.check.cookie_poisoning_possible.title', descKey: 'domains.check.cookie_poisoning_possible.desc', severity: 'MEDIUM', category: 'frontend', domain: '' },
  { title: 'Reverse tabnabbing possible', desc: 'Links without noopener noreferrer.', titleKey: 'domains.check.reverse_tabnabbing_possible.title', descKey: 'domains.check.reverse_tabnabbing_possible.desc', severity: 'MEDIUM', category: 'frontend', domain: '' },
  { title: 'Auth cookie accessible from subdomains', desc: 'Parent domain cookie scope too broad.', titleKey: 'domains.check.auth_cookie_accessible_from_subdomains.title', descKey: 'domains.check.auth_cookie_accessible_from_subdomains.desc', severity: 'MEDIUM', authenticated: true, category: 'frontend', domain: '' },
  { title: 'Source code exposed via .git', desc: 'Git repository files publicly accessible.', titleKey: 'domains.check.source_code_exposed_via_git.title', descKey: 'domains.check.source_code_exposed_via_git.desc', severity: 'MEDIUM', category: 'attack_surface', domain: '' },
  { title: 'GraphQL introspection enabled', desc: 'Full API schema exposed.', titleKey: 'domains.check.graphql_introspection_enabled.title', descKey: 'domains.check.graphql_introspection_enabled.desc', severity: 'MEDIUM', category: 'graphql', domain: '' },
  { title: 'Server leaks info via Server header', desc: 'Server software identity exposed.', titleKey: 'domains.check.server_leaks_info_via_server_header.title', descKey: 'domains.check.server_leaks_info_via_server_header.desc', severity: 'LOW', category: 'frontend', domain: '' },
  { title: 'DNSSEC not enabled', desc: 'DNS responses can be spoofed.', titleKey: 'domains.check.dnssec_not_enabled.title', descKey: 'domains.check.dnssec_not_enabled.desc', severity: 'LOW', category: 'attack_surface', domain: '' },
  { title: 'Subresource Integrity missing', desc: 'External scripts without integrity checks.', titleKey: 'domains.check.subresource_integrity_missing.title', descKey: 'domains.check.subresource_integrity_missing.desc', severity: 'LOW', category: 'frontend', domain: '' },
  { title: 'CSP allows inline CSS', desc: 'Inline CSS can aid social engineering.', titleKey: 'domains.check.csp_allows_inline_css.title', descKey: 'domains.check.csp_allows_inline_css.desc', severity: 'LOW', category: 'frontend', domain: '' },
]
