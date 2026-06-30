import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import {
  Box, Typography, Alert, Chip, Button, TextField, MenuItem, Divider, IconButton,
} from '@mui/material'
import { Download, Globe, Scale, Plus, Unlock } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import {
  downloadAuditExport, type AuditExportFormat,
  listDataResidency, setDataResidency,
  listLegalHolds, createLegalHold, releaseLegalHold,
} from '@lib/engine/system/compliance'

// ComplianceTab — governance/compliance admin: audit export, data residency,
// legal holds. Wires the system/compliance/* endpoints. Platform-admin gated.

const REGIONS = ['us', 'eu', 'apac', 'uk', 'ca', 'au']

export function ComplianceTab() {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const { org } = useOrg()
  const orgId = org?.id

  // ── audit export ──
  const [format, setFormat] = useState<AuditExportFormat>('json')
  const exportMut = useMutation({
    // @closure download-only: this reads a point-in-time artifact and
    // streams it to disk; no React Query cache should change.
    mutationFn: () => downloadAuditExport({ format, org: orgId }),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-export.${format}`
      a.click()
      URL.revokeObjectURL(url)
      enqueueSnackbar(t('sys.comp.exported'), { variant: 'success' })
    },
    onError: (e) => enqueueSnackbar(String(e as Error), { variant: 'error' }),
  })

  // ── data residency ──
  const [region, setRegion] = useState('eu')
  const residencyQ = useQuery({
    queryKey: qk.platform.dataResidency(orgId),
    queryFn: () => listDataResidency(orgId),
    staleTime: 30_000,
  })
  const residencyMut = useMutation({
    mutationFn: () => setDataResidency({ org_id: orgId!, region }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.platform.dataResidency(orgId) })
      enqueueSnackbar(t('sys.comp.residencySet'), { variant: 'success' })
    },
    onError: (e) => enqueueSnackbar(String(e as Error), { variant: 'error' }),
  })

  // ── legal holds ──
  const [holdReason, setHoldReason] = useState('')
  const holdsQ = useQuery({
    queryKey: qk.platform.legalHolds(orgId),
    queryFn: () => listLegalHolds(orgId),
    staleTime: 30_000,
  })
  const createHoldMut = useMutation({
    mutationFn: () => createLegalHold({ org_id: orgId!, reason: holdReason.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.platform.legalHolds(orgId) })
      setHoldReason('')
      enqueueSnackbar(t('sys.comp.holdCreated'), { variant: 'success' })
    },
    onError: (e) => enqueueSnackbar(String(e as Error), { variant: 'error' }),
  })
  const releaseHoldMut = useMutation({
    mutationFn: (id: string) => releaseLegalHold(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.platform.legalHolds(orgId) })
      enqueueSnackbar(t('sys.comp.holdReleased'), { variant: 'info' })
    },
    onError: (e) => enqueueSnackbar(String(e as Error), { variant: 'error' }),
  })

  const holds = holdsQ.data?.holds ?? []
  const residency = residencyQ.data?.configs ?? []

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2, fontSize: 13 }}>
        {t('sys.comp.intro')}
      </Alert>

      {/* Audit export */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Download size={16} style={{ color: '#a78bfa' }} />
        <Typography variant="subtitle2" fontWeight={700}>{t('sys.comp.auditExport')}</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 3 }}>
        <TextField select size="small" label={t('sys.comp.format')} value={format}
          onChange={e => setFormat(e.target.value as AuditExportFormat)} sx={{ minWidth: 140 }}>
          <MenuItem value="json">JSON</MenuItem>
          <MenuItem value="csv">CSV</MenuItem>
        </TextField>
        <Button size="small" variant="contained" startIcon={<Download size={14} />}
          disabled={exportMut.isPending}
          onClick={() => exportMut.mutate()}
          sx={{ textTransform: 'none', bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
          {exportMut.isPending ? t('common.working') : t('sys.comp.download')}
        </Button>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Data residency */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Globe size={16} style={{ color: '#a78bfa' }} />
        <Typography variant="subtitle2" fontWeight={700}>{t('sys.comp.dataResidency')}</Typography>
      </Box>
      {residency.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {t('sys.comp.current')}: {residency.map(r => `${r.org_id}=${r.region}`).join(', ')}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 3 }}>
        <TextField select size="small" label={t('sys.comp.region')} value={region}
          onChange={e => setRegion(e.target.value)} sx={{ minWidth: 140 }}>
          {REGIONS.map(r => <MenuItem key={r} value={r}>{r.toUpperCase()}</MenuItem>)}
        </TextField>
        <Button size="small" variant="outlined" disabled={!orgId || residencyMut.isPending}
          onClick={() => residencyMut.mutate()} sx={{ textTransform: 'none' }}>
          {t('sys.comp.setRegion')}
        </Button>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Legal holds */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Scale size={16} style={{ color: '#a78bfa' }} />
        <Typography variant="subtitle2" fontWeight={700}>{t('sys.comp.legalHolds')}</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2 }}>
        <TextField size="small" label={t('sys.comp.holdReason')} value={holdReason}
          onChange={e => setHoldReason(e.target.value)} sx={{ flex: 1 }} placeholder="litigation-2026-001" />
        <Button size="small" variant="contained" startIcon={<Plus size={14} />}
          disabled={!orgId || createHoldMut.isPending}
          onClick={() => createHoldMut.mutate()}
          sx={{ textTransform: 'none', bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
          {t('sys.comp.createHold')}
        </Button>
      </Box>

      {holdsQ.isLoading && <LoadingState variant="spinner" py={3} />}
      {holdsQ.isError && <QueryError error={holdsQ.error} onRetry={holdsQ.refetch} label={t('sys.comp.legalHolds')} compact />}
      {holds.length === 0 && !holdsQ.isLoading && (
        <Typography variant="caption" color="text.secondary">{t('sys.comp.noHolds')}</Typography>
      )}
      {holds.map(h => (
        <Box key={h.id} sx={{
          display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 1.5, alignItems: 'center',
          p: 1.5, mb: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1,
        }}>
          <Box>
            <Typography variant="body2">{h.scope} · {h.reason || 'no reason'}</Typography>
            <Typography variant="caption" color="text.secondary">org {h.org_id}</Typography>
          </Box>
          <Chip size="small" label={h.active ? 'active' : 'released'}
            sx={{ height: 20, fontSize: 12, fontWeight: 700,
              bgcolor: h.active ? 'rgba(245,158,11,0.18)' : 'rgba(148,163,184,0.18)',
              color: h.active ? '#f59e0b' : '#94a3b8' }} />
          <IconButton size="small" disabled={!h.active || releaseHoldMut.isPending}
            onClick={() => releaseHoldMut.mutate(h.id)} title={t('sys.comp.release')}>
            <Unlock size={14} color={h.active ? '#a78bfa' : '#64748b'} />
          </IconButton>
        </Box>
      ))}
    </Box>
  )
}
