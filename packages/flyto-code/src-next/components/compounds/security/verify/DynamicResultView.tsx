import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { useLocale } from '@hooks/useLocale'
import { t } from '@lib/i18n';
import type { WorkflowExecution } from '@lib/engine'
import { verdictDisplayConfig } from './verdictConfig'
import { ConfidenceBadge } from './ConfidenceBadge'
import { VerificationMethodBox } from './VerificationMethodBox'
import { AIExplanation } from './AIExplanation'

export function DynamicResultView({ execution }: { execution: WorkflowExecution }) {
  useLocale()
  const cfg = verdictDisplayConfig()
  const v = cfg[execution.verdict ?? ''] ?? cfg.inconclusive
  const VerdictIcon = v.icon
  // Dynamic verify is pattern-match based today (generic fuzz payload
  // against target_url). We don't yet ship CVE-specific probes, so
  // confidence is always "low" for dynamic results. Flip this when
  // the flyto-ai payload synthesiser lands.
  const dynamicVerificationMethod = t('warroom.dynamicVerificationMethod')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <VerdictIcon size={24} />
        <Chip label={v.label} size="medium" sx={{ bgcolor: v.color, color: '#fff' }} />
        <ConfidenceBadge confidence="low" />
      </div>
      <VerificationMethodBox method={dynamicVerificationMethod} />

      {execution.evidenceUrl && (
        <a
          href={execution.evidenceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-violet-400 underline"
        >
          {t('warroom.viewEvidence')}
        </a>
      )}

      {execution.errorMessage && !execution.errorMessage.startsWith('[ai-explain]') && (
        <div className="text-sm text-red-400">{execution.errorMessage}</div>
      )}

      <AIExplanation executionId={execution.executionId} />

      <details className="text-xs">
        <summary className="cursor-pointer text-neutral-500">{t('warroom.generatedYaml')}</summary>
        <Typography
          component="pre"
          className="mt-2 max-h-[200px] overflow-auto text-xs"
          sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', bgcolor: '#0f172a', color: '#e5e7eb', p: 1, borderRadius: 1 }}
        >
          {execution.yaml}
        </Typography>
      </details>
    </div>
  )
}
