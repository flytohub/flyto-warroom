import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import {
  Activity, ChevronRight, Eye, FileCode, Globe, Loader2, ShieldAlert,
} from 'lucide-react'
import { t } from '@lib/i18n';
import { type SeedPlaybook } from '@lib/cloud/playbooks'
import { type WorkflowDryRunPlan } from '@lib/cloud/workflows'
import { SEVERITY_COLOR } from './shared'

export type PreviewState =
  | null
  | { phase: 'picking' }
  | { phase: 'loading'; playbook: SeedPlaybook }
  | { phase: 'plan'; playbook: SeedPlaybook; plan: WorkflowDryRunPlan }
  | { phase: 'error'; playbook: SeedPlaybook; error: string }

export function PreviewModal({
  state, playbooks, onPick, onBack, onClose,
}: {
  state: PreviewState
  playbooks: SeedPlaybook[]
  onPick: (p: SeedPlaybook) => void
  onBack: () => void
  onClose: () => void
}) {
  const opened = state !== null
  return (
    <Dialog
      open={opened}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Eye size={14} />
          {state?.phase === 'picking'
            ? t('warroom.redTeamPreviewPick')
            : t('warroom.redTeamPreviewTitle')}
        </Box>
      </DialogTitle>
      <DialogContent>
        {!state ? null : state.phase === 'picking' ? (
          <PreviewPicker playbooks={playbooks} onPick={onPick} />
        ) : state.phase === 'loading' ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 6, color: 'text.secondary' }}>
            <Loader2 size={24} className="animate-spin" />
            <Typography variant="body2">
              {t('warroom.redTeamPreviewLoading')}
              {' '} — <b>{state.playbook.name}</b>
            </Typography>
          </Box>
        ) : state.phase === 'error' ? (
          <>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 6, color: '#ef4444' }}>
              <ShieldAlert size={24} />
              <Typography variant="body2"><b>{state.playbook.name}</b> — {state.error}</Typography>
            </Box>
            <BackToPicker onBack={onBack} />
          </>
        ) : (
          <>
            <PlanView plan={state.plan} playbook={state.playbook} />
            <BackToPicker onBack={onBack} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PreviewPicker({
  playbooks, onPick,
}: { playbooks: SeedPlaybook[]; onPick: (p: SeedPlaybook) => void }) {
  if (playbooks.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 6, color: 'text.secondary' }}>
        <FileCode size={32} />
        <Typography variant="body2">
          {t('warroom.redTeamPreviewEmpty')}
        </Typography>
      </Box>
    )
  }
  return (
    <Box sx={{ py: 1 }}>
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
        {t('warroom.redTeamPreviewPickNote')}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {playbooks.map(p => (
          <Box
            key={p.id}
            component="button"
            onClick={() => onPick(p)}
            title={p.description}
            sx={{
              display: 'flex', alignItems: 'center', gap: 1.5, width: '100%',
              px: 1.5, py: 1.25, border: '1px solid #1e293b',
              bgcolor: 'transparent', borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
              transition: 'all 0.15s',
              '&:hover': { bgcolor: 'action.hover', borderColor: 'divider' },
            }}
          >
            <Box sx={{
              width: 3, height: 28, borderRadius: 1, flexShrink: 0,
              bgcolor: SEVERITY_COLOR[p.severity] ?? '#64748b',
            }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary' }}>
                {p.name}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25, flexWrap: 'wrap' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{p.surface}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>·</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{p.kind}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>·</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{p.severity}</Typography>
                {p.owasp.length > 0 && (
                  <>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>·</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{p.owasp.join(', ')}</Typography>
                  </>
                )}
              </Box>
            </Box>
            <ChevronRight size={14} color="#64748b" />
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function PlanView({ plan, playbook }: { plan: WorkflowDryRunPlan; playbook: SeedPlaybook }) {
  return (
    <Box sx={{ py: 1 }}>
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1.5 }}>
        <b>{playbook.name}</b>{' — '}
        {t('warroom.redTeamPreviewNote')}
      </Typography>

      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: '8px', borderColor: 'rgba(148, 163, 184, 0.25)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Globe size={12} color="#94a3b8" />
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('warroom.redTeamPreviewTargets')}
          </Typography>
          <Chip label={plan.targets.length} size="small" sx={{ height: 16, fontSize: 12, bgcolor: 'rgba(148, 163, 184, 0.25)', color: '#94a3b8' }} />
        </Box>
        {plan.targets.length === 0 ? (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('warroom.redTeamNoUrls')}
          </Typography>
        ) : (
          <Box component="ul" sx={{ m: 0, pl: 2, listStyleType: 'disc' }}>
            {plan.targets.slice(0, 20).map((u, i) => (
              <Box component="li" key={i} sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: 12 }}>
                {u}
              </Box>
            ))}
          </Box>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: '8px', borderColor: 'rgba(148, 163, 184, 0.25)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <FileCode size={12} color="#94a3b8" />
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('warroom.redTeamPreviewSteps')}
          </Typography>
          <Chip label={plan.steps.length} size="small" sx={{ height: 16, fontSize: 12, bgcolor: 'rgba(148, 163, 184, 0.25)', color: '#94a3b8' }} />
        </Box>
        <Box component="ol" sx={{ m: 0, pl: 2 }}>
          {plan.steps.map((s, i) => (
            <Box component="li" key={i} sx={{ color: 'text.secondary', fontSize: 12, mb: 0.5 }}>
              <b>{s.module}</b>{' '}
              <Typography component="span" variant="caption" sx={{ opacity: 0.6 }}>— {s.id}</Typography>
              {s.urls.length > 0 && (
                <Typography component="span" variant="caption" sx={{ opacity: 0.75 }}>
                  {' · '}{s.urls.length} {s.urls.length === 1 ? t('warroom.redTeamUrlOne') : t('warroom.redTeamUrlMany')}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      </Paper>

      {(plan.stealth.user_agent || plan.stealth.delay_ms) && (
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: '8px', borderColor: 'rgba(148, 163, 184, 0.25)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Activity size={12} color="#94a3b8" />
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('warroom.redTeamPreviewStealth')}
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {plan.stealth.user_agent && <span>UA {plan.stealth.user_agent.slice(0, 40)} · </span>}
            {plan.stealth.delay_ms != null && <span>delay {plan.stealth.delay_ms}ms · </span>}
            {plan.stealth.jitter_ms != null && <span>jitter +/-{plan.stealth.jitter_ms}ms</span>}
          </Typography>
        </Paper>
      )}
    </Box>
  )
}

function BackToPicker({ onBack }: { onBack: () => void }) {
  return (
    <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end' }}>
      <Button
        size="small"
        variant="text"
        onClick={onBack}
        sx={{ textTransform: 'none', color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
      >
        {t('warroom.redTeamPreviewBack')}
      </Button>
    </Box>
  )
}
