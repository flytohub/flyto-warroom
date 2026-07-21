import { Box, Button, Checkbox, FormControlLabel, LinearProgress, Stack, TextField, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { Play } from 'lucide-react'

import { FlytoSurface } from '@atoms/FlytoSurface'
import { InlineErrorNotice } from '@atoms/InlineErrorNotice'
import { t } from '@lib/i18n'

export function VerificationCommandPanel({
  targetUrl,
  repoId,
  dryRun,
  canRun,
  createPending,
  createError,
  onTargetUrlChange,
  onRepoIdChange,
  onDryRunChange,
  onRun,
}: {
  targetUrl: string
  repoId: string
  dryRun: boolean
  canRun: boolean
  createPending: boolean
  createError?: unknown
  onTargetUrlChange: (value: string) => void
  onRepoIdChange: (value: string) => void
  onDryRunChange: (value: boolean) => void
  onRun: () => void
}) {
  const errorMessage = createError instanceof Error ? createError.message : createError ? String(createError) : ''

  return (
    <FlytoSurface
      tone="tech"
      density="compact"
      sx={{
        position: 'relative',
        borderColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.34 : 0.22),
        bgcolor: (theme) =>
          theme.palette.mode === 'dark'
            ? alpha(theme.palette.background.paper, 0.72)
            : alpha(theme.palette.background.paper, 0.96),
        boxShadow: (theme) => `0 10px 24px ${alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? 0.24 : 0.06)}`,
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: (theme) => (theme.palette.mode === 'dark' ? 0.36 : 0.42),
          backgroundImage: (theme) =>
            `linear-gradient(90deg, ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.055)} 0%, transparent 36%, ${alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.1 : 0.045)} 100%), linear-gradient(90deg, ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.08 : 0.055)} 1px, transparent 1px)`,
          backgroundSize: '100% 100%, 28px 100%',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 2,
          background: (theme) =>
            `linear-gradient(90deg, ${alpha(theme.palette.primary.main, 0.68)}, ${alpha(theme.palette.info.main, 0.48)}, transparent)`,
        },
      }}
      bodySx={{
        position: 'relative',
        zIndex: 1,
        p: { xs: 1, md: 1.1 },
        '& .MuiInputBase-root': {
          height: 40,
          bgcolor: (theme) => (theme.palette.mode === 'dark' ? alpha(theme.palette.background.paper, 0.78) : theme.palette.background.paper),
          boxShadow: (theme) => `inset 0 0 0 1px ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.14 : 0.1)}`,
        },
        '& .MuiOutlinedInput-notchedOutline': {
          borderColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.28 : 0.18),
        },
        '& .Mui-focused .MuiOutlinedInput-notchedOutline': {
          borderColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.62 : 0.42),
        },
        '& .MuiButton-root': {
          height: 40,
          borderRadius: 1,
        },
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(150px, 0.55fr) minmax(260px, 1.35fr) minmax(180px, 0.85fr) auto auto' },
          gap: 1,
          alignItems: 'center',
          minWidth: 0,
        }}
      >
        <Stack direction="row" spacing={0.8} alignItems="center" sx={{ minWidth: 0 }}>
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'info.main',
              bgcolor: (theme) => alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.13 : 0.07),
              border: 1,
              borderColor: (theme) => alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.32 : 0.22),
              flexShrink: 0,
            }}
          >
            <Play size={16} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={950} noWrap>
              {t('productVerification.commandTitle')}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {t('productVerification.commandSubtitle')}
            </Typography>
          </Box>
        </Stack>
        <TextField
          label={t('productVerification.targetUrl')}
          placeholder={t('productVerification.targetUrlPlaceholder')}
          value={targetUrl}
          onChange={(e) => onTargetUrlChange(e.target.value)}
          size="small"
          sx={{ minWidth: 0 }}
        />
        <TextField
          label={t('productVerification.repoId')}
          placeholder={t('productVerification.repoIdPlaceholder')}
          value={repoId}
          onChange={(e) => onRepoIdChange(e.target.value)}
          size="small"
          sx={{ minWidth: 0 }}
        />
        <FormControlLabel
          control={<Checkbox checked={dryRun} onChange={(e) => onDryRunChange(e.target.checked)} size="small" />}
          label={t('productVerification.dryRun')}
          sx={{ whiteSpace: 'nowrap', mx: 0 }}
        />
        <Button
          variant="contained"
          startIcon={<Play size={18} />}
          disabled={!canRun}
          onClick={onRun}
          sx={{
            minWidth: 124,
            flexShrink: 0,
            fontWeight: 900,
            '&:not(.Mui-disabled)': {
              background: (theme) => `linear-gradient(90deg, ${theme.palette.primary.main}, ${alpha(theme.palette.info.main, 0.86)})`,
              boxShadow: (theme) => `0 10px 20px ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.28 : 0.18)}`,
            },
          }}
        >
          {createPending ? t('common.running') : t('productVerification.run')}
        </Button>
      </Box>
      {createPending && <LinearProgress sx={{ mt: 1 }} />}
      {errorMessage && (
        <Box sx={{ mt: 1 }}>
          <InlineErrorNotice error={errorMessage} />
        </Box>
      )}
    </FlytoSurface>
  )
}
