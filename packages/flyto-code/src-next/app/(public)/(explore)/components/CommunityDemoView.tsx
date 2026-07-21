import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { Navigate } from 'react-router'

import { CommunityProductLoopPanel } from '@compounds/onboarding/CommunityProductLoopPanel'
import { env } from '@lib/env'
import { t } from '@lib/i18n'

export default function CommunityDemoView() {
  if (env.authMode !== 'community') {
    return <Navigate to="/sign-in" replace />
  }

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        color: 'text.primary',
        px: { xs: 2, sm: 4 },
        py: { xs: 4, md: 7 },
      }}
    >
      <Box sx={{ width: '100%', maxWidth: 1120, mx: 'auto' }}>
        <Typography variant="overline" color="success.main" fontWeight={800}>
          {t('communityLoop.eyebrow')}
        </Typography>
        <Typography variant="h4" fontWeight={800} sx={{ mt: 0.5, mb: 1 }}>
          {t('communityLoop.title')}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 760, mb: 3 }}>
          {t('communityLoop.description')}
        </Typography>
        <CommunityProductLoopPanel enabled />
      </Box>
    </Box>
  )
}
