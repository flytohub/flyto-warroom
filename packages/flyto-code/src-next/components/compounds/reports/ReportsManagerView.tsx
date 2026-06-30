/**
 * ReportsManagerView — the audience-aware "report center" surface.
 *
 * Manager mode of the Reports page. Where the engineer view is a
 * section/widget editor + raw template catalog, the manager view is a
 * curated set of audience presets (Board / SOC / External / Compliance)
 * each backed by a real preset template from `REPORT_TEMPLATES`, with
 * live posture KPIs sourced from the scoring engine — no fake numbers.
 *
 * Actions per preset:
 *   - "Open in editor" → flips the page to engineer mode AND selects the
 *     backing template (cross-mode event consumed by ReportsEngineerView)
 *     so the operator lands directly on that report's layout/preview.
 *
 * Client functions imported by DIRECT FILE PATH per the parallel-safety
 * decoupling rule (NOT via the @lib/engine barrel).
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import { alpha, useTheme } from '@mui/material/styles'
import {
  Presentation, ShieldAlert, Globe, ClipboardCheck, ArrowRight, FileText,
  TrendingUp, TrendingDown, Activity,
} from 'lucide-react'

import {
  ManagerDashboard,
  ChartCard,
  KpiCard,
  TrendChart,
  DonutChart,
  ManagerHero,
  type DonutDatum,
} from '@compounds/_shared'
import { colors } from '@/styles/designTokens'
import { t, tOr } from '@lib/i18n';
import { useOrg } from '@hooks/useOrg'
import { qk } from '@lib/queryKeys'
import { getComputedScore } from '@lib/engine/scoring/scoring'
import { getUnifiedScoreHistory } from '@lib/engine/scoring/scoring'
import { REPORT_TEMPLATES } from './templates'
import type { ReportTemplate } from './types'

// Event the engineer view listens for to deep-link into a template.
// Kept in this domain (not a global bus contract) — both ends live in
// the reports compound folder.
export const REPORTS_OPEN_TEMPLATE_EVENT = 'flyto:reports-open-template'

// ── Audience presets ──────────────────────────────────────────
//
// Each audience maps to a concrete preset template id that already
// exists in REPORT_TEMPLATES. `pickTemplate` resolves the first
// matching id that is actually present so a renamed/removed template
// degrades gracefully (falls back to the first template of that
// category, then the first template overall).

interface AudiencePreset {
  id: 'board' | 'soc' | 'external' | 'compliance'
  icon: typeof Presentation
  titleKey: string
  titleFallback: string
  blurbKey: string
  blurbFallback: string
  /** Preferred backing template ids, in priority order. */
  templateIds: string[]
  category: ReportTemplate['category']
  /** Per-audience hue (a tint only — never painted as a raw surface). */
  tint: string
}

const AUDIENCES: AudiencePreset[] = [
  {
    id: 'board',
    icon: Presentation,
    titleKey: 'reports.audience.board', titleFallback: 'Board / Executive',
    blurbKey: 'reports.audience.boardBlurb',
    blurbFallback: 'One-page posture, grade trend and top risks — framed for leadership.',
    templateIds: ['security-audit', 'security-trend'],
    category: 'security',
    tint: colors.brandDeep,
  },
  {
    id: 'soc',
    icon: ShieldAlert,
    titleKey: 'reports.audience.soc', titleFallback: 'SOC / Operations',
    blurbKey: 'reports.audience.socBlurb',
    blurbFallback: 'Severity distribution, active findings and blast-radius detail for responders.',
    templateIds: ['vulnerability-assessment', 'ctem-pentest'],
    category: 'security',
    tint: colors.semantic.danger,
  },
  {
    id: 'external',
    icon: Globe,
    titleKey: 'reports.audience.external', titleFallback: 'External / Customer',
    blurbKey: 'reports.audience.externalBlurb',
    blurbFallback: 'Attack-surface posture and assurance summary suitable to share externally.',
    templateIds: ['ctem-posture', 'security-audit'],
    category: 'ctem',
    tint: colors.section.exposure,
  },
  {
    id: 'compliance',
    icon: ClipboardCheck,
    titleKey: 'reports.audience.compliance', titleFallback: 'Compliance / Audit',
    blurbKey: 'reports.audience.complianceBlurb',
    blurbFallback: 'Framework coverage and control evidence mapped from findings.',
    templateIds: ['compliance-owasp', 'compliance-iso27001', 'compliance-soc2'],
    category: 'compliance',
    tint: colors.semantic.success,
  },
]

