/**
 * VerdictEvidenceBox — honest render of the STRUCTURED static-verify
 * evidence the engine already sends (`verdictEvidence`, no json tags).
 * No prose, no fabrication: just the raw signals that fed the verdict,
 * labelled in plain language. Reflection-guard / all-non-public rows
 * only show when they actually fire (otherwise they add no signal).
 *
 * Honest empty state: callers pass `evidence` only when present —
 * an undefined evidence object renders nothing at all.
 */

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useLocale } from '@hooks/useLocale'
import { t } from '@lib/i18n';
import type { VerdictEvidence } from '@lib/engine'

function yesNo(v: boolean): string {
  return v
    ? t('warroom.verifyEvidenceYes')
    : t('warroom.verifyEvidenceNo')
}

/** CVEMetaConfidence is a 0..1 float on the wire. Render as a percent
 *  when in range; if the backend ever sends an out-of-range value,
 *  show it verbatim rather than lie with a bogus percentage. */
function formatConfidence(c: number): string {
  if (c > 0 && c <= 1) return `${Math.round(c * 100)}%`
  return String(c)
}

interface Row {
  label: string
  value: string
}

export function VerdictEvidenceBox({ evidence }: { evidence: VerdictEvidence }) {
  useLocale()

  const rows: Row[] = [
    {
      label: t('warroom.verifyEvidenceImported'),
      value: yesNo(evidence.L1Imported),
    },
    {
      label: t('warroom.verifyEvidenceVulnFn'),
      value: yesNo(evidence.L2HasVulnFunctions),
    },
    {
      label: t('warroom.verifyEvidenceDirect'),
      value: String(evidence.L3DirectMatchCount),
    },
    {
      label: t('warroom.verifyEvidenceIndirect'),
      value: String(evidence.L3IndirectMatchCount),
    },
    {
      label: t('warroom.verifyEvidenceCveConf'),
      value: formatConfidence(evidence.CVEMetaConfidence),
    },
  ]

  // Only surface these when they carry signal — a false reflection
  // guard / non-public flag tells the user nothing.
  if (evidence.L3ReflectionGuard) {
    rows.push({
      label: t('warroom.verifyEvidenceReflection'),
      value: yesNo(true),
    })
  }
  if (evidence.L3AllNonPublic) {
    rows.push({
      label: t('warroom.verifyEvidenceNonPublic'),
      value: yesNo(true),
    })
  }

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
          mb: '2px',
        }}
      >
        {t('warroom.verifyEvidenceTitle')}
      </Typography>
      {rows.map((row) => (
        <Box
          key={row.label}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <Typography sx={{ fontSize: 13, lineHeight: 1.6, color: 'text.secondary' }}>
            {row.label}
          </Typography>
          <Typography sx={{ fontSize: 13, lineHeight: 1.6, color: 'text.primary', fontWeight: 500 }}>
            {row.value}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}
