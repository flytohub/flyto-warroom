import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { ArrowRight, CheckCircle, ExternalLink, Wand2 } from 'lucide-react'
import { t } from '@lib/i18n';
import type { SecurityIssue } from '@lib/engine'

interface AutofixPatch {
  finding_id: string
  rule_id: string
  patch_status: string
  verify_passed: boolean
  pr_url?: string
}

interface Props {
  primary: SecurityIssue
  related: SecurityIssue[]
  autofixPatches?: AutofixPatch[]
  autofixAvailable?: boolean
}

export function FixTab({ primary, related, autofixPatches, autofixAvailable }: Props) {
  const allIssues = [primary, ...related.filter(r => r.fingerprint !== primary.fingerprint)]
  const fixable = allIssues.filter(i => i.fixed_in)

  // Find the highest fix version across all issues
  const versions = fixable.map(i => i.fixed_in!).filter(Boolean)
  const highestFix = versions.sort().pop()
  const currentVersions = [...new Set(fixable.map(i => i.version).filter(Boolean))]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, p: 2.5 }}>
      {/* Upgrade recommendation */}
      {fixable.length > 0 && highestFix && (
        <Box sx={{
          p: 2, borderRadius: 2,
          bgcolor: '#22c55e08', border: '1px solid #22c55e20',
        }}>
          <Box className="flex items-center gap-2 mb-1.5">
            <CheckCircle size={14} style={{ color: '#22c55e' }} />
            <Typography variant="body2" fontWeight={700} color="text.primary">
              {t('issues.fixAll')}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6, display: 'block', mb: 1.5 }}>
            {t('issues.updateTo')} <strong>{primary.package}</strong>{' '}
            {t('issues.to')} <strong style={{ color: '#22c55e' }}>{highestFix}</strong>{' '}
            {t('issues.toFixAll')} {fixable.length} {t('issues.vulnerabilities')}.
          </Typography>
          <Box className="flex items-center gap-2 flex-wrap">
            {currentVersions.map(v => (
              <Chip
                key={v}
                size="small"
                label={
                  <Box className="flex items-center gap-1">
                    <span style={{ color: 'var(--color-text-tertiary)' }}>{v}</span>
                    <ArrowRight size={10} />
                    <span style={{ color: '#22c55e', fontWeight: 700 }}>{highestFix}</span>
                  </Box>
                }
                variant="outlined"
                sx={{ height: 24, fontSize: 12, borderColor: '#22c55e40' }}
              />
            ))}
          </Box>
        </Box>
      )}

      {fixable.length === 0 && (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {t('issues.noFixAvailable')}
          </Typography>
        </Box>
      )}

      {/* AutoFix patches */}
      {autofixPatches && autofixPatches.length > 0 && (
        <Box>
          <Box className="flex items-center gap-1.5 mb-1.5">
            <Wand2 size={13} style={{ opacity: 0.5 }} />
            <Typography variant="caption" fontWeight={700} color="text.secondary"
              sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 13 }}>
              {t('issues.autofixPatches')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {autofixPatches.map((p, i) => (
              <Box key={i} className="flex items-center gap-2" sx={{
                p: 1.5, borderRadius: 1, border: 1, borderColor: 'divider',
              }}>
                <Chip
                  size="small"
	                  label={p.patch_status === 'pr_opened' ? t('hardcoded.pr.opened.354f70f4') : p.patch_status === 'preview' ? t('hardcoded.preview.pending.34cf74c3') : t('common.pending')}
                  sx={{
                    height: 20, fontSize: 12, fontWeight: 700,
                    bgcolor: p.patch_status === 'pr_opened' ? '#22c55e18' : p.patch_status === 'preview' ? '#a78bfa18' : 'action.hover',
                    color: p.patch_status === 'pr_opened' ? '#86efac' : p.patch_status === 'preview' ? '#c4b5fd' : 'text.secondary',
                  }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>{p.rule_id}</Typography>
                {p.verify_passed && <CheckCircle size={12} style={{ color: '#22c55e' }} />}
                {p.pr_url && (
                  <a href={p.pr_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={12} style={{ color: '#a78bfa' }} />
                  </a>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* No autofix hint */}
      {(!autofixPatches || autofixPatches.length === 0) && autofixAvailable !== false && fixable.length > 0 && (
        <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover', textAlign: 'center' }}>
          <Wand2 size={20} style={{ opacity: 0.3, margin: '0 auto 8px' }} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.6 }}>
            {t('issues.noAutoPR')}
          </Typography>
        </Box>
      )}
    </Box>
  )
}