function pickTemplate(p: AudiencePreset): ReportTemplate {
  for (const id of p.templateIds) {
    const t = REPORT_TEMPLATES.find(x => x.id === id)
    if (t) return t
  }
  return (
    REPORT_TEMPLATES.find(x => x.category === p.category) ??
    REPORT_TEMPLATES[0]
  )
}

export interface ReportsManagerViewProps {
  /** Switch the page to engineer mode and deep-link to a template. */
  onOpenInEditor: (templateId: string) => void
}

const ACCENT = colors.brandDeep

export function ReportsManagerView({ onOpenInEditor }: ReportsManagerViewProps) {
  const { org } = useOrg()
  const orgId = org?.id ?? ''

  const scoreQ = useQuery({
    queryKey: qk.computedScore(orgId),
    queryFn: () => getComputedScore(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const histQ = useQuery({
    queryKey: qk.scoring.scoreHistory(orgId, 90),
    queryFn: () => getUnifiedScoreHistory(orgId, 90),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const score = scoreQ.data
  const hasScore = !!score && score.score_available !== false && score.overall_display != null

  const trend = useMemo(() => {
    const entries = [...(histQ.data?.entries ?? [])].sort(
      (a, b) => new Date(a.computedAt).getTime() - new Date(b.computedAt).getTime(),
    )
    return {
      categories: entries.map(e => new Date(e.computedAt).toLocaleDateString()),
      values: entries.map(e => Math.round(e.overallDisplay)),
    }
  }, [histQ.data])

  const prevScore = useMemo(() => {
    const e = histQ.data?.entries
    if (!e || e.length < 2) return null
    const sorted = [...e].sort(
      (a, b) => new Date(b.computedAt).getTime() - new Date(a.computedAt).getTime(),
    )
    return Math.round(sorted[1].overallDisplay)
  }, [histQ.data])

  const categoryData: DonutDatum[] = useMemo(() => {
    return (score?.categories ?? [])
      .filter(c => c.display != null)
      .map(c => ({ label: c.label, value: Math.round(c.display ?? 0) }))
  }, [score])

  const loading = scoreQ.isLoading

  const scoreNow = hasScore ? Math.round(score!.overall_display!) : null
  const scoreDelta = scoreNow != null && prevScore != null ? scoreNow - prevScore : null

  return (
    // ManagerDashboard owns its shell (fixed header + inner scroll); the old
    // height:100%+overflow:auto wrapper forced the whole view to scroll as
    // one block (operator: 整體不滾動,局部滾動).
    <ManagerDashboard
        title={t('reports.mgr.title')}
        subtitle={t('reports.mgr.subtitle')}
        accent={ACCENT}
        titleIcon={<FileText size={20} />}
        layout="dashboard"
        hero={
          <ManagerHero
            accent={ACCENT}
            icon={<FileText size={15} />}
            minHeight={220}
            visual={
              <AudienceDeck onOpenInEditor={onOpenInEditor} />
            }
            headline={{
              label: t('reports.mgr.heroLabel'),
              value: AUDIENCES.length,
              unit: t('reports.mgr.presetsUnit'),
              sub: (
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: colors.semantic.success }}>
                    <Activity size={13} />
                    {t('reports.mgr.liveFeeding')}
                  </Box>
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    {hasScore
                      ? `· ${t('reports.mgr.posture')} ${scoreNow}/100${score!.overall_grade ? ` (${score!.overall_grade})` : ''}${score ? ` · ${score.active_count}/${score.total_count} ${t('reports.mgr.dims')}` : ''}`
                      : `· ${t('reports.mgr.noScoreYet')}`}
                  </Box>
                </Box>
              ),
              delta: scoreDelta != null && scoreDelta !== 0 ? (
                <Chip
                  size="small"
                  icon={scoreDelta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                  label={`${scoreDelta > 0 ? '+' : ''}${scoreDelta} 90d`}
                  sx={{
                    fontWeight: 700, fontSize: 12,
                    bgcolor: alpha(scoreDelta > 0 ? colors.semantic.success : colors.semantic.danger, 0.14),
                    color: scoreDelta > 0 ? colors.semantic.success : colors.semantic.danger,
                    '& .MuiChip-icon': { color: 'inherit' },
                  }}
                />
              ) : undefined,
            }}
          />
        }
        kpis={
          <>
            <KpiCard
              label={t('reports.mgr.kpiPosture')}
              value={hasScore ? Math.round(score!.overall_display!) : null}
              unit="/ 100"
              previous={prevScore}
              sparkline={trend.values.length > 1 ? trend.values : undefined}
              loading={loading}
              empty={!loading && !hasScore}
              emptyHint={t('reports.mgr.noScore')}
            />
            <KpiCard
              label={t('reports.mgr.kpiGrade')}
              value={hasScore ? (score!.overall_grade ?? '—') : null}
              loading={loading}
              empty={!loading && !hasScore}
              emptyHint={t('reports.mgr.pending')}
            />
            <KpiCard
              label={t('reports.mgr.kpiPresets')}
              value={AUDIENCES.length}
              loading={false}
            />
            <KpiCard
              label={t('reports.mgr.kpiActiveDims')}
              value={score ? score.active_count : null}
              unit={score ? tOr('reports.mgr.ofN', `of ${score.total_count}`) : undefined}
              loading={loading}
            />
          </>
        }
        charts={
          <>
            <ChartCard title={t('reports.mgr.chartTrend')}>
              {trend.values.length > 1 ? (
                <TrendChart
                  categories={trend.categories}
                  series={[{ name: t('reports.mgr.posture'), data: trend.values }]}
                  yMin={0}
                  yMax={100}
                  height={240}
                />
              ) : (
                <EmptyChart text={t('reports.mgr.notEnoughTrend')} />
              )}
            </ChartCard>

            <ChartCard title={t('reports.mgr.chartCats')}>
              {categoryData.length > 0 ? (
                <DonutChart data={categoryData} totalLabel={t('reports.mgr.dims')} height={240} />
              ) : (
                <EmptyChart text={t('reports.mgr.noCats')} />
              )}
            </ChartCard>
          </>
        }
        narrative={
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <FileText size={16} />
              {t('reports.mgr.howTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
              {t('reports.mgr.howBody')}
            </Typography>
          </Box>
        }
      />
  )
}

function EmptyChart({ text }: { text: string }) {
  return (
    <Box sx={{ height: 240, display: 'grid', placeItems: 'center' }}>
      <Typography variant="body2" color="text.secondary">{text}</Typography>
    </Box>
  )
}

/**
 * AudienceDeck — the hero's focal visual: the 4 audience presets as a
 * large, icon-led, per-audience-tinted card grid. This is the page's
 * 重點 — the primary thing a manager acts on. Each card is the full
 * preset (icon, title, blurb, backing template, open-in-editor), tinted
 * with its audience hue (tint applied only as alpha()/border accent —
 * surfaces stay theme palette for dual-mode safety).
 */
function AudienceDeck({ onOpenInEditor }: { onOpenInEditor: (templateId: string) => void }) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 620,
        minWidth: 0,
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
        gap: 1.5,
      }}
    >
      {AUDIENCES.map((a) => {
        const tpl = pickTemplate(a)
        const Icon = a.icon
        return (
          <Box
            key={a.id}
            sx={{
              display: 'flex', flexDirection: 'column', gap: 0.75,
              p: 1.5, borderRadius: 2,
              border: '1px solid',
              borderColor: alpha(a.tint, dark ? 0.35 : 0.3),
              bgcolor: alpha(a.tint, dark ? 0.1 : 0.06),
              transition: 'border-color .15s, box-shadow .15s',
              '&:hover': {
                borderColor: a.tint,
                boxShadow: `0 0 0 1px ${alpha(a.tint, 0.4)}`,
              },
            }}
          >
            <Box
              sx={{
                width: 32, height: 32, borderRadius: 1.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: alpha(a.tint, dark ? 0.18 : 0.12), color: a.tint,
              }}
            >
              <Icon size={18} />
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: 14, mt: 0.25 }}>
              {tOr(a.titleKey, a.titleFallback)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45, flex: 1 }}>
              {tOr(a.blurbKey, a.blurbFallback)}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
              {tpl.nameKey ? tOr(tpl.nameKey, tpl.name) : tpl.name}
            </Typography>
            <Button
              size="small"
              variant="text"
              endIcon={<ArrowRight size={14} />}
              onClick={() => onOpenInEditor(tpl.id)}
              sx={{
                textTransform: 'none', fontWeight: 600, alignSelf: 'flex-start', mt: 0.25,
                color: a.tint,
                '&:hover': { bgcolor: alpha(a.tint, 0.1) },
              }}
            >
              {t('reports.mgr.openInEditor')}
            </Button>
          </Box>
        )
      })}
    </Box>
  )
}
