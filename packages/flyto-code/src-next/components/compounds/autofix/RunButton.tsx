import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, GitPullRequest, Play } from 'lucide-react'
import { gradients } from '@/styles/designTokens'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import { t } from '@lib/i18n';
import { useConnectedRepos } from '@hooks/useOrg'
import { runAutofix, type AutofixRunResponse } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { GatedButton } from '@atoms/GatedButton'

export function RunButton({ orgId, onRunComplete }: {
  orgId: string | undefined
  onRunComplete: () => void
}) {
  const qc = useQueryClient()
  const { data: repos } = useConnectedRepos(orgId)
  const repoList = repos ?? []
  const [open, setOpen] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<string>('')
  const [openPR, setOpenPR] = useState<boolean>(false)
  const [response, setResponse] = useState<AutofixRunResponse | null>(null)
  const hasRepos = repoList.length > 0

  useEffect(() => {
    if (!open) return undefined
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  const runMut = useMutation({
    mutationFn: ({ repoId, withPR }: { repoId: string; withPR: boolean }) =>
      runAutofix(repoId, withPR),
    onSuccess: (data) => {
      setResponse(data)
      qc.invalidateQueries({ queryKey: qk.autofix.findings(orgId) })
      qc.invalidateQueries({ queryKey: qk.autofix.findingsCount(orgId) })
      qc.invalidateQueries({ queryKey: qk.autofix.runs(orgId) })
      onRunComplete()
    },
  })

  return (
    <Box sx={{ position: 'relative' }}>
      <GatedButton
        action="autofix:open_pr"
        variant="contained"
        size="small"
        startIcon={<Play size={14} />}
        onClick={() => setOpen(v => !v)}
        sx={{
          textTransform: 'none', fontWeight: 600, borderRadius: 2,
          background: gradients.autofix,
          boxShadow: 'none', '&:hover': { boxShadow: 'none' },
        }}
      >
        {t('autofix.warroom.run')}
      </GatedButton>

      {open && (
        <>
          <Box aria-hidden="true" onClick={() => setOpen(false)} sx={{ position: 'fixed', inset: 0, zIndex: 10 }} />
          <Paper
            elevation={8}
            role="dialog"
            aria-label={t('autofix.warroom.runDialog')}
            sx={{
              position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 11,
              p: 2.5, minWidth: 320, borderRadius: 3,
              display: 'flex', flexDirection: 'column', gap: 2,
            }}
          >
            <FormControl size="small" fullWidth>
              <InputLabel>{t('autofix.warroom.pickRepo')}</InputLabel>
              <Select
                value={selectedRepo}
                label={t('autofix.warroom.pickRepo')}
                disabled={!hasRepos}
                inputProps={{ 'aria-label': t('autofix.warroom.pickRepo') }}
                onChange={e => setSelectedRepo(e.target.value)}
              >
                {repoList.map(r => (
                  <MenuItem key={r.id} value={r.id}>{r.repoName}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {!hasRepos && (
              <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
                {t('autofix.warroom.noRepos')}
              </Alert>
            )}

            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={openPR}
                  onChange={e => setOpenPR(e.target.checked)}
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <GitPullRequest size={13} />
                  <Typography variant="body2">{t('autofix.warroom.openPR')}</Typography>
                </Box>
              }
            />

            <GatedButton
              action="autofix:open_pr"
              variant="contained"
              fullWidth
              disabled={!hasRepos || !selectedRepo || runMut.isPending}
              onClick={() => runMut.mutate({ repoId: selectedRepo, withPR: openPR })}
              startIcon={runMut.isPending ? <CircularProgress size={14} color="inherit" /> : <Play size={14} />}
              sx={{
                textTransform: 'none', fontWeight: 600, borderRadius: 2,
                background: gradients.autofix,
                boxShadow: 'none', '&:hover': { boxShadow: 'none' },
              }}
            >
              {runMut.isPending ? t('autofix.warroom.running') : t('autofix.warroom.run')}
            </GatedButton>

            {runMut.isError && (
              <Alert severity="error" variant="outlined" sx={{ borderRadius: 2 }}>
                {(runMut.error as Error).message}
              </Alert>
            )}

            {response?.summary && (
              <Alert severity="success" variant="outlined" icon={<CheckCircle2 size={16} />} sx={{ borderRadius: 2 }}>
                {response.summary.rules.reduce((s, rr) => s + rr.findings.length, 0)} findings · {response.summary.total_passes} verified
              </Alert>
            )}
          </Paper>
        </>
      )}
    </Box>
  )
}
