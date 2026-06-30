import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import {
  Box, Button, Tooltip, Typography, Chip,
} from '@mui/material'
import {
  Download, ExternalLink, RefreshCw, Clock, AlertTriangle,
  Globe2,
} from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { buildReportHTML, downloadBuiltReport } from '@lib/engine'
import { getExternalPosture } from '@compounds/_shared/externalPosture'
import { useOrg } from '@hooks/useOrg'
import { SkeletonRows } from '@atoms/Skeleton'
import { JellyCard } from '@atoms/JellyCard'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { GradeCircle } from '@compounds/_shared/GradeCircle'
import { displayScore, GRADE_COLORS } from '@compounds/_shared/scoring'
import { colors, softBg } from '@/styles/designTokens'
import { flytoTextStyles } from '@/styles/visualSystem'

const TEMPLATE_ID = 'external_ctem'
const ACCENT = colors.tech         // '#06b6d4' — CTEM/external cyan

// ── popup helpers (security-sandboxed) ──────────────────────────────────────

function clearReportWindow(win: Window, title: string) {
  const doc = win.document
  doc.title = title
  doc.documentElement.style.height = '100%'
  doc.body.replaceChildren()
  doc.body.style.margin = '0'
  doc.body.style.height = '100%'
  doc.body.style.background = '#fff'
  doc.body.style.color = '#111827'
  doc.body.style.fontFamily = 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  return doc
}

function renderReportLoading(win: Window) {
  const doc = clearReportWindow(win, 'Generating...')
  const status = doc.createElement('p')
  status.textContent = 'Generating report...'
  status.style.margin = '0'
  status.style.padding = '24px'
  status.style.fontSize = '14px'
  doc.body.appendChild(status)
}

function renderSandboxedReport(win: Window, html: string) {
  const doc = clearReportWindow(win, 'Vulnerability Assessment Report')
  const frame = doc.createElement('iframe')
  frame.title = t('vaReport.previewTitle')
  frame.setAttribute('sandbox', '')
  frame.referrerPolicy = 'no-referrer'
  frame.srcdoc = html
  frame.style.width = '100%'
  frame.style.height = '100%'
  frame.style.border = '0'
  frame.style.display = 'block'
  doc.body.appendChild(frame)
}

// ── main view ────────────────────────────────────────────────────────────────

