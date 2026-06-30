import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import {
  Box, Typography, Button, Chip, Alert, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material'
import { ShieldCheck, Ban, AlertTriangle } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { GatedButton } from '@atoms/GatedButton'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { queryFailed, querySucceeded, queryUnresolved, resolvedList } from '@lib/queryState'
import {
  listScanApprovals, approveScan, denyScan, approvalTimeRemaining,
  type ScanApproval,
} from '@lib/engine'

// ScanApprovalsTab — SAFETY-CRITICAL. Active DAST refuses to
// scan without an approved row here. The UI MUST make this
// visible because no operator action = no DAST data.

export function ScanApprovalsTab() {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const { org } = useOrg()
  const orgId = org?.id
  const [denyTarget, setDenyTarget] = useState<ScanApproval | null>(null)
  const [denyReason, setDenyReason] = useState('')

  const q = useQuery({
    queryKey: qk.pentest.scanApprovals(orgId),
    queryFn: () => listScanApprovals(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })

  const approveMut = useMutation({
    mutationFn: (id: string) => approveScan(orgId!, id, { expires_in_hours: 168 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.pentest.scanApprovals(orgId) })
      enqueueSnackbar(t('approval.granted'), { variant: 'success' })
    },
    onError: (e) => enqueueSnackbar(String(e as Error), { variant: 'error' }),
  })

  const denyMut = useMutation({
    mutationFn: (vars: { id: string; reason: string }) => denyScan(orgId!, vars.id, vars.reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.pentest.scanApprovals(orgId) })
      enqueueSnackbar(t('approval.denied'), { variant: 'info' })
      setDenyTarget(null)
      setDenyReason('')
    },
  })

  const approvalsReady = querySucceeded(q, !!orgId)
  const approvalsLoading = queryUnresolved(q, !!orgId)
  const approvalsFailed = queryFailed(q, !!orgId)
  const items = resolvedList(q.data?.items, q, !!orgId)
  const requested = items.filter(a => a.status === 'requested')
  const approved = items.filter(a => a.status === 'approved')
  const other = items.filter(a => a.status !== 'requested' && a.status !== 'approved')

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      <Alert severity="info" sx={{ mb: 2, fontSize: 13 }}>
        <strong>{t('approval.gateTitle')}:</strong>{' '}
        {t('approval.gateBody')}
      </Alert>

      {approvalsLoading && (
        <LoadingState variant="spinner" py={4} />
      )}

      {approvalsFailed && (
        <Box sx={{ mb: 2 }}>
          <QueryError error={q.error} onRetry={q.refetch} label={t('approval.loadError')} compact />
        </Box>
      )}

      {approvalsReady && requested.length > 0 && (
        <Section title={tOr('approval.pendingTitle', `Pending (${requested.length})`)}
                 icon={<AlertTriangle size={16} color="#f97316" />}>
          {requested.map(a => (
            <ApprovalRow key={a.id} a={a}
              onApprove={() => approveMut.mutate(a.id)}
              onDeny={() => setDenyTarget(a)} />
          ))}
        </Section>
      )}

      {approvalsReady && (
        <Section title={tOr('approval.approvedTitle', `Approved (${approved.length})`)}
                 icon={<ShieldCheck size={16} color="#22c55e" />}>
          {approved.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', py: 1 }}>
              {t('approval.approvedEmpty')}
            </Typography>
          )}
          {approved.map(a => (
            <ApprovalRow key={a.id} a={a}
              onApprove={() => approveMut.mutate(a.id)}
              onDeny={() => setDenyTarget(a)} />
          ))}
        </Section>
      )}

      {approvalsReady && other.length > 0 && (
        <Section title={tOr('approval.historyTitle', `History (${other.length})`)}
                 icon={<Ban size={16} color="#94a3b8" />}>
          {other.map(a => (
            <ApprovalRow key={a.id} a={a}
              onApprove={() => approveMut.mutate(a.id)}
              onDeny={() => setDenyTarget(a)} />
          ))}
        </Section>
      )}

      <Dialog open={!!denyTarget} onClose={() => setDenyTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('approval.denyDialogTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('approval.denyDialogDesc')}
          </Typography>
          <TextField fullWidth multiline minRows={2} value={denyReason}
            onChange={e => setDenyReason(e.target.value)}
            label={t('approval.denyReason')} autoFocus />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDenyTarget(null)}>{t('common.cancel')}</Button>
          <Button variant="contained" color="error"
            disabled={!denyReason.trim() || denyMut.isPending}
            onClick={() => denyTarget && denyMut.mutate({ id: denyTarget.id, reason: denyReason })}>
            {t('approval.confirmDeny')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        {icon}
        <Typography variant="subtitle2" fontWeight={700}>{title}</Typography>
      </Box>
      {children}
    </Box>
  )
}

function ApprovalRow({ a, onApprove, onDeny }: {
  a: ScanApproval; onApprove: () => void; onDeny: () => void
}) {
  const isApproved = a.status === 'approved'
  const timeLeft = approvalTimeRemaining(a)
  return (
    <Box sx={{
      display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 1.5, alignItems: 'center',
      p: 1.5, mb: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1,
    }}>
      <Box>
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{a.asset_id}</Typography>
        <Typography variant="caption" color="text.secondary">
          {a.scan_type} · {a.asset_kind}
          {a.notes && ` · ${a.notes}`}
        </Typography>
      </Box>
      <Chip size="small" label={a.status}
        sx={{
          height: 20, fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
          bgcolor:
            a.status === 'approved' ? 'rgba(34,197,94,0.18)' :
            a.status === 'requested' ? 'rgba(249,115,22,0.18)' :
            a.status === 'denied' ? 'rgba(239,68,68,0.18)' :
            'rgba(148,163,184,0.18)',
          color:
            a.status === 'approved' ? '#22c55e' :
            a.status === 'requested' ? '#f97316' :
            a.status === 'denied' ? '#ef4444' :
            '#94a3b8',
        }}
      />
      {isApproved && timeLeft && (
        <Typography variant="caption" color="text.secondary">{timeLeft}</Typography>
      )}
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {a.status !== 'approved' && (
          <GatedButton action="pentest:approve_scan" size="small" variant="outlined" color="success" onClick={onApprove}
            sx={{ textTransform: 'none', fontSize: 13 }}>
            {t('approval.approve')}
          </GatedButton>
        )}
        {a.status !== 'denied' && (
          <GatedButton action="pentest:approve_scan" size="small" variant="text" color="error" onClick={onDeny}
            sx={{ textTransform: 'none', fontSize: 13 }}>
            {t('approval.deny')}
          </GatedButton>
        )}
      </Box>
    </Box>
  )
}
