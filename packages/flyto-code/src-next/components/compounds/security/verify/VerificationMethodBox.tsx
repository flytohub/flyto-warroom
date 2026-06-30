import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useLocale } from '@hooks/useLocale'
import { t } from '@lib/i18n';

export function VerificationMethodBox({ method }: { method: string }) {
  useLocale()
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        p: '12px 14px',
        borderRadius: 'var(--flyto-radius-sm, 8px)',
        bgcolor: 'action.hover',
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Typography
        sx={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.04em',
          color: 'text.secondary',
          textTransform: 'uppercase',
        }}
      >
        {t('warroom.verificationMethodTitle')}
      </Typography>
      <Typography sx={{ fontSize: 13, lineHeight: 1.6, color: 'text.secondary' }}>
        {method}
      </Typography>
    </Box>
  )
}
