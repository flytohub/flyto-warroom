import Chip from '@mui/material/Chip'
import { useLocale } from '@hooks/useLocale'
import { t } from '@lib/i18n';
import { confidenceStyles } from './verdictConfig'

export function ConfidenceBadge({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  useLocale()
  const styles = confidenceStyles()
  const s = styles[confidence] || styles.low
  return (
    <Chip
      label={s.label}
      size="small"
      variant="outlined"
      title={t('warroom.confidenceTooltip')}
      sx={{ borderColor: s.color, color: s.color }}
    />
  )
}
