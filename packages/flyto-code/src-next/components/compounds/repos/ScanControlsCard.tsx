/**
 * ScanControlsCard — engineer-mode per-repo scan execution.
 *
 * Coverage for the scan lifecycle endpoints:
 *   GET  /repos/{id}/scans            → listRepoScans (queue/history)
 *   POST /repos/{id}/scans            → triggerScan (run / re-queue)
 *   POST /scans/{id}/cancel           → cancelScan
 *   GET  /scans/{id}/results          → listScanResults (per-category)
 *   (local) scan-upload via ScanUploadDropzone
 *
 * Optimistic-ish UX: actions toast via notistack and invalidate the
 * scan-history query so the row reflects new state on the next SSE
 * tick / refetch. Self-contained — additive to the existing engineer
 * RepoDetailView, regresses nothing.
 */

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import { Play, Square, Upload, RefreshCw, Loader2, ChevronRight, Container } from 'lucide-react'

import {
  triggerScan,
  cancelScan,
  listRepoScans,
  type CodeScan,
  type ConnectedRepo,
} from '@lib/engine/code/repos'
import { triggerContainerScan } from '@lib/engine/code/containerScan'
import {
  listScanResults,
  type CodeScanResult,
} from '@lib/engine/code/scanResults'
import { SeverityChip, EvidenceDrawer } from '@compounds/_shared'
import { t, tOr } from '@lib/i18n';
import { type Severity } from '@lib/tokens/severity'
import { qk } from '@lib/queryKeys'
import { ScanUploadDropzone } from '@compounds/_shared/ScanUploadDropzone'

function toSeverity(raw: string): Severity {
  const s = (raw || '').toLowerCase()
  if (s === 'critical' || s === 'high' || s === 'medium' || s === 'low') return s
  if (s === 'moderate') return 'medium'
  return ''
}

const STATUS_TONE: Record<string, 'default' | 'info' | 'success' | 'error' | 'warning'> = {
  queued: 'info',
  running: 'info',
  complete: 'success',
  failed: 'error',
  cancelled: 'warning',
  stalled: 'warning',
}

