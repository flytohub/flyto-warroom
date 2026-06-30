import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import { ChevronRight, Globe, Target, Radar, Plus } from 'lucide-react'
import { t } from '@lib/i18n';
import type { PentestProject } from '@lib/engine'
import type { PentestCandidate } from '@compounds/_shared/targetCandidates'

export function DomainPicker({
  opened, projects, candidates = [], openIds, onPick, onPickCandidate, promotingKey = null, onClose,
}: {
  opened: boolean
  projects: PentestProject[]
  /** Footprint-discovered hosts not yet promoted to projects. */
  candidates?: PentestCandidate[]
  openIds: Set<string>
  onPick: (p: PentestProject) => void
  /** Promote a candidate → project → launch. */
  onPickCandidate?: (c: PentestCandidate) => void
  /** `key` of the candidate currently being promoted (spinner). */
  promotingKey?: string | null
  onClose: () => void
}) {
  const nothing = projects.length === 0 && candidates.length === 0
  return (
    <Dialog open={opened} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Target size={14} /> {t('warroom.redTeamPickTitle')}
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ py: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {nothing && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 6, color: 'text.secondary' }}>
              <Globe size={32} />
              <Typography variant="body2">
                {t('warroom.redTeamNoDomains')}
              </Typography>
            </Box>
          )}

          {/* ── Existing pentest projects ── */}
          {projects.length > 0 && (
            <Box>
              <SectionLabel icon={<Target size={12} />} text={t('warroom.redTeamProjects')} count={projects.length} />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {projects.map(p => {
                  const isOpen = openIds.has(p.id)
                  return (
                    <Box
                      key={p.id}
                      component="button"
                      onClick={() => onPick(p)}
                      sx={rowSx(isOpen)}
                    >
                      <Box sx={{
                        width: 3, height: 28, borderRadius: 1, flexShrink: 0,
                        background: isOpen ? 'linear-gradient(180deg, #ef4444, #dc2626)' : '#334155',
                      }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary', fontFamily: 'monospace' }}>
                          {p.target_url}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25, flexWrap: 'wrap' }}>
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{p.environment}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>·</Typography>
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{p.project_type}</Typography>
                          {p.last_scan_at && (
                            <>
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>·</Typography>
                              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                {t('warroom.redTeamLastScan')} {new Date(p.last_scan_at).toLocaleDateString()}
                              </Typography>
                            </>
                          )}
                        </Box>
                      </Box>
                      {isOpen
                        ? <Chip label={t('warroom.redTeamOpen')} size="small" sx={{ height: 20, fontSize: 12, bgcolor: 'rgba(239,68,68,0.15)', color: '#ef4444' }} />
                        : <ChevronRight size={14} color="#64748b" />}
                    </Box>
                  )
                })}
              </Box>
            </Box>
          )}

          {/* ── Footprint candidates (promote-on-pick) — the same hosts
                the Pentest workspace surfaces, so nothing is invisible here. ── */}
          {candidates.length > 0 && (
            <Box>
              <SectionLabel
                icon={<Radar size={12} />}
                text={t('warroom.redTeamCandidates')}
                count={candidates.length}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.75 }}>
                {t('warroom.redTeamCandidatesHint')}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {candidates.map(c => {
                  const busy = promotingKey === c.key
                  return (
                    <Box
                      key={c.key}
                      component="button"
                      disabled={busy || !onPickCandidate}
                      onClick={() => onPickCandidate?.(c)}
                      sx={rowSx(false)}
                    >
                      <Box sx={{ width: 3, height: 28, borderRadius: 1, flexShrink: 0, background: 'linear-gradient(180deg, #38bdf8, #6366f1)' }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary', fontFamily: 'monospace' }}>
                          {c.value}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25, flexWrap: 'wrap' }}>
                          <Chip label={c.source} size="small" variant="outlined" sx={{ height: 18, fontSize: 12 }} />
                          <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>{c.reason}</Typography>
                        </Box>
                      </Box>
                      {busy
                        ? <CircularProgress size={14} />
                        : <Plus size={14} color="#38bdf8" />}
                    </Box>
                  )
                })}
              </Box>
            </Box>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  )
}

function SectionLabel({ icon, text, count }: { icon: React.ReactNode; text: string; count: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75, color: 'text.secondary' }}>
      {icon}
      <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {text}
      </Typography>
      <Chip label={count} size="small" sx={{ height: 18, fontSize: 12, fontWeight: 700 }} />
    </Box>
  )
}

const rowSx = (isOpen: boolean) => ({
  display: 'flex', alignItems: 'center', gap: 1.5, width: '100%',
  px: 1.5, py: 1.25, border: '1px solid',
  borderColor: isOpen ? 'rgba(239,68,68,0.3)' : 'rgba(148, 163, 184, 0.25)',
  bgcolor: isOpen ? 'rgba(239,68,68,0.04)' : 'transparent',
  borderRadius: '8px', cursor: 'pointer', textAlign: 'left' as const,
  transition: 'all 0.15s',
  '&:hover': { bgcolor: 'action.hover', borderColor: 'divider' },
  '&:disabled': { opacity: 0.6, cursor: 'default' },
})
