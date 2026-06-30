/**
 * Shared verdict → display mapping and confidence badge config.
 *
 * Pure functions, no React — easy to test. The vocabulary includes
 * hedged variants (`suspected_exploitable`, `likely_sanitized`) that
 * show in the same colour family as their definitive siblings but with
 * a "SUSPECTED" / "LIKELY" prefix so users don't read them as proof.
 */

import { ShieldCheck, ShieldAlert, ShieldOff } from 'lucide-react'
import { t } from '@lib/i18n';

export interface VerdictDisplay {
  color: string
  label: string
  icon: typeof ShieldCheck
}

export function verdictDisplayConfig(): Record<string, VerdictDisplay> {
  return {
    reachable:              { color: 'yellow', label: t('warroom.verdictReachable'), icon: ShieldAlert },
    exploitable:            { color: 'red',    label: t('warroom.verdictExploitable'), icon: ShieldAlert },
    suspected_exploitable:  { color: 'orange', label: t('warroom.verdictSuspected'), icon: ShieldAlert },
    sanitized:              { color: 'green',  label: t('warroom.verdictSanitized'), icon: ShieldCheck },
    likely_sanitized:       { color: 'teal',   label: t('warroom.verdictLikelySanitized'), icon: ShieldCheck },
    unreachable:            { color: 'gray',   label: t('warroom.verdictUnreachable'), icon: ShieldOff },
    inconclusive:           { color: 'gray',   label: t('warroom.verdictInconclusive'), icon: ShieldOff },
  }
}

export interface ConfidenceDisplay {
  color: string
  label: string
}

export function confidenceStyles(): Record<string, ConfidenceDisplay> {
  return {
    high:   { color: 'green',  label: t('warroom.confidenceHigh') },
    medium: { color: 'yellow', label: t('warroom.confidenceMedium') },
    low:    { color: 'red',    label: t('warroom.confidenceLow') },
  }
}
