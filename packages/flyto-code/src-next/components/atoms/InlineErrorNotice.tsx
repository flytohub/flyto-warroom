import { Alert } from '@mui/material'
import { t } from '@lib/i18n'
import { describeEngineError } from '@lib/engine/errors'

export interface InlineErrorNoticeProps {
  error: unknown
  title?: string
  compact?: boolean
}

export function InlineErrorNotice({ error, title, compact = true }: InlineErrorNoticeProps) {
  const display = describeEngineError(error)
  const raw = display.message || (error instanceof Error ? error.message : String(error ?? ''))
  const message = raw || t('queryError.unknownDesc')

  return (
    <Alert
      severity="error"
      variant="outlined"
      sx={{
        alignItems: 'center',
        fontSize: compact ? 12 : 13,
        borderRadius: 2,
      }}
    >
      {title ? <strong>{title}: </strong> : null}
      {display.description ?? message}
    </Alert>
  )
}

export default InlineErrorNotice
