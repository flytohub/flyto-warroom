/**
 * IdentityPostureView — the real Identity Security surface, backed by
 * GET /identity/posture (flyto-engine PR #184). It rolls up the kernel's
 * identity.* claims (ingested from a BYO IdP like Okta) into MFA coverage,
 * account status, and an at-risk list. When no IdP is wired
 * (configured=false) it falls back to the connect-your-IdP placeholder, so
 * the page is never a dead end.
 */
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import { Fingerprint, Plug, ShieldCheck, ShieldAlert } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { getIdentityPosture } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n';
import { SurfacePlaceholder } from './SurfacePlaceholder'

const BRAND = '#7c3aed'

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5, flex: 1, minWidth: 150 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{label}</Typography>
      <Typography variant="h5" fontWeight={800} sx={{ color: tone ?? 'text.primary' }}>{value}</Typography>
    </Paper>
  )
}

export function IdentityPostureView() {
  const navigate = useNavigate()
  const { orgId } = useParams<{ orgId: string }>()
  const { org } = useOrg()
  const { data, isLoading } = useQuery({
    queryKey: qk.identity.posture(org?.id),
    queryFn: () => getIdentityPosture(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress size={26} /></Box>
  }

  if (!data?.configured) {
    return (
      <SurfacePlaceholder
        Icon={Fingerprint}
        title={t('identity.title')}
        description={t('identity.placeholderDesc')}
        note={t('identity.notConnectedNote')}
        badge={t('identity.notConnected')}
        cta={orgId ? {
          label: t('identity.connectIdp'),
          icon: Plug,
          onClick: () => navigate(`/projects/${orgId}/settings`),
        } : undefined}
      />
    )
  }

  const coverPct = Math.round((data.mfaCoverage ?? 0) * 100)
  const coverTone = coverPct >= 90 ? '#16a34a' : coverPct >= 60 ? '#f59e0b' : '#ef4444'

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5, height: '100%', overflowY: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Fingerprint size={22} style={{ color: BRAND }} />
        <Typography variant="h5" fontWeight={800}>{t('identity.title')}</Typography>
        {data.sources.length > 0 && (
          <Chip size="small" label={data.sources.join(', ')} sx={{ height: 22, fontSize: 12, bgcolor: `${BRAND}14`, color: BRAND, fontWeight: 700 }} />
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Tile label={t('identity.totalIdentities')} value={String(data.totalIdentities)} />
        <Tile label={t('identity.mfaCoverage')} value={`${coverPct}%`} tone={coverTone} />
        <Tile label={t('identity.mfaMissing')} value={String(data.mfaMissing)} tone={data.mfaMissing > 0 ? '#ef4444' : undefined} />
        <Tile label={t('identity.atRisk')} value={String(data.atRisk.length)} tone={data.atRisk.length > 0 ? '#f59e0b' : '#16a34a'} />
      </Box>

      {Object.keys(data.statusCounts).length > 0 && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t('identity.statusBreakdown')}
          </Typography>
          {Object.entries(data.statusCounts).map(([s, n]) => (
            <Chip key={s} size="small" label={`${s}: ${n}`} sx={{ height: 22, fontSize: 12 }} />
          ))}
        </Box>
      )}

      <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
        <Box sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
          {data.atRisk.length > 0 ? <ShieldAlert size={16} style={{ color: '#f59e0b' }} /> : <ShieldCheck size={16} style={{ color: '#16a34a' }} />}
          <Typography variant="subtitle2" fontWeight={700}>{t('identity.atRiskAccounts')}</Typography>
        </Box>
        {data.atRisk.length === 0 ? (
          <Box sx={{ px: 2.5, py: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">{t('identity.allHealthy')}</Typography>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('identity.colIdentity')}</TableCell>
                <TableCell>{t('identity.colMfa')}</TableCell>
                <TableCell>{t('identity.colStatus')}</TableCell>
                <TableCell>{t('identity.colReason')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.atRisk.map((row) => (
                <TableRow key={row.resourceId}>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{row.resourceId}</TableCell>
                  <TableCell>
                    <Chip size="small" label={row.mfaEnrolled ? t('identity.yes') : t('identity.no')}
                      sx={{ height: 20, fontSize: 12, bgcolor: row.mfaEnrolled ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.12)', color: row.mfaEnrolled ? '#16a34a' : '#ef4444' }} />
                  </TableCell>
                  <TableCell>{row.status || '—'}</TableCell>
                  <TableCell sx={{ color: 'text.secondary', fontSize: 13 }}>{row.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Box>
  )
}
