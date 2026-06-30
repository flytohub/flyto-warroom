/**
 * ReportToolbar — top toolbar with PDF export + save.
 */

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { Download, RotateCcw, Save, Sparkles, FileText } from 'lucide-react'
import Divider from '@mui/material/Divider'
import { t } from '@lib/i18n';

interface Props {
  reportName: string
  onExportPdf: () => void
  showSave?: boolean
  onSave?: () => void
  exporting?: boolean
  exportDisabled?: boolean
  exportDisabledReason?: string
  onAiPolish?: () => void
  polishing?: boolean
  hasPolishData?: boolean
  onClearPolish?: () => void
  aiPolishDisabled?: boolean
  aiPolishDisabledReason?: string
}

export function ReportToolbar({
  reportName,
  onExportPdf,
  showSave,
  onSave,
  exporting,
  exportDisabled,
  exportDisabledReason,
  onAiPolish,
  polishing,
  hasPolishData,
  onClearPolish,
  aiPolishDisabled,
  aiPolishDisabledReason,
}: Props) {
  const exportButton = (
    <Button
      size="small" variant="contained"
      startIcon={exporting ? <CircularProgress size={14} color="inherit" /> : <Download size={14} />}
      onClick={onExportPdf}
      disabled={exporting || exportDisabled}
      sx={{
        textTransform: 'none', fontSize: 12,
        bgcolor: '#8b5cf6',
        boxShadow: 'none',
        '&:hover': { bgcolor: '#7c3aed', boxShadow: 'none' },
      }}
    >
      {t('reports.exportPdf')}
    </Button>
  )

  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1,
      px: 2, py: 1,
      borderBottom: '1px solid', borderColor: 'divider',
      flexShrink: 0,
    }}>
      <FileText size={18} style={{ color: '#a78bfa', flexShrink: 0 }} />
      <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1, minWidth: 0 }} noWrap>
        {reportName}
      </Typography>

      {exporting && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <CircularProgress size={14} />
          <Typography variant="caption" color="text.secondary">
            {t('reports.generating')}
          </Typography>
        </Box>
      )}

      {showSave && onSave && (
        <Button
          size="small" variant="outlined"
          startIcon={<Save size={14} />}
          onClick={onSave}
          disabled={exporting}
          sx={{ textTransform: 'none', fontSize: 12 }}
        >
          {t('reports.save')}
        </Button>
      )}

      {onAiPolish && (
        aiPolishDisabled ? (
          <Tooltip title={aiPolishDisabledReason || t('reports.aiPolishLocked')}>
            <Box component="span" sx={{ display: 'inline-flex' }}>
              <Button
                size="small" variant="outlined"
                startIcon={polishing ? <CircularProgress size={14} color="inherit" /> : <Sparkles size={14} />}
                disabled
                sx={{ textTransform: 'none', fontSize: 12 }}
              >
                {t('reports.aiPolish')}
              </Button>
            </Box>
          </Tooltip>
        ) : (
          <Button
            size="small" variant="outlined"
            startIcon={polishing ? <CircularProgress size={14} color="inherit" /> : <Sparkles size={14} />}
            onClick={onAiPolish}
            disabled={exporting || polishing}
            sx={{ textTransform: 'none', fontSize: 12 }}
          >
            {t('reports.aiPolish')}
          </Button>
        )
      )}

      {hasPolishData && onClearPolish && (
        <Button
          size="small" variant="text"
          startIcon={<RotateCcw size={14} />}
          onClick={onClearPolish}
          disabled={exporting || polishing}
          sx={{ textTransform: 'none', fontSize: 12 }}
        >
          {t('reports.clearPolish')}
        </Button>
      )}

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {exportDisabled ? (
        <Tooltip title={exportDisabledReason || t('reports.exportLocked')}>
          <Box component="span" sx={{ display: 'inline-flex' }}>{exportButton}</Box>
        </Tooltip>
      ) : exportButton}
    </Box>
  )
}
