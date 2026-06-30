/**
 * CandidatePathsPanel — engineer-mode table of ranked candidate attack
 * chains (GET /footprint/candidate-paths) with a per-row ownership gate
 * (Confirm / Reject → POST /footprint/entities/{id}/confirm|reject).
 *
 * Each path is a leaf→seed discovery chain (GitHub leak → subdomain →
 * wayback admin URL → TLS SAN → takeover?). Confirm mirrors the leaf
 * into /domains + CTEM; Reject suppresses it. Both are optimistic with
 * an undo-free toast linking to the resulting asset/issue.
 *
 * Client functions imported by DIRECT FILE PATH per decoupling rule.
 */
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import BlockIcon from '@mui/icons-material/Block'
import { CircularProgress } from '@mui/material'
import { FileText } from 'lucide-react'

import {
  DataTable,
  EvidenceDrawer,
  type MRT_ColumnDef,
} from '@compounds/_shared'
import { SEVERITY_TONE, type Severity } from '@lib/tokens/severity'

import {
  getCandidatePaths,
  confirmFootprintEntity,
  rejectFootprintEntity,
  researchFootprintSubjectSelector,
  type CandidatePath,
  type ResearchFootprintSelector,
} from '@lib/engine/code/footprintSurface'
import { ResearchFootprintDrawer } from './ResearchFootprintDrawer'
import { invalidateFootprintClosure } from '@lib/footprintLoop'
import { qk } from '@lib/queryKeys'
import { t, tOr } from '@lib/i18n';

interface Props {
  orgId: string
}

// Score → severity tone bucket (red-team actionability heuristic).
function scoreSeverity(score: number): Severity {
  if (score >= 75) return 'critical'
  if (score >= 50) return 'high'
  if (score >= 25) return 'medium'
  return 'low'
}

type ToastState = { open: boolean; severity: 'success' | 'error' | 'info'; msg: string }