export function VAReportView() {
  const { org } = useOrg()
  const orgId = org?.id
  const { enqueueSnackbar } = useSnackbar()
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  const postureQ = useQuery({
    queryKey: qk.externalPosture(orgId),
    queryFn: () => getExternalPosture(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const handleDownloadPdf = async () => {
    if (!orgId) return
    setDownloadingPdf(true)
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      const orgSlug = (org?.name ?? 'org').toLowerCase().replace(/[^a-z0-9]+/g, '-')
      await downloadBuiltReport(orgId, { template_id: TEMPLATE_ID }, `va-report-${orgSlug}-${stamp}`)
      enqueueSnackbar(t('vaReport.pdfDownloaded'), { variant: 'success' })
    } catch (e) {
      enqueueSnackbar((e as Error).message || t('vaReport.pdfFailed'), { variant: 'error' })
    } finally {
      setDownloadingPdf(false)
    }
  }

  const handleOpenHtml = async () => {
    if (!orgId) return
    const win = window.open('', '_blank')
    if (!win) {
      enqueueSnackbar(
        t('vaReport.popupBlocked'),
        { variant: 'error' },
      )
      return
    }
    win.opener = null
    renderReportLoading(win)
    try {
      const html = await buildReportHTML(orgId, { template_id: TEMPLATE_ID })
      renderSandboxedReport(win, html)
    } catch (e) {
      win.close()
      enqueueSnackbar((e as Error).message || t('vaReport.htmlFailed'), { variant: 'error' })
    }
  }

  if (!orgId) return null

  const data = postureQ.data
  const hasScore = !!data && data.score_available !== false && data.avg_score != null && data.avg_grade !== ''
  const gc = hasScore ? (GRADE_COLORS[data!.avg_grade] ?? '#94a3b8') : '#94a3b8'
  const rs = data?.risk_summary

  const critCount = rs?.critical_count ?? 0
  const highCount  = rs?.high_count  ?? 0
  const medCount   = rs?.medium_count ?? 0
  // low_count may not be in the typed surface yet — safe optional access
  const lowCount = (rs as Record<string, number> | undefined)?.low_count ?? 0
  const totalFindings = critCount + highCount + medCount + lowCount || 1

  const sevBars = [
    { key: 'critical', label: 'CRITICAL', count: critCount, tone: colors.severity.critical },
    { key: 'high',     label: 'HIGH',     count: highCount,  tone: colors.severity.high },
    { key: 'medium',   label: 'MEDIUM',   count: medCount,   tone: colors.severity.medium },
    { key: 'low',      label: 'LOW',      count: lowCount,   tone: colors.semantic.neutral },
  ]

  const domains = data?.domains ?? []

  const pulseAnim = {
    animation: 'va-pulse 2.2s ease-in-out infinite',
    '@keyframes va-pulse': {
      '0%, 100%': { opacity: 1 },
      '50%': { opacity: 0.35 },
    },
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      <Box sx={{ flexShrink: 0, px: { xs: 2, md: 4 }, pt: { xs: 2, md: 3 }, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <FlytoPageHeader
          title={t('vaReport.title')}
          subtitle={t('vaReport.subtitle2')}
          bottomGap={0}
          count={orgId ? (
            <Chip
              size="small"
              label={`SCAN-${orgId.slice(0, 8).toUpperCase()}`}
              sx={{ borderRadius: 1, fontWeight: 700, color: ACCENT, borderColor: softBg(ACCENT, 0.3) }}
              variant="outlined"
            />
          ) : undefined}
          action={(
            <>
              <Chip
                size="small"
                color="success"
                label={t('status.running')}
                sx={{ borderRadius: 1, fontWeight: 700 }}
              />
            <Tooltip title={t('vaReport.regenerate')}>
              <span>
                <Button
                  size="small"
                  startIcon={<RefreshCw size={13} />}
                  onClick={() => postureQ.refetch()}
                  disabled={postureQ.isFetching}
                >
                  {t('common.refresh')}
                </Button>
              </span>
            </Tooltip>
            <Button
              size="small"
              startIcon={<ExternalLink size={13} />}
              onClick={handleOpenHtml}
            >
              {t('vaReport.openHtml')}
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<Download size={13} />}
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
            >
              {downloadingPdf ? t('vaReport.generating') : t('vaReport.downloadPdf')}
            </Button>
            </>
          )}
        />
      </Box>

      {/* ── Scrollable body ──────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', bgcolor: 'background.default' }}>
        {postureQ.isLoading ? (
          <Box sx={{ p: 3, maxWidth: 1080, mx: 'auto' }}><SkeletonRows rows={12} /></Box>
        ) : postureQ.isError ? (
          <Box sx={{ p: 3, maxWidth: 1080, mx: 'auto' }}>
            <Box sx={{
              p: 2, borderRadius: 2,
              border: `1px solid ${softBg(colors.semantic.danger, 0.3)}`,
              bgcolor: softBg(colors.semantic.danger, 0.06),
              borderLeft: `4px solid ${colors.semantic.danger}`,
            }}>
              <Typography color="error" variant="body2" sx={flytoTextStyles.codeSmall}>
                {(postureQ.error as Error | undefined)?.message ?? t('vaReport.loadFailed')}
              </Typography>
              <Button
                size="small"
                startIcon={<RefreshCw size={13} />}
                onClick={() => postureQ.refetch()}
                sx={{ mt: 1, ...flytoTextStyles.codeSmall, fontSize: 12, textTransform: 'none' }}
              >
                {t('common.retry')}
              </Button>
            </Box>
          </Box>
        ) : (
          <Box sx={{ maxWidth: 1080, mx: 'auto', px: { xs: 2, md: 3 }, py: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <JellyCard delay={0} noHover>
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1.3fr 1fr' },
                gap: 2,
                alignItems: 'stretch',
              }}>
                <Box sx={{
                  p: 2,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: softBg(ACCENT, 0.24),
                  bgcolor: softBg(ACCENT, 0.05),
                }}>
                  <Typography sx={{
                    ...flytoTextStyles.codeSmall,
                    fontSize: 13,
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: ACCENT,
                    mb: 1,
                  }}>
                    {t('vaReport.executiveSummary')}
                  </Typography>
                  <Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.65 }}>
                    {t('vaReport.executiveSummaryBody')}
                  </Typography>
                </Box>

                <Box sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 1,
                }}>
                  {[
                    { label: 'Domains', value: String(data?.domain_count ?? domains.length), tone: ACCENT },
                    { label: 'Critical', value: String(critCount), tone: colors.severity.critical },
                    { label: 'High', value: String(highCount), tone: colors.severity.high },
                    { label: 'Posture', value: hasScore ? displayScore(data!.avg_score!) : 'N/A', tone: gc },
                  ].map((metric) => (
                    <Box key={metric.label} sx={{
                      p: 1.25,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: softBg(metric.tone, 0.24),
                      bgcolor: softBg(metric.tone, 0.05),
                    }}>
                      <Typography sx={{
                        ...flytoTextStyles.codeSmall,
                        fontSize: 12,
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: metric.tone,
                      }}>
                        {metric.label}
                      </Typography>
                      <Typography sx={{
                        mt: 0.5,
                        ...flytoTextStyles.codeSmall,
                        fontSize: 22,
                        fontWeight: 800,
                        color: metric.tone,
                        lineHeight: 1,
                      }}>
                        {metric.value}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            </JellyCard>

            {/* ── KPI strip ─────────────────────────────────────────────── */}
            <JellyCard delay={0.04} noHover>
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 1.5,
              }}>
                {[
                  {
                    label: 'DOMAINS',
                    value: String(data?.domain_count ?? '—'),
                    tone: ACCENT,
                    sub: undefined as string | undefined,
                  },
                  {
                    label: 'CRITICAL',
                    value: String(critCount),
                    tone: colors.severity.critical,
                    sub: undefined,
                  },
                  {
                    label: 'HIGH',
                    value: String(highCount),
                    tone: colors.severity.high,
                    sub: undefined,
                  },
                  {
                    label: 'POSTURE',
                    value: hasScore ? displayScore(data!.avg_score!) : '—',
                    tone: gc,
                    sub: hasScore ? data!.avg_grade : undefined,
                  },
                ].map((kpi) => (
                  <Box key={kpi.label} sx={{
                    px: 2, py: 1.75, borderRadius: 2,
                    border: '1px solid', borderColor: softBg(kpi.tone, 0.25),
                    bgcolor: softBg(kpi.tone, 0.06),
                    backgroundImage: `linear-gradient(135deg, ${softBg(kpi.tone, 0.05)} 0%, transparent 60%)`,
                  }}>
                    <Typography sx={{
                      ...flytoTextStyles.codeSmall, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
                      textTransform: 'uppercase', color: kpi.tone, mb: 0.5,
                    }}>
                      {kpi.label}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
                      <Typography sx={{
                        ...flytoTextStyles.codeSmall, fontSize: 28, fontWeight: 800, lineHeight: 1,
                        color: kpi.tone, fontVariantNumeric: 'tabular-nums',
                        textShadow: `0 0 18px ${softBg(kpi.tone, 0.55)}`,
                      }}>
                        {kpi.value}
                      </Typography>
                      {kpi.sub && (
                        <Typography sx={{ ...flytoTextStyles.codeSmall, fontSize: 16, fontWeight: 700, color: kpi.tone, opacity: 0.65 }}>
                          {kpi.sub}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            </JellyCard>

            {/* ── Score ring + severity fill bars ───────────────────────── */}
            <JellyCard delay={0.06} noHover>
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '196px 1fr' },
                border: '1px solid', borderColor: 'divider', borderRadius: 2,
                overflow: 'hidden', bgcolor: 'background.paper',
              }}>
                {/* Score ring (left) */}
                <Box sx={{
                  p: 2.5,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                  borderRight: { sm: '1px solid' }, borderBottom: { xs: '1px solid', sm: 'none' },
                  borderColor: 'divider',
                  backgroundImage: `linear-gradient(160deg, ${softBg(ACCENT, 0.07)} 0%, transparent 65%)`,
                  position: 'relative', overflow: 'hidden',
                }}>
                  {/* watermark */}
                  <Typography sx={{
                    position: 'absolute', bottom: 10, right: 10,
                    ...flytoTextStyles.codeSmall, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: ACCENT, opacity: 0.2,
                    userSelect: 'none',
                  }}>
                    POSTURE
                  </Typography>

                  {hasScore ? (
                    <>
                      {/* GradeCircle with glow halo */}
                      <Box sx={{
                        position: 'relative',
                        '&::after': {
                          content: '""', position: 'absolute',
                          inset: -8, borderRadius: '50%',
                          boxShadow: `0 0 32px ${softBg(gc, 0.55)}`,
                          pointerEvents: 'none',
                        },
                      }}>
                        <GradeCircle grade={data!.avg_grade} color={gc} size={72} />
                      </Box>
                      <Typography sx={{
                        ...flytoTextStyles.codeSmall, fontSize: 38, fontWeight: 800, lineHeight: 1,
                        color: gc, fontVariantNumeric: 'tabular-nums',
                        textShadow: `0 0 24px ${softBg(gc, 0.65)}`,
                      }}>
                        {displayScore(data!.avg_score!)}
                      </Typography>
                      <Typography sx={{ ...flytoTextStyles.codeSmall, fontSize: 12, color: 'text.secondary', letterSpacing: '0.05em' }}>
                        {data!.domain_count} {t('external.domains')}
                      </Typography>
                    </>
                  ) : (
                    <Typography sx={{ ...flytoTextStyles.codeSmall, fontSize: 13, color: 'text.secondary', textAlign: 'center' }}>
                      {data?.message ?? t('external.noScoreYet')}
                    </Typography>
                  )}
                </Box>

                {/* Severity fill bars (right) */}
                <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
                  <Typography sx={{
                    ...flytoTextStyles.codeSmall, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: 'text.secondary', mb: 0.25,
                  }}>
                    Risk Breakdown
                  </Typography>

                  {sevBars.map((sev) => {
                    const pct = Math.max(2, Math.round((sev.count / totalFindings) * 100))
                    return (
                      <Box key={sev.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Typography sx={{
                          ...flytoTextStyles.codeSmall, fontSize: 12, fontWeight: 700,
                          color: sev.count > 0 ? sev.tone : 'text.disabled',
                          width: 70, flexShrink: 0, letterSpacing: '0.05em',
                        }}>
                          {sev.label}
                        </Typography>

                        {/* Track */}
                        <Box sx={{ flex: 1, position: 'relative', height: 8, borderRadius: 1, bgcolor: softBg(sev.tone, 0.08) }}>
                          {/* Fill */}
                          <Box sx={{
                            position: 'absolute', left: 0, top: 0, bottom: 0,
                            width: sev.count > 0 ? `${pct}%` : '0%',
                            borderRadius: 1,
                            background: `linear-gradient(90deg, ${sev.tone}, ${softBg(sev.tone, 0.55)})`,
                            boxShadow: sev.count > 0 ? `0 0 10px ${softBg(sev.tone, 0.55)}` : 'none',
                            transition: 'width 0.9s cubic-bezier(.16,1,.3,1)',
                          }} />
                        </Box>

                        <Typography sx={{
                          ...flytoTextStyles.codeSmall, fontSize: 14, fontWeight: 800, width: 28,
                          textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                          color: sev.count > 0 ? sev.tone : 'text.disabled',
                          textShadow: sev.count > 0 ? `0 0 8px ${softBg(sev.tone, 0.5)}` : 'none',
                        }}>
                          {sev.count}
                        </Typography>
                      </Box>
                    )
                  })}
                </Box>
              </Box>
            </JellyCard>

            {/* ── Domains table ─────────────────────────────────────────── */}
            {domains.length > 0 && (
              <JellyCard delay={0.12} noHover>
                <Box sx={{
                  border: '1px solid', borderColor: 'divider', borderRadius: 2,
                  overflow: 'hidden', bgcolor: 'background.paper',
                }}>
                  {/* Table head */}
                  <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 72px 130px 110px',
                    px: 2, py: 1.25,
                    borderBottom: '1px solid', borderColor: 'divider',
                    bgcolor: softBg(ACCENT, 0.05),
                    borderLeft: `3px solid ${ACCENT}`,
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Globe2 size={13} style={{ color: ACCENT }} />
                      <Typography sx={{ ...flytoTextStyles.codeSmall, fontSize: 12, fontWeight: 700, color: ACCENT, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                        {t('vaReport.domainsAssessed')}
                      </Typography>
                      <Chip
                        label={domains.length}
                        size="small"
                        sx={{
                          height: 18, ...flytoTextStyles.codeSmall, fontSize: 12, fontWeight: 700,
                          bgcolor: softBg(ACCENT, 0.12), color: ACCENT,
                          border: `1px solid ${softBg(ACCENT, 0.28)}`,
                        }}
                      />
                    </Box>
                    {(['ASSETS', 'FINDINGS', 'SCORE'] as const).map((h) => (
                      <Typography key={h} sx={{
                        ...flytoTextStyles.codeSmall, fontSize: 12, fontWeight: 700,
                        color: 'text.secondary', letterSpacing: '0.06em', textAlign: 'center',
                      }}>
                        {h}
                      </Typography>
                    ))}
                  </Box>

                  {/* Rows */}
                  {domains.map((d, idx) => {
                    const scored = data!.score_available !== false && !!d.grade
                    const gradeColor = scored ? (GRADE_COLORS[d.grade!] ?? '#94a3b8') : '#94a3b8'
                    const issues = d.issue_count ?? 0
                    const issueTone = issues >= 3
                      ? colors.severity.critical
                      : issues > 0
                        ? colors.severity.high
                        : colors.semantic.success

                    return (
                      <Box key={d.domain} sx={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 72px 130px 110px',
                        alignItems: 'center',
                        px: 2, py: 1.25,
                        borderBottom: idx < domains.length - 1 ? '1px solid' : 'none',
                        borderColor: 'divider',
                        transition: 'background 140ms',
                        '&:hover': {
                          bgcolor: softBg(ACCENT, 0.04),
                          borderLeft: `3px solid ${softBg(ACCENT, 0.5)}`,
                          pl: 'calc(16px - 3px)',
                        },
                      }}>
                        {/* Domain name */}
                        <Typography sx={{ ...flytoTextStyles.codeSmall, fontSize: 13, fontWeight: 600, color: ACCENT, minWidth: 0 }} noWrap>
                          {d.domain}
                        </Typography>

                        {/* Asset count */}
                        <Typography sx={{ ...flytoTextStyles.codeSmall, fontSize: 13, color: 'text.secondary', textAlign: 'center' }}>
                          {d.asset_count ?? 0}
                        </Typography>

                        {/* Findings pill */}
                        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                          {issues > 0 ? (
                            <Box sx={{
                              ...flytoTextStyles.codeSmall, fontSize: 12, fontWeight: 800,
                              px: 0.85, py: 0.25, borderRadius: 0.75,
                              bgcolor: softBg(issueTone, 0.12), color: issueTone,
                              border: `1px solid ${softBg(issueTone, 0.32)}`,
                              letterSpacing: '0.04em',
                              boxShadow: `0 0 8px ${softBg(issueTone, 0.3)}`,
                            }}>
                              {issues} {issues === 1 ? 'issue' : 'issues'}
                            </Box>
                          ) : (
                            <Typography sx={{
                              ...flytoTextStyles.codeSmall, fontSize: 12, fontWeight: 700,
                              color: scored ? colors.semantic.success : 'text.disabled',
                              textShadow: scored ? `0 0 8px ${softBg(colors.semantic.success, 0.5)}` : 'none',
                            }}>
                              {scored ? 'clean' : '—'}
                            </Typography>
                          )}
                        </Box>

                        {/* Grade + score */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: 'center' }}>
                          {scored ? (
                            <>
                              <Typography sx={{
                                ...flytoTextStyles.codeSmall, fontSize: 15, fontWeight: 800, color: gradeColor,
                                textShadow: `0 0 10px ${softBg(gradeColor, 0.5)}`,
                              }}>
                                {d.grade}
                              </Typography>
                              <Typography sx={{
                                ...flytoTextStyles.codeSmall, fontSize: 13, fontWeight: 700, color: gradeColor,
                                fontVariantNumeric: 'tabular-nums',
                              }}>
                                {displayScore(d.score ?? 0)}
                              </Typography>
                            </>
                          ) : (
                            <Typography sx={{ ...flytoTextStyles.codeSmall, fontSize: 13, color: 'text.disabled' }}>—</Typography>
                          )}
                        </Box>
                      </Box>
                    )
                  })}
                </Box>
              </JellyCard>
            )}

            {/* ── SLA breach callout ────────────────────────────────────── */}
            {(rs?.sla_breaches ?? 0) > 0 && (
              <JellyCard delay={0.18} noHover>
                <Box sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5,
                  px: 2, py: 1.5, borderRadius: 2,
                  border: '1px solid', borderColor: softBg(colors.semantic.danger, 0.4),
                  bgcolor: softBg(colors.semantic.danger, 0.06),
                  borderLeft: `4px solid ${colors.semantic.danger}`,
                }}>
                  <Box sx={{ color: colors.semantic.danger, ...pulseAnim }}>
                    <AlertTriangle size={16} />
                  </Box>
                  <Typography sx={{ ...flytoTextStyles.codeSmall, fontSize: 13, fontWeight: 700, color: colors.semantic.danger }}>
                    {rs!.sla_breaches} {t('vaReport.slaBreaches')}
                  </Typography>
                </Box>
              </JellyCard>
            )}

            {/* ── Signed report deliverable ────────────────────────────── */}
            <JellyCard delay={0.2} noHover>
              <Box sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                overflow: 'hidden',
                bgcolor: 'background.paper',
              }}>
                <Box sx={{
                  px: 2,
                  py: 1.25,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  bgcolor: softBg(ACCENT, 0.05),
                  borderLeft: `3px solid ${ACCENT}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1.5,
                  flexWrap: 'wrap',
                }}>
                  <Box>
                    <Typography sx={{
                      ...flytoTextStyles.codeSmall,
                      fontSize: 12,
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: ACCENT,
                    }}>
                      {t('vaReport.deliverable')}
                    </Typography>
                    <Typography sx={{ mt: 0.25, fontSize: 12, color: 'text.secondary' }}>
                      {t('vaReport.deliverableSubtitle')}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{
                  bgcolor: 'background.default',
                  p: { xs: 1.25, md: 2.5 },
                }}>
                  <Box sx={{
                    maxWidth: 940,
                    mx: 'auto',
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr' },
                    gap: 2,
                    alignItems: 'stretch',
                  }}>
                    <Box sx={{
                      p: 2,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: softBg(ACCENT, 0.24),
                      bgcolor: softBg(ACCENT, 0.05),
                    }}>
                      <Typography sx={{
                        ...flytoTextStyles.codeSmall,
                        fontSize: 12,
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: ACCENT,
                        mb: 1,
                      }}>
                        {t('vaReport.exportInputs')}
                      </Typography>
                      {[
                        { label: t('vaReport.inputPosture'), value: hasScore ? `${displayScore(data!.avg_score!)} ${data!.avg_grade}` : t('external.noScoreYet') },
                        { label: t('vaReport.inputDomains'), value: String(data?.domain_count ?? domains.length) },
                        { label: t('vaReport.inputFindings'), value: String(critCount + highCount + medCount + lowCount) },
                      ].map((row) => (
                        <Box key={row.label} sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 2,
                          py: 0.8,
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                          '&:last-child': { borderBottom: 0 },
                        }}>
                          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{row.label}</Typography>
                          <Typography sx={{ ...flytoTextStyles.codeSmall, fontSize: 13, fontWeight: 800, color: ACCENT }}>{row.value}</Typography>
                        </Box>
                      ))}
                    </Box>

                    <Box sx={{
                      p: 2,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 2,
                    }}>
                      <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.6 }}>
                        {t('vaReport.deliverableBody')}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Button
                          size="small"
                          startIcon={<ExternalLink size={13} />}
                          onClick={handleOpenHtml}
                          sx={{ ...flytoTextStyles.codeSmall, fontSize: 12, textTransform: 'none' }}
                        >
                          {t('vaReport.openSignedHtml')}
                        </Button>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<Download size={13} />}
                          onClick={handleDownloadPdf}
                          disabled={downloadingPdf}
                          sx={{
                            ...flytoTextStyles.codeSmall,
                            fontSize: 12,
                            fontWeight: 700,
                            textTransform: 'none',
                          }}
                        >
                          {downloadingPdf ? t('vaReport.generating') : t('vaReport.downloadSignedPdf')}
                        </Button>
                      </Box>
                    </Box>
                  </Box>
                </Box>
              </Box>
            </JellyCard>

            {/* ── Scan metadata footer ──────────────────────────────────── */}
            {data?.last_scan_at && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 0.5, pb: 1 }}>
                <Clock size={13} style={{ color: ACCENT, opacity: 0.65 }} />
                <Typography sx={{ ...flytoTextStyles.codeSmall, fontSize: 12, color: 'text.secondary' }}>
                  {t('external.lastScan')}: {new Date(data.last_scan_at).toLocaleString()}
                  {data.scan_cadence ? ` · ${data.scan_cadence}` : ''}
                </Typography>
              </Box>
            )}

          </Box>
        )}
      </Box>
    </Box>
  )
}
