import type { ReactNode } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { ShieldCheck } from 'lucide-react'

import { FlytoCodeBlock } from '@atoms/FlytoCodeBlock'
import { t } from '@lib/i18n'
import type { WarroomEvidenceFinding } from '@lib/engine'
import { flytoTextStyles } from '@/styles/visualSystem'
import { resolveVerificationToneColor } from './productVerificationPresentation'

export function SectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ display: 'flex', color: 'primary.main' }}>{icon}</Box>
      <Typography variant="subtitle2" fontWeight={800}>{title}</Typography>
    </Box>
  )
}

export function EvidenceField({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ ...flytoTextStyles.codeValue, mt: 0.5 }}>{value}</Typography>
    </Box>
  )
}

export function ContractRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '160px minmax(0, 1fr)' }, gap: 1, alignItems: 'start', p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
      <Typography variant="body2" sx={flytoTextStyles.codeValue}>{value}</Typography>
    </Box>
  )
}

export function CodePreview({ value }: { value: string }) {
  return <FlytoCodeBlock value={value} minHeight={180} maxHeight={360} />
}

export function VerificationBeacon({ value, tone, active }: { value: string; tone: string; active: boolean }) {
  return (
    <Box
      sx={{
        width: 96,
        height: 96,
        borderRadius: 1,
        position: 'relative',
        display: { xs: 'none', md: 'grid' },
        placeItems: 'center',
        color: tone,
        border: 1,
        borderColor: tone,
        bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.5 : 0.82),
        overflow: 'hidden',
        boxShadow: (theme) => `inset 0 0 24px ${alpha(resolveVerificationToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.18 : 0.11)}`,
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 8,
          borderRadius: '50%',
          background: (theme) =>
            `conic-gradient(from 210deg, transparent 0 22%, ${alpha(resolveVerificationToneColor(theme, tone), active ? 0.42 : 0.16)} 28%, transparent 34% 72%, ${alpha(theme.palette.info.main, 0.28)} 79%, transparent 86%)`,
          opacity: active ? 0.95 : 0.65,
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 14,
          border: '1px solid',
          borderColor: tone,
          borderRadius: '50%',
          opacity: active ? 0.42 : 0.22,
          boxShadow: (theme) => `0 0 0 12px ${alpha(resolveVerificationToneColor(theme, tone), 0.08)}, 0 0 0 26px ${alpha(resolveVerificationToneColor(theme, tone), 0.045)}`,
        },
      }}
    >
      <Box sx={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
        <ShieldCheck size={20} />
        <Typography sx={{ fontSize: 20, lineHeight: 1, fontWeight: 950, mt: 0.25, textShadow: (theme) => `0 0 16px ${alpha(resolveVerificationToneColor(theme, tone), theme.palette.mode === 'dark' ? 0.5 : 0.2)}` }} noWrap>
          {value}
        </Typography>
      </Box>
    </Box>
  )
}


export function TechCorners({ tone }: { tone: string }) {
  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        inset: 10,
        pointerEvents: 'none',
        zIndex: 1,
        '& .corner': {
          position: 'absolute',
          width: 24,
          height: 24,
          borderColor: tone,
          opacity: (theme) => (theme.palette.mode === 'dark' ? 0.65 : 0.5),
        },
        '& .tl': { top: 0, left: 0, borderTop: 2, borderLeft: 2 },
        '& .tr': { top: 0, right: 0, borderTop: 2, borderRight: 2 },
        '& .bl': { bottom: 0, left: 0, borderBottom: 2, borderLeft: 2 },
        '& .br': { bottom: 0, right: 0, borderBottom: 2, borderRight: 2 },
      }}
    >
      <Box className="corner tl" />
      <Box className="corner tr" />
      <Box className="corner bl" />
      <Box className="corner br" />
    </Box>
  )
}


export function FindingList({ findings }: { findings: WarroomEvidenceFinding[] }) {
  if (findings.length === 0) {
    return (
      <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <Typography variant="body2" fontWeight={800}>{t('productVerification.stateFindings')}</Typography>
        <Typography variant="caption" color="text.secondary">
          {t('productVerification.noStateFindings')}
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1, minWidth: 0 }}>
      <Typography variant="body2" fontWeight={800}>{t('productVerification.stateFindings')}</Typography>
      <Stack spacing={1} sx={{ mt: 1 }}>
        {findings.slice(0, 8).map((finding, index) => {
          const code = finding.code ?? finding.type ?? `finding_${index + 1}`
          const severity = finding.severity ?? 'unknown'
          return (
            <Box key={`${code}-${index}`} sx={{ p: 1.25, border: 1, borderColor: severity.toLowerCase().includes('p0') || severity.toLowerCase().includes('critical') ? 'error.main' : 'divider', borderRadius: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip size="small" color={severity.toLowerCase().includes('p0') || severity.toLowerCase().includes('critical') ? 'error' : 'default'} label={severity} />
                <Typography variant="caption" fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{code}</Typography>
              </Stack>
              {finding.message && (
                <Typography variant="body2" sx={{ mt: 0.75, overflowWrap: 'anywhere' }}>{finding.message}</Typography>
              )}
            </Box>
          )
        })}
      </Stack>
    </Box>
  )
}