export function CandidatePathsPanel({ orgId }: Props) {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: qk.footprint.candidatePaths(orgId, 50),
    queryFn: () => getCandidatePaths(orgId, 50),
    enabled: !!orgId,
    staleTime: 30_000,
  })

  // Optimistic local overlay — leaf entityId → 'owned' | 'rejected'.
  const [decided, setDecided] = useState<Record<string, 'owned' | 'rejected'>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [drawerPath, setDrawerPath] = useState<CandidatePath | null>(null)
  const [researchSelector, setResearchSelector] = useState<ResearchFootprintSelector | null>(null)
  const [toast, setToast] = useState<ToastState>({ open: false, severity: 'info', msg: '' })

  const rows = useMemo(() => q.data?.paths ?? [], [q.data])

  async function decide(path: CandidatePath, action: 'confirm' | 'reject') {
    const id = path.leafEntityId
    setBusy((b) => ({ ...b, [id]: true }))
    // Optimistic.
    setDecided((d) => ({ ...d, [id]: action === 'confirm' ? 'owned' : 'rejected' }))
    try {
      if (action === 'confirm') {
        const res = await confirmFootprintEntity(orgId, id)
        setToast({
          open: true,
          severity: 'success',
          msg: res.mirrored
            ? tOr(
                'footprint.attackChains.toastConfirmedMirrored',
                `Marked “${path.value}” as an owned asset — mirrored into Domains + CTEM.`,
              )
            : tOr('footprint.attackChains.toastConfirmed', `Marked “${path.value}” as owned.`),
        })
      } else {
        await rejectFootprintEntity(orgId, id)
        setToast({
          open: true,
          severity: 'info',
          msg: tOr('footprint.attackChains.toastRejected', `Rejected “${path.value}” — suppressed from discovery.`),
        })
      }
      invalidateFootprintClosure(qc, orgId)
    } catch (e) {
      // Roll back optimistic state on failure.
      setDecided((d) => {
        const next = { ...d }
        delete next[id]
        return next
      })
      setToast({ open: true, severity: 'error', msg: tOr('footprint.attackChains.toastFailed', `Action failed: ${(e as Error).message}`) })
    } finally {
      setBusy((b) => ({ ...b, [id]: false }))
    }
  }

  const columns = useMemo<MRT_ColumnDef<CandidatePath>[]>(
    () => [
      {
        accessorKey: 'value',
        header: t('footprint.attackChains.colLeaf'),
        size: 240,
        Cell: ({ row }) => (
          <Stack spacing={0.25}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {row.original.value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {row.original.type}
            </Typography>
          </Stack>
        ),
      },
      {
        accessorKey: 'score',
        header: t('footprint.attackChains.colScore'),
        size: 90,
        Cell: ({ row }) => {
          const s = scoreSeverity(row.original.score)
          const t = SEVERITY_TONE[s]
          return (
            <Chip
              size="small"
              label={row.original.score}
              sx={{ bgcolor: t.soft, color: t.tone, border: `1px solid ${t.ring}`, fontWeight: 700 }}
            />
          )
        },
      },
      { accessorKey: 'hops', header: t('footprint.attackChains.colHops'), size: 70 },
      { accessorKey: 'distinctSources', header: t('footprint.attackChains.colSources'), size: 80 },
      {
        id: 'chain',
        header: t('footprint.attackChains.colChain'),
        size: 280,
        Cell: ({ row }) => (
          <Typography variant="caption" color="text.secondary" noWrap title={row.original.chain.map((c) => c.value).join(' → ')}>
            {row.original.chain.map((c) => c.value).join(' → ')}
          </Typography>
        ),
      },
      {
        id: 'gate',
        header: t('footprint.attackChains.colOwnership'),
        size: 200,
        enableSorting: false,
        Cell: ({ row }) => {
          const id = row.original.leafEntityId
          const state = decided[id]
          const isBusy = busy[id]
          if (state === 'owned') return <Chip size="small" color="success" label={t('footprint.attackChains.chipOwned')} />
          if (state === 'rejected') return <Chip size="small" label={t('footprint.tier.rejected')} />
          return (
            <Stack direction="row" spacing={0.5}>
              <Tooltip title={t('footprint.attackChains.tipConfirm')}>
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    color="success"
                    disabled={isBusy}
                    startIcon={isBusy ? <CircularProgress size={12} /> : <CheckCircleOutlineIcon fontSize="small" />}
                    onClick={(e) => {
                      e.stopPropagation()
                      void decide(row.original, 'confirm')
                    }}
                  >
                    {t('footprint.attackChains.btnConfirm')}
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title={t('footprint.attackChains.tipReject')}>
                <span>
                  <Button
                    size="small"
                    variant="text"
                    color="inherit"
                    disabled={isBusy}
                    startIcon={<BlockIcon fontSize="small" />}
                    onClick={(e) => {
                      e.stopPropagation()
                      void decide(row.original, 'reject')
                    }}
                  >
                    {t('footprint.attackChains.btnReject')}
                  </Button>
                </span>
              </Tooltip>
            </Stack>
          )
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [decided, busy],
  )

  return (
    <Box>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t('footprint.attackChains.title')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('footprint.attackChains.subtitle')}
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        {t('footprint.attackChains.lede')}
      </Typography>
      <DataTable
        columns={columns}
        data={rows}
        isLoading={q.isLoading}
        maxBodyHeight={420}
        emptyText={t('footprint.attackChains.empty')}
        onRowClick={(row) => setDrawerPath(row)}
      />

      <EvidenceDrawer
        open={!!drawerPath}
        onClose={() => setDrawerPath(null)}
        title={drawerPath?.value ?? ''}
        subtitle={drawerPath ? `${drawerPath.type} · score ${drawerPath.score} · ${drawerPath.hops} hops` : undefined}
        sections={
          drawerPath
            ? [
                {
                  title: t('footprint.attackChains.secDiscoveryChain'),
                  content: (
                    <Stack spacing={1}>
                      {drawerPath.chain.map((node, i) => (
                        <Box
                          key={node.entityId || i}
                          sx={{ pl: i * 1.5, borderLeft: i ? '2px solid' : 'none', borderColor: 'divider' }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {node.value}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {node.type} · {node.source || t('footprint.attackChains.unknownSource')}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  ),
                },
                {
                  title: t('footprint.attackChains.secSignals'),
                  content: (
                    <Stack spacing={0.5}>
                      <Typography variant="body2">{t('footprint.attackChains.sigDistinctSources')}: {drawerPath.distinctSources}</Typography>
                      <Typography variant="body2">{t('footprint.attackChains.sigWeakestLink')}: {drawerPath.weakestLinkId || '—'}</Typography>
                      <Typography variant="body2">{t('footprint.attackChains.sigOldestEvidence')}: {drawerPath.oldestLastSeen || '—'}</Typography>
                    </Stack>
                  ),
                },
              ]
            : undefined
        }
        footer={
          drawerPath ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                variant="outlined"
                startIcon={<FileText size={16} />}
                onClick={() => setResearchSelector(researchFootprintSubjectSelector(drawerPath.type, drawerPath.value))}
              >
                Research Footprint
              </Button>
              {!decided[drawerPath.leafEntityId] && (
                <>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<CheckCircleOutlineIcon />}
                    disabled={busy[drawerPath.leafEntityId]}
                    onClick={() => void decide(drawerPath, 'confirm')}
                  >
                    {t('footprint.attackChains.btnConfirmOwnership')}
                  </Button>
                  <Button
                    variant="outlined"
                    color="inherit"
                    startIcon={<BlockIcon />}
                    disabled={busy[drawerPath.leafEntityId]}
                    onClick={() => void decide(drawerPath, 'reject')}
                  >
                    {t('footprint.attackChains.btnReject')}
                  </Button>
                </>
              )}
            </Stack>
          ) : undefined
        }
      />

      <ResearchFootprintDrawer
        orgId={orgId}
        open={!!researchSelector}
        selector={researchSelector}
        onClose={() => setResearchSelector(null)}
      />

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
    </Box>
  )
}
