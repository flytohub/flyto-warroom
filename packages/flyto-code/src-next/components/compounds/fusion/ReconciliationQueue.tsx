/**
 * ReconciliationQueue — engineer-mode cross-source reconciliation triage.
 *
 * The human-in-the-loop workflow for the fusion engine's disagreements: lists
 * open cross-source conflicts (DataTable), opens a per-item EvidenceDrawer with
 * the divergent values + contributing sources, and lets an operator
 * acknowledge / resolve / suppress an item. The PATCH is applied optimistically
 * (the row leaves the open queue immediately) with a success/error toast and a
 * rollback + refetch on failure.
 *
 * Also hosts the per-resource fused-posture drawer (clicking a row's resource
 * loads the resource's multi-source verdict via getResourcePosture).
 *
 * Direct-import client (decoupling). Loading / empty / error all handled.
 * Fully i18n via runtime translation reads on locale change through useLocale().
 */

import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import { GitMerge, ShieldCheck } from 'lucide-react'

import {
  DataTable,
  SeverityChip,
  EvidenceDrawer,
  type MRT_ColumnDef,
} from '@compounds/_shared'
import { EmptyStateGuide } from '@atoms/EmptyStateGuide'
import type { Severity } from '@lib/tokens/severity'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n';
import { useLocale } from '@hooks/useLocale'

import {
  listReconciliations,
  patchReconciliation,
  getResourcePosture,
  type ReconciliationFinding,
  type ListReconciliationsResponse,
  type ReconStatus,
} from '@lib/engine/fusion/fusion'

function sevToken(s: string): Severity {
  const k = (s || '').toLowerCase()
  if (k === 'critical' || k === 'high' || k === 'medium' || k === 'low') return k
  return ''
}

/** Best-effort parse of the engine's JSON-string divergent-values field. */
function parseValues(raw: string): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map((x) => String(x)) : [String(v)]
  } catch {
    return [raw]
  }
}