function ScanResultsDrawer({
  scan,
  open,
  onClose,
}: {
  scan: CodeScan | null
  open: boolean
  onClose: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: qk.repos.scanResults(scan?.id),
    queryFn: () => listScanResults(scan!.id),
    enabled: !!scan?.id && open,
    staleTime: 30_000,
    retry: false,
  })

  const grouped = useMemo(() => {
    const rows = data?.results ?? []
    const byCat: Record<string, CodeScanResult[]> = {}
    for (const r of rows) (byCat[r.category] ??= []).push(r)
    return byCat
  }, [data])

  const sections = Object.entries(grouped).map(([category, rows]) => ({
    title: `${category} (${rows.length})`,
    content: (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {rows.map((r) => (
          <Box
            key={r.id}
            sx={{
              display: 'flex', alignItems: 'flex-start', gap: 1,
              p: 1, borderRadius: 1, bgcolor: 'action.hover',
            }}
          >
            <SeverityChip severity={toSeverity(r.severity)} size="sm" />
            <Typography variant="body2" sx={{ flex: 1 }}>
              {r.summary || '—'}
            </Typography>
            {typeof r.score === 'number' && (
              <Typography variant="caption" color="text.secondary">
                {Math.round(r.score)}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    ),
  }))

  return (
    <EvidenceDrawer
      open={open}
      onClose={onClose}
      title={t('pentest.scanResults')}
      subtitle={scan ? `${scan.status} · ${new Date(scan.createdAt).toLocaleString()}` : undefined}
      sections={sections}
      width={520}
    >
      {isLoading && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <Loader2 size={20} className="animate-spin" />
        </Box>
      )}
      {!isLoading && sections.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          {t('repos.noPerCategoryScanResults')}
        </Typography>
      )}
    </EvidenceDrawer>
  )
}

export function ScanControlsCard({
  repoId,
  repo,
}: {
  repoId: string
  repo: ConnectedRepo | null
}) {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [drawerScan, setDrawerScan] = useState<CodeScan | null>(null)
  const [containerOpen, setContainerOpen] = useState(false)
  const [imageRef, setImageRef] = useState('')
  const isLocal = repo?.scanMode === 'local'
  const orgId = repo?.orgId

  const scansQ = useQuery({
    queryKey: qk.repos.scans(repoId),
    queryFn: () => listRepoScans(repoId, 8),
    staleTime: 2000,
    enabled: !isLocal,
    refetchOnMount: 'always',
  })
  const scans = scansQ.data?.scans ?? []
  const active = scans.find((s) => s.status === 'queued' || s.status === 'running')

  const runMut = useMutation({
    mutationFn: () => triggerScan(repoId),
    onSuccess: () => {
      enqueueSnackbar(t('repos.toast.scanQueued'), { variant: 'success' })
      qc.invalidateQueries({ queryKey: qk.repos.scans(repoId) })
      qc.invalidateQueries({ queryKey: qk.repos.profile(repoId) })
    },
    onError: () => enqueueSnackbar(t('repos.toast.scanStartFailed'), { variant: 'error' }),
  })

  const cancelMut = useMutation({
    mutationFn: (scanId: string) => cancelScan(scanId),
    onSuccess: () => {
      enqueueSnackbar(t('repos.toast.scanCancelled'), { variant: 'info' })
      qc.invalidateQueries({ queryKey: qk.repos.scans(repoId) })
    },
    onError: () => enqueueSnackbar(t('repos.toast.scanCancelFailed'), { variant: 'error' }),
  })

  const containerMut = useMutation({
    mutationFn: (ref: string) => triggerContainerScan(repoId, ref),
    onSuccess: () => {
      enqueueSnackbar(t('repos.toast.containerScanQueued'), { variant: 'success' })
      setContainerOpen(false)
      setImageRef('')
      if (orgId) {
        qc.invalidateQueries({ queryKey: qk.container.findings(orgId) })
        qc.invalidateQueries({ queryKey: qk.container.runs(orgId) })
        qc.invalidateQueries({ queryKey: qk.container.posture(orgId) })
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error && err.message ? err.message : t('repos.toast.containerScanQueueFailed')
      enqueueSnackbar(msg, { variant: 'error' })
    },
  })

  const trimmedRef = imageRef.trim()

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t('repos.scanControls')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {isLocal ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<Upload size={14} />}
              onClick={() => setUploadOpen(true)}
            >
              {t('repos.uploadScan')}
            </Button>
          ) : (
            <>
              <Button
                size="small"
                variant="contained"
                color="secondary"
                disabled={runMut.isPending || !!active}
                startIcon={runMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                onClick={() => runMut.mutate()}
              >
                {active ? t('repos.scanning') : t('repos.runScan')}
              </Button>
              {active && (
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  disabled={cancelMut.isPending}
                  startIcon={<Square size={14} />}
                  onClick={() => cancelMut.mutate(active.id)}
                >
                  {t('common.cancel')}
                </Button>
              )}
              <Button
                size="small"
                variant="outlined"
                startIcon={<Container size={14} />}
                disabled={containerMut.isPending}
                onClick={() => setContainerOpen(true)}
              >
                {t('repos.containerScan')}
              </Button>
              <Button
                size="small"
                variant="text"
                startIcon={<RefreshCw size={14} />}
                onClick={() => qc.invalidateQueries({ queryKey: qk.repos.scans(repoId) })}
              >
                {t('common.refresh')}
              </Button>
            </>
          )}
        </Box>
      </Box>

      {/* Scan queue / history */}
      {!isLocal && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {scans.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              {t('repos.noScansYet')}
            </Typography>
          )}
          {scans.map((s) => (
            <Box
              key={s.id}
              role={s.status === 'complete' ? 'button' : undefined}
              tabIndex={s.status === 'complete' ? 0 : undefined}
              onClick={() => s.status === 'complete' && setDrawerScan(s)}
              onKeyDown={(e) => {
                if (s.status === 'complete' && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  setDrawerScan(s)
                }
              }}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                px: 1, py: 0.75, borderRadius: 1,
                cursor: s.status === 'complete' ? 'pointer' : 'default',
                '&:hover': { bgcolor: s.status === 'complete' ? 'action.hover' : 'transparent' },
              }}
            >
              <Chip
                size="small"
                label={tOr(`repos.scanStatus.${s.status}`, s.status)}
                color={STATUS_TONE[s.status] ?? 'default'}
                sx={{ height: 20, fontSize: 12, fontWeight: 700, textTransform: 'capitalize' }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                {s.triggerType} · {new Date(s.createdAt).toLocaleString()}
              </Typography>
              {s.status === 'complete' && <ChevronRight size={14} style={{ opacity: 0.5 }} />}
            </Box>
          ))}
        </Box>
      )}

      <ScanResultsDrawer scan={drawerScan} open={!!drawerScan} onClose={() => setDrawerScan(null)} />

      {/* Container image scan trigger */}
      <Dialog open={containerOpen} onClose={() => setContainerOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('repos.scanContainerImageTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('repos.scanImageDesc')}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label={t('repos.imageReferenceLabel')}
            placeholder="ghcr.io/acme/api:1.4.2"
            value={imageRef}
            onChange={(e) => setImageRef(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && trimmedRef && !containerMut.isPending) {
                containerMut.mutate(trimmedRef)
              }
            }}
            disabled={containerMut.isPending}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContainerOpen(false)} disabled={containerMut.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            color="secondary"
            disabled={!trimmedRef || containerMut.isPending}
            startIcon={containerMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Container size={14} />}
            onClick={() => containerMut.mutate(trimmedRef)}
          >
            {containerMut.isPending ? t('repos.queuing') : t('repos.queueScan')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Local upload dialog */}
      <Dialog open={uploadOpen} onClose={() => setUploadOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('repo.uploadScanTitle')}</DialogTitle>
        <DialogContent>
          <ScanUploadDropzone repoId={repoId} compact onSuccess={() => {
            setUploadOpen(false)
            qc.invalidateQueries({ queryKey: qk.repos.profile(repoId) })
            qc.invalidateQueries({ queryKey: qk.repos.scans(repoId) })
          }} />
        </DialogContent>
      </Dialog>
    </Paper>
  )
}
