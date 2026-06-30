/**
 * VAReportManagerView — manager-mode framing of the Vulnerability
 * Assessment deliverable.
 *
 * The VA report itself is an engineer artifact (server-rendered HTML /
 * PDF via POST /reports/build, template_id=external_ctem). Managers
 * rarely need the raw inline iframe; they want the headline posture and
 * a one-click way to grab the signed deliverable for a board pack.
 *
 * This surface therefore:
 *   - shows the org posture KPIs sourced from the REAL computed-score
 *     endpoint (GET /score/computed) — the same numbers the report's
 *     cover page summarises;
 *   - offers the same Download PDF / Open HTML actions, hitting the
 *     identical /reports/build endpoint the engineer view uses (so the
 *     bytes are byte-identical, no divergent render path).
 *
 * Client functions imported by DIRECT FILE PATH per the parallel-safety
 * decoupling rule.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { alpha, useTheme } from '@mui/material/styles'
import { Download, ExternalLink, FileText, Building2, CalendarDays, Layers, ShieldAlert } from 'lucide-react'

import { ManagerDashboard, ChartCard, KpiCard, GaugeChart, ManagerHero, HeroStat } from '@compounds/_shared'
import { t } from '@lib/i18n';
import { colors } from '@/styles/designTokens'

import { useOrg } from '@hooks/useOrg'
import { qk } from '@lib/queryKeys'
import { getComputedScore } from '@lib/engine/scoring/scoring'
import { buildReportHTML, downloadBuiltReport } from '@lib/engine/reports/vaReport'

const ACCENT = colors.tech

const TEMPLATE_ID = 'external_ctem'

export function VAReportManagerView() {
  const { org } = useOrg()
  const orgId = org?.id
  const orgName = org?.name
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const { enqueueSnackbar } = useSnackbar()
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  const scoreQ = useQuery({
    queryKey: qk.computedScore(orgId),
    queryFn: () => getComputedScore(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const score = scoreQ.data
  const hasScore = !!score && score.score_available !== false && score.overall_display != null
  const loading = scoreQ.isLoading

  const handleDownloadPdf = async () => {
    if (!orgId) return
    setDownloadingPdf(true)
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      const orgSlug = (orgName ?? 'org').toLowerCase().replace(/[^a-z0-9]+/g, '-')
      await downloadBuiltReport(orgId, { template_id: TEMPLATE_ID }, `va-report-${orgSlug}-${stamp}`)
      enqueueSnackbar(t('history.pdfDownloaded'), { variant: 'success' })
    } catch (e) {
      const err = e as Error
      enqueueSnackbar(err.message || 'PDF generation failed', { variant: 'error' })
    } finally {
      setDownloadingPdf(false)
    }
  }

  const handleOpenHtml = async () => {
    if (!orgId) return
    // Open the tab synchronously inside the click gesture so popup
    // blockers don't intercept (same pattern as the engineer view).
    const win = window.open('', '_blank')
    if (!win) {
      enqueueSnackbar('Browser blocked the report tab — allow popups for this site', {
        variant: 'error',
      })
      return
    }
    win.opener = null
    win.document.write(
      '<!doctype html><meta charset="utf-8"><title>Generating…</title>' +
        '<p style="font-family:system-ui;padding:24px">Generating report…</p>',
    )
    try {
      const html = await buildReportHTML(orgId, { template_id: TEMPLATE_ID })
      win.document.open()
      win.document.write(html)
      win.document.close()
    } catch (e) {
      win.close()
      const err = e as Error
      enqueueSnackbar(err.message || 'HTML open failed', { variant: 'error' })
    }
  }

  if (!orgId) return null

  const reportDate = new Date().toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  const scoreNow = hasScore ? Math.round(score!.overall_display!) : null
  const grade = hasScore ? (score!.overall_grade ?? scoreNow) : '—'

  return (
    <ManagerDashboard
      title={t('vaReport.title')}
      subtitle={t('vaReport.managerSubtitle')}
      accent={ACCENT}
      titleIcon={<FileText size={20} />}
      layout="hero-split"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<FileText size={15} />}
          minHeight={210}
          visual={
            hasScore ? (
              <Box
                sx={{
                  // Document-cover treatment around the board-ready grade gauge.
                  borderRadius: 2,
                  p: 2,
                  background: dark
                    ? `linear-gradient(160deg, ${alpha(ACCENT, 0.14)}, ${alpha(ACCENT, 0.04)})`
                    : `linear-gradient(160deg, ${alpha(ACCENT, 0.1)}, ${alpha(ACCENT, 0.02)})`,
                  border: `1px solid ${alpha(ACCENT, dark ? 0.3 : 0.22)}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0.5,
                }}
              >
                <Typography
                  sx={{
                    fontSize: 12, fontWeight: 800, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: ACCENT,
                  }}
                >
                  {t('vaReport.coverLabel')}
                </Typography>
                <GaugeChart
                  value={scoreNow!}
                  max={100}
                  label={score!.overall_grade ?? 'Score'}
                  grade={score!.overall_grade ?? undefined}
                  height={188}
                />
                <Typography sx={{ fontSize: 12, color: 'text.secondary', textAlign: 'center', maxWidth: 200 }} noWrap>
                  {orgName ?? 'Organization'} · {reportDate}
                </Typography>
              </Box>
            ) : undefined
          }
          headline={{
            label: t('vaReport.heroLabel'),
            value: grade,
            sub: hasScore
              ? `${scoreNow}/100 posture · ${score!.active_count} of ${score!.total_count} dimensions assessed. Generate the signed PDF for your board pack.`
              : 'Run a scan to generate the assessment, then download the signed report.',
            delta: (
              <Button
                variant="contained"
                startIcon={<Download size={16} />}
                onClick={handleDownloadPdf}
                disabled={downloadingPdf || !orgId}
                sx={{
                  bgcolor: ACCENT,
                  fontWeight: 700,
                  boxShadow: `0 0 24px ${alpha(ACCENT, 0.4)}`,
                  '&:hover': { bgcolor: colors.techDeep },
                }}
              >
                {downloadingPdf ? 'Generating…' : t('vaReport.downloadPdf')}
              </Button>
            ),
          }}
          aside={
            <Box>
              <Typography
                sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary', mb: 0.5 }}
              >
                {t('vaReport.insideReport')}
              </Typography>
              <HeroStat
                icon={<Building2 size={14} />}
                tone={ACCENT}
                label={t('vaReport.kpiPostureScore')}
                value={scoreNow ?? '—'}
              />
              <HeroStat
                icon={<Layers size={14} />}
                tone={ACCENT}
                label={t('vaReport.kpiActiveDimensions')}
                value={score ? `${score.active_count}/${score.total_count}` : '—'}
              />
              <HeroStat
                icon={<ShieldAlert size={14} />}
                tone={ACCENT}
                label={t('vaReport.kpiCrossDimensionPenalty')}
                value={score ? Math.round(score.cross_dim.total) : '—'}
              />
              <HeroStat
                icon={<CalendarDays size={14} />}
                tone={ACCENT}
                label={t('vaReport.asOf')}
                value={<Box component="span" sx={{ fontSize: 13 }}>{reportDate}</Box>}
              />
            </Box>
          }
        />
      }
      actions={
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" startIcon={<ExternalLink size={14} />} onClick={handleOpenHtml}>
            {t('vaReport.openHtml')}
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<Download size={14} />}
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
          >
            {downloadingPdf ? 'Generating…' : t('vaReport.downloadPdf')}
          </Button>
        </Box>
      }
      kpis={
        <>
          <KpiCard
            label={t('vaReport.kpiPostureScore')}
            value={hasScore ? Math.round(score!.overall_display!) : null}
            unit="/ 100"
            loading={loading}
            empty={!loading && !hasScore}
            emptyHint="No score yet"
          />
          <KpiCard
            label="Grade"
            value={hasScore ? (score!.overall_grade ?? '—') : null}
            loading={loading}
            empty={!loading && !hasScore}
            emptyHint="Pending first scan"
          />
          <KpiCard
            label={t('vaReport.kpiActiveDimensions')}
            value={score ? score.active_count : null}
            unit={score ? `of ${score.total_count}` : undefined}
            loading={loading}
          />
          <KpiCard
            label={t('vaReport.kpiCrossDimensionPenalty')}
            value={score ? Math.round(score.cross_dim.total) : null}
            invertDelta
            loading={loading}
          />
        </>
      }
      charts={
        <ChartCard title={t('vaReport.chartReportContents')}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, py: 1 }}>
            {[
              { label: t('vaReport.sectionCover'), on: hasScore },
              { label: t('vaReport.sectionFindings'), on: hasScore },
              { label: t('vaReport.sectionPosture'), on: hasScore },
              { label: t('vaReport.sectionCompliance'), on: hasScore },
            ].map((row) => (
              <Box key={String(row.label)} sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Box
                  sx={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    bgcolor: row.on ? ACCENT : alpha(theme.palette.text.primary, 0.2),
                  }}
                />
                <Typography variant="body2" color={row.on ? 'text.primary' : 'text.secondary'}>
                  {row.label}
                </Typography>
              </Box>
            ))}
            {!hasScore && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                {t('vaReport.noScoreYet')}
              </Typography>
            )}
          </Box>
        </ChartCard>
      }
      narrative={
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            About this deliverable
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The Vulnerability Assessment report is rendered server-side from the{' '}
            <code>external_ctem</code> template — combined DAST findings, posture, and compliance
            status — and is byte-identical whether you download it here or in engineer mode. Use{' '}
            <strong>{t('vaReport.downloadPdf')}</strong> for the signed board-pack copy, or <strong>{t('vaReport.openHtml')}</strong>{' '}
            for a quick read. Switch to engineer mode (top bar) to preview the full report inline.
          </Typography>
        </Box>
      }
    />
  )
}