export function ReconciliationQueue() {
  const { orgId } = useParams<{ orgId: string }>()
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const locale = useLocale() // re-render and re-read translations on locale change

  const [selected, setSelected] = useState<ReconciliationFinding | null>(null)
  const [note, setNote] = useState('')

  const queryKey = useMemo(() => qk.fusion.reconciliationsOpen(orgId), [orgId])

  const q = useQuery({
    queryKey,
    queryFn: () => listReconciliations(orgId!, { status: 'open' }),
    enabled: !!orgId,
    staleTime: 30_000,
  })

  // Per-resource fused posture for the currently selected row's resource.
  const postureQ = useQuery({
    queryKey: qk.fusion.resourcePosture(orgId, selected?.resourceId),
    queryFn: () => getResourcePosture(orgId!, selected!.resourceId),
    enabled: !!orgId && !!selected?.resourceId,
    staleTime: 30_000,
  })

  const patchM = useMutation({
    mutationFn: (vars: { reconId: string; status: ReconStatus; note?: string }) =>
      patchReconciliation(orgId!, vars.reconId, {
        status: vars.status,
        note: vars.note,
      }),
    // Optimistic: drop the row from the open queue immediately.
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey })
      const prev = qc.getQueryData<ListReconciliationsResponse>(queryKey)
      qc.setQueryData<ListReconciliationsResponse>(queryKey, (old) =>
        old
          ? {
              ...old,
              reconciliations: (old.reconciliations ?? []).filter(
                (r) => r.id !== vars.reconId,
              ),
            }
          : old,
      )
      return { prev }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev)
      enqueueSnackbar(String((err as Error)?.message ?? err), { variant: 'error' })
    },
    onSuccess: (_res, vars) => {
      const msg =
        vars.status === 'resolved'
          ? t('fusion.reconciliation.toastResolved')
          : vars.status === 'suppressed'
            ? t('fusion.reconciliation.toastSuppressed')
            : t('fusion.reconciliation.toastAcknowledged')
      enqueueSnackbar(msg, { variant: 'success' })
      setSelected(null)
      setNote('')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey })
      qc.invalidateQueries({ queryKey: qk.fusion.unifiedPosture(orgId) })
    },
  })

  const rows = q.data?.reconciliations ?? []

  const columns = useMemo<MRT_ColumnDef<ReconciliationFinding>[]>(
    () => [
      {
        accessorKey: 'severity',
        header: t('fusion.reconciliation.colSeverity'),
        size: 110,
        Cell: ({ row }) => (
          <SeverityChip severity={sevToken(row.original.severity)} size="sm" />
        ),
      },
      { accessorKey: 'field', header: t('fusion.reconciliation.colField'), size: 160 },
      { accessorKey: 'resourceId', header: t('fusion.reconciliation.colResource'), size: 200 },
      {
        accessorKey: 'summary',
        header: t('fusion.reconciliation.colDisagreement'),
        size: 320,
      },
      {
        accessorKey: 'confidence',
        header: t('fusion.reconciliation.colConfidence'),
        size: 80,
        Cell: ({ row }) => `${row.original.confidence}%`,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale],
  )

  // ── Header (icon + title + subtitle + open-count badge) ──────────────────
  const header = (
    <Stack direction="row" spacing={1.25} alignItems="flex-start">
      <Box
        sx={{
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          width: 34,
          height: 34,
          borderRadius: 2,
          bgcolor: 'action.hover',
          color: 'text.secondary',
        }}
      >
        <GitMerge size={18} />
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
            {t('fusion.reconciliation.title')}
          </Typography>
          {rows.length > 0 && (
            <Box
              component="span"
              sx={{
                px: 0.875,
                py: 0.125,
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                lineHeight: 1.6,
                color: 'warning.main',
                bgcolor: (theme) => `${theme.palette.warning.main}22`,
                border: '1px solid',
                borderColor: (theme) => `${theme.palette.warning.main}55`,
              }}
            >
              {rows.length} {t('fusion.reconciliation.openBadge')}
            </Box>
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {t('fusion.reconciliation.subtitle')}
        </Typography>
      </Box>
    </Stack>
  )

  if (q.isError) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {header}
        <Typography variant="body2" color="error" sx={{ px: 0.5 }}>
          {t('fusion.reconciliation.loadError')}
        </Typography>
      </Box>
    )
  }

  const showEmpty = !q.isLoading && rows.length === 0
  const divergent = selected ? parseValues(selected.divergentValues) : []
  const acting = patchM.isPending

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {header}

      {showEmpty ? (
        <EmptyStateGuide
          py={5}
          icon={<ShieldCheck size={28} />}
          title={t('fusion.reconciliation.emptyTitle')}
          description={t('fusion.reconciliation.emptyDesc')}
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          isLoading={q.isLoading}
          onRowClick={(r) => {
            setSelected(r)
            setNote('')
          }}
          maxBodyHeight={420}
        />
      )}

      <EvidenceDrawer
        open={!!selected}
        onClose={() => !acting && setSelected(null)}
        title={
          selected
            ? `${t('fusion.reconciliation.drawerTitle')} · ${selected.field}`
            : ''
        }
        subtitle={selected?.resourceId}
        sections={
          selected
            ? [
                {
                  title: t('fusion.reconciliation.secSummary'),
                  content: (
                    <Stack spacing={1}>
                      <SeverityChip severity={sevToken(selected.severity)} />
                      <Typography variant="body2">{selected.summary}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t('fusion.reconciliation.confidence')}{' '}
                        {selected.confidence}% ·{' '}
                        {t('fusion.reconciliation.firstSeen')}{' '}
                        {new Date(selected.firstSeenAt).toLocaleString()}
                      </Typography>
                    </Stack>
                  ),
                },
                {
                  title: t('fusion.reconciliation.secDivergent'),
                  content:
                    divergent.length > 0 ? (
                      <Stack spacing={0.5}>
                        {divergent.map((v, i) => (
                          <Typography
                            key={i}
                            variant="body2"
                            sx={{ fontFamily: 'monospace' }}
                          >
                            {v}
                          </Typography>
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {t('fusion.reconciliation.noDistinct')}
                      </Typography>
                    ),
                },
                {
                  title: t('fusion.reconciliation.secPosture'),
                  content: postureQ.isLoading ? (
                    <Typography variant="body2" color="text.secondary">
                      {t('fusion.reconciliation.loadingVerdict')}
                    </Typography>
                  ) : postureQ.isError ? (
                    <Typography variant="body2" color="error">
                      {t('fusion.reconciliation.postureError')}
                    </Typography>
                  ) : postureQ.data ? (
                    <Stack spacing={0.5}>
                      <Typography variant="body2">
                        {t('fusion.reconciliation.confidence')}{' '}
                        {postureQ.data.envelope.confidenceScore}% (
                        {postureQ.data.envelope.confidence || 'n/a'}) ·{' '}
                        {t('fusion.reconciliation.coverage')}{' '}
                        {postureQ.data.envelope.coveragePercent}%
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t('fusion.reconciliation.independence')}{' '}
                        {postureQ.data.envelope.independencePercent}% ·{' '}
                        {t('fusion.reconciliation.dominant')}{' '}
                        {postureQ.data.envelope.dominantProvider || '—'} ·{' '}
                        {postureQ.data.envelope.openDisagreements}{' '}
                        {t('fusion.reconciliation.openBadge')}
                      </Typography>
                      {(postureQ.data.envelope.provenance ?? []).length > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          {t('fusion.reconciliation.sources')}{' '}
                          {(postureQ.data.envelope.provenance ?? []).join(', ')}
                        </Typography>
                      )}
                      {(postureQ.data.envelope.caveats ?? []).map((c, i) => (
                        <Typography key={i} variant="caption" color="warning.main">
                          {c}
                        </Typography>
                      ))}
                    </Stack>
                  ) : null,
                },
              ]
            : undefined
        }
        footer={
          selected ? (
            <Stack spacing={1.25}>
              <TextField
                size="small"
                label={t('fusion.reconciliation.resolutionNoteLabel')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                fullWidth
                multiline
                minRows={1}
                maxRows={3}
                disabled={acting}
              />
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={acting}
                  onClick={() =>
                    patchM.mutate({
                      reconId: selected.id,
                      status: 'acknowledged',
                      note: note || undefined,
                    })
                  }
                >
                  {t('fusion.reconciliation.actionAcknowledge')}
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  disabled={acting}
                  onClick={() =>
                    patchM.mutate({
                      reconId: selected.id,
                      status: 'resolved',
                      note: note || undefined,
                    })
                  }
                >
                  {t('fusion.reconciliation.actionResolve')}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  disabled={acting}
                  onClick={() =>
                    patchM.mutate({
                      reconId: selected.id,
                      status: 'suppressed',
                      note: note || undefined,
                    })
                  }
                >
                  {t('fusion.reconciliation.actionSuppress')}
                </Button>
              </Stack>
            </Stack>
          ) : undefined
        }
      />
    </Box>
  )
}
