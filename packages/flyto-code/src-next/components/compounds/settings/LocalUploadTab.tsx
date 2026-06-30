import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { Upload } from 'lucide-react'
import { t } from '@lib/i18n';
import { ScanUploadDropzone } from '@compounds/_shared/ScanUploadDropzone'
import { sectionTitleSx } from './shared'

export function LocalUploadTab() {
  return (
    <>
      <Box sx={sectionTitleSx}>
        <Upload size={15} style={{ color: '#38bdf8', opacity: 0.9 }} />
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', fontSize: 12 }}>
          {t('settings.localUploadTitle')}
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mb: 2, lineHeight: 1.5 }}>
        {t('settings.localUploadDesc')}
      </Typography>
      <ScanUploadDropzone />
    </>
  )
}
