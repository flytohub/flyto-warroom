/**
 * FixPlanPanel — AI-generated remediation roadmap for a repo's open
 * findings. Shows a week-bucketed timeline (lighter than a Gantt but
 * carries the same information density for short horizons) and an
 * export affordance so PMs can drop it into a ticket tracker.
 *
 * Design rationale: a full Gantt implies per-day precision the LLM
 * can't credibly produce. Week buckets match how sprint planning
 * actually works and avoid false precision.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Download, AlertTriangle, Shield, Key, Code2, Trash2, Scale, RefreshCw, Loader2 } from 'lucide-react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { getFixPlan, generateFixPlan, type FixPlan, type FixPlanItem } from '@lib/engine'
import { InlineErrorNotice } from '@atoms/InlineErrorNotice'
import { severityColor } from '@atoms/SeverityChip'

interface Props {
  repoId: string
  repoName: string
}

function kindIcon(kind: FixPlanItem['kind']) {
  switch (kind) {
    case 'cve':        return AlertTriangle
    case 'sast':       return Shield
    case 'secret':     return Key
    case 'complexity': return Code2
    case 'dead_code':  return Trash2
    case 'license':    return Scale
    default:           return Code2
  }
}

export function FixPlanPanel({ repoId, repoName }: Props) {
  const [copied, setCopied] = useState(false)
  const qc = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: qk.repos.fixPlan(repoId),
    queryFn: () => getFixPlan(repoId),
    staleTime: 60_000,
    retry: 1,
  })
  const plan = data?.plan

  // Manual generate — fallback when auto-generate failed or never ran
  const generate = useMutation({
    mutationFn: () => generateFixPlan(repoId, false),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.repos.fixPlan(repoId) }),
  })

  function exportMarkdown() {
    if (!plan) return
    const md = planToMarkdown(plan, repoName)
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        borderLeft: '3px solid rgba(167, 139, 250, 0.5)',
        borderRadius: 2,
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Sparkles size={14} style={{ color: '#a78bfa' }} />
          <Typography variant="subtitle2" sx={{ color: 'text.primary', fontWeight: 600 }}>
            {t('fixPlan.title')}
          </Typography>
          {plan?.total_effort_hours ? (
            <Chip
              label={`${plan.total_effort_hours}h`}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.85rem',
                fontWeight: 600,
                bgcolor: 'rgba(167,139,250,0.15)',
                color: '#a78bfa',
                border: '1px solid rgba(167,139,250,0.3)',
              }}
            />
          ) : null}
        </Box>
        <Box>
          {plan && (
            <Button
              size="small"
              variant="text"
              onClick={exportMarkdown}
              title={t('fixPlan.export')}
              startIcon={<Download size={12} />}
              sx={{
                fontSize: '0.85rem',
                color: 'text.secondary',
                textTransform: 'none',
                minWidth: 'auto',
                px: 1,
                '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
              }}
            >
              {copied ? t('fixPlan.copied') : t('fixPlan.export')}
            </Button>
          )}
        </Box>
      </Box>

      {/* Empty / error state with manual retry */}
      {!isLoading && !plan && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5,
            py: 3,
          }}
        >
          {isError ? (
            <AlertTriangle size={24} style={{ color: '#f97316', opacity: 0.7 }} />
          ) : (
            <Sparkles size={24} style={{ color: '#a78bfa', opacity: 0.5 }} />
          )}
          <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>
            {isError
              ? t('fixPlan.errorTitle')
              : t('fixPlan.emptyTitle')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 320 }}>
            {isError
              ? t('fixPlan.errorSub')
              : t('fixPlan.emptySubAuto')}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={generate.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            disabled={generate.isPending || generate.isSuccess}
            onClick={() => generate.mutate()}
            sx={{ textTransform: 'none', mt: 0.5 }}
          >
            {generate.isPending
              ? t('fixPlan.generating')
              : generate.isSuccess
                ? t('fixPlan.generated')
                : t('fixPlan.generate')}
          </Button>
          {generate.isError && (
            <InlineErrorNotice error={generate.error ?? t('fixPlan.generateError')} />
          )}
        </Box>
      )}

      {/* Summary */}
      {plan && plan.summary && (
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary',
            fontSize: '0.85rem',
            lineHeight: 1.5,
            borderLeft: '2px solid rgba(167,139,250,0.3)',
            pl: 1.5,
          }}
        >
          {plan.summary}
        </Typography>
      )}

      {/* Timeline */}
      {plan && plan.buckets?.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {plan.buckets.map((bucket) => (
            <Box
              key={bucket.week}
              sx={{
                bgcolor: 'action.hover',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1.5,
                p: 1.5,
              }}
            >
              {/* Bucket header */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography
                  variant="caption"
                  sx={{ color: '#a78bfa', fontWeight: 700, fontSize: '0.85rem' }}
                >
                  {t('fixPlan.week', { n: bucket.week })}
                </Typography>
                {bucket.label && (
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                    {bucket.label}
                  </Typography>
                )}
                <Chip
                  label={`${bucket.effort_hours}h`}
                  size="small"
                  sx={{
                    ml: 'auto',
                    height: 18,
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    bgcolor: 'action.selected',
                    color: 'text.secondary',
                  }}
                />
              </Box>

              {/* Items */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {bucket.items.map((item) => {
                  const Icon = kindIcon(item.kind)
                  const onCritical = plan.critical_path?.includes(item.id) ?? false
                  return (
                    <Box
                      key={item.id}
                      title={item.rationale}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        py: 0.5,
                        px: 1,
                        borderRadius: 1,
                        bgcolor: onCritical ? 'rgba(239,68,68,0.06)' : 'transparent',
                        borderLeft: onCritical ? '2px solid #ef4444' : '2px solid transparent',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <Icon size={12} style={{ color: severityColor(item.severity), flexShrink: 0 }} />
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.primary',
                          fontSize: '0.85rem',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.title}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          color: 'text.secondary',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {item.effort_hours}h
                      </Typography>
                    </Box>
                  )
                })}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* Critical path */}
      {plan && plan.critical_path?.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mt: 0.5,
            pt: 1,
            borderTop: 1, borderColor: 'divider',
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: '#ef4444', fontWeight: 600, fontSize: '0.85rem', flexShrink: 0 }}
          >
            {t('fixPlan.criticalPath')}
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: 'text.secondary', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {plan.critical_path.join(' \u2192 ')}
          </Typography>
        </Box>
      )}

    </Paper>
  )
}

export function planToMarkdown(plan: FixPlan, repoName: string): string {
  const lines: string[] = []
  lines.push(`# Fix Plan — ${repoName}`)
  lines.push('')
  if (plan.summary) lines.push(plan.summary, '')
  lines.push(`Total effort: **${plan.total_effort_hours}h**`)
  if (plan.critical_path?.length) {
    lines.push(`Critical path: ${plan.critical_path.join(' \u2192 ')}`)
  }
  lines.push('')
  for (const bucket of plan.buckets ?? []) {
    lines.push(`## Week ${bucket.week}${bucket.label ? ` — ${bucket.label}` : ''} (${bucket.effort_hours}h)`)
    for (const item of bucket.items) {
      lines.push(`- **[${item.severity}]** ${item.title} — ${item.effort_hours}h`)
      if (item.rationale) lines.push(`  - ${item.rationale}`)
      if (item.files?.length) lines.push(`  - files: ${item.files.join(', ')}`)
    }
    lines.push('')
  }
  if (plan.dependencies?.length) {
    lines.push('## Dependencies')
    for (const dep of plan.dependencies) {
      lines.push(`- \`${dep.from}\` \u2192 \`${dep.to}\``)
    }
  }
  return lines.join('\n')
}
