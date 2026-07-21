import { Box, Chip, Stack, Typography } from '@mui/material'

import { t } from '@lib/i18n'
import { flytoTextStyles } from '@/styles/visualSystem'
import {
  matrixStatusColor,
  matrixStatusLabel,
  type VerificationMatrixRowModel,
} from './productVerificationMatrix'

export function VerificationMatrixRow({ row }: { row: VerificationMatrixRowModel }) {
  return (
    <Box sx={{ border: 1, borderColor: row.status === 'blocked' || row.status === 'missing' ? 'warning.main' : 'divider', borderRadius: 1, p: 1.5, minWidth: 0 }}>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', lg: 'center' }} justifyContent="space-between">
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Chip size="small" color={matrixStatusColor(row.status)} label={matrixStatusLabel(row.status)} />
            <Typography variant="body2" fontWeight={850} sx={{ overflowWrap: 'anywhere' }}>{row.title}</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.5 }}>
            {row.detail}
          </Typography>
        </Box>
        <Box sx={{ minWidth: { xs: 0, lg: 320 }, maxWidth: { lg: 520 } }}>
          <Typography variant="caption" color="text.secondary">{t('productVerification.matrixEvidence')}</Typography>
          <Typography variant="body2" sx={flytoTextStyles.codeValue}>{row.evidence}</Typography>
          <Typography variant="caption" color="text.secondary">{t('productVerification.matrixOwner')}: {row.owner}</Typography>
        </Box>
      </Stack>
    </Box>
  )
}
