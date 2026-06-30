import Chip from '@mui/material/Chip'
import { useLocale } from '@hooks/useLocale'
import { t } from '@lib/i18n';
import type { VerifyFindingResponse } from '@lib/engine'
import { verdictDisplayConfig } from './verdictConfig'
import { ConfidenceBadge } from './ConfidenceBadge'
import { VerificationMethodBox } from './VerificationMethodBox'
import { VerdictEvidenceBox } from './VerdictEvidenceBox'
import { AIExplanation } from './AIExplanation'

export function StaticResultView({ result }: { result: VerifyFindingResponse }) {
  useLocale()
  const cfg = verdictDisplayConfig()
  const key = result.verdict || 'inconclusive'
  const v = cfg[key] || cfg.inconclusive
  const VerdictIcon = v.icon
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <VerdictIcon size={24} />
        <Chip label={v.label} size="medium" sx={{ bgcolor: v.color, color: '#fff' }} />
        {result.confidence && <ConfidenceBadge confidence={result.confidence} />}
        <span className="text-xs text-neutral-500">
          {t('warroom.verifyModeStatic')}
        </span>
      </div>
      {result.note && <div className="text-sm text-neutral-400">{result.note}</div>}
      {result.verification_method && <VerificationMethodBox method={result.verification_method} />}
      {result.evidence && <VerdictEvidenceBox evidence={result.evidence} />}
      {result.execution_id && <AIExplanation executionId={result.execution_id} />}
    </div>
  )
}
