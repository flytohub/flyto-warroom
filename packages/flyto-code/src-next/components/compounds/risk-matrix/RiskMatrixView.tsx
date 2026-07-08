/**
 * RiskMatrixView — the good/bad Asset Risk Matrix.
 *
 * A 2D grid that embodies the product principle: a green is held to the
 * SAME evidence bar as a red. Rows = asset importance
 * [critical, high, medium, low, unclassified]; cols = finding severity
 * [CRITICAL, HIGH, MEDIUM, LOW]. Each cell carries BOTH numbers:
 *   - bad_count  (red)   — open findings at this (importance × severity)
 *   - good_count (green) — EVIDENCE-GATED safe (resolved | empirical-
 *                          verified | feedback-suppressed)
 * so the good/bad duality lives in one cell, and a 0/0 cell is an
 * honest neutral blank — never a fabricated green.
 *
 * Cell background is color-graded by the engine-supplied `grade`
 * (good=green … bad=red) using SEMANTIC palette tokens (dual-mode, no
 * hardcoded hex). The 'unclassified' importance lane renders as a
 * distinct muted row and is NEVER color-graded as a risk — an
 * unclassified asset is a coverage gap, not a verdict.
 *
 * Each gradeable cell is clickable → routes to the timeline filtered to
 * that (importance, severity). Reference styling: the exposure
 * CrossDomainView pass/warn/fail grid.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  Tooltip,
  Button,
  alpha,
} from '@mui/material'
import { Grid3x3, ShieldCheck, ShieldAlert, HelpCircle, MapPin } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { getRiskMatrix } from '@lib/engine'
import { navigateToCTEMActions } from '@lib/warroomNav'
import type {
  RiskImportance,
  RiskSeverity,
  RiskGrade,
  RiskMatrixCell,
} from '@lib/engine'
import { GRADE_TONE, IMPORTANCE_TONE, SEVERITY_TONE, RAW } from '@lib/tokens/severity'
import type { Grade, Severity } from '@lib/tokens/severity'

const IMPORTANCE_ROWS: readonly RiskImportance[] = [
  'critical',
  'high',
  'medium',
  'low',
  'unclassified',
]
const SEVERITY_COLS: readonly RiskSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

// IMPORTANT: these MUST be render-time lookups, not module-level
// constants. tOr() reads a mutable translation cache that is empty at
// import time, so a module-level `const X = tOr(...)` permanently
// freezes the English fallback (see CLAUDE.md i18n §"created at render
// time"). Calling them inside the component fixes the "no translation"
// bug on the axis labels.
function importanceLabel(imp: RiskImportance): string {
  return tOr(`riskMatrix.imp.${imp}`, imp.charAt(0).toUpperCase() + imp.slice(1))
}
function severityLabel(sev: RiskSeverity): string {
  return tOr(`riskMatrix.sev.${sev.toLowerCase()}`, sev.charAt(0) + sev.slice(1).toLowerCase())
}

/**
 * Engine grade → token Grade. The engine emits 'none' for an
 * un-graded cell (honest zero); the token table has no 'none' entry,
 * so we route it to the neutral-empty tone. 'unclassified' rows are
 * handled separately (never graded), so this never receives them.
 */
function gradeToTone(grade: RiskGrade): Grade {
  switch (grade) {
    case 'good':
      return 'good'
    case 'fair':
      return 'fair'
    case 'warn':
      return 'warn'
    case 'bad':
      return 'bad'
    case 'neutral':
    case 'none':
    default:
      return ''
  }
}

export function RiskMatrixView() {
  const { org } = useOrg()
  const orgId = org?.id
  const navigate = useNavigate()

  const { data, isLoading, isError } = useQuery({
    queryKey: qk.history.riskMatrix(orgId),
    queryFn: () => getRiskMatrix(orgId!),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })

  // Index cells by "importance|severity" so we can render the canonical
  // 5×4 grid in a fixed order even if the engine emits them unsorted.
  // The engine always emits all 20 cells (honest zeros), but indexing
  // also makes a partial/legacy response degrade gracefully to neutral
  // blanks instead of throwing.
  const cellMap = useMemo(() => {
    const m = new Map<string, RiskMatrixCell>()
    for (const c of data?.cells ?? []) {
      m.set(`${c.importance}|${c.severity}`, c)
    }
    return m
  }, [data])

  const totals = useMemo(() => {
    let bad = 0
    let good = 0
    for (const c of data?.cells ?? []) {
      bad += c.bad_count
      good += c.good_count
    }
    return { bad, good }
  }, [data])

  // Split findings by whether their asset has a classified importance.
  // When everything lands in the Unclassified lane, the graded grid is
  // empty by design (unclassified is a coverage gap, never graded) — so
  // the page looks data-less even though findings exist. We detect that
  // and surface a banner explaining it instead of a silent blank grid.
  const laneSplit = useMemo(() => {
    let classified = 0
    let unclassified = 0
    for (const c of data?.cells ?? []) {
      const n = c.bad_count + c.good_count
      if (c.importance === 'unclassified') unclassified += n
      else classified += n
    }
    return { classified, unclassified }
  }, [data])

  // Drill into the actual findings for a cell/column. Routes to CTEM
  // Actions (the triage surface) filtered by severity — the SAME proven
  // navigation the rest of the workspace uses (event + sessionStorage
  // filter stash). The old target was `/projects/{id}/timeline`, gated on
  // the `timeline` page-id; for an org without that page FeatureGate
  // blocked it and the click silently did nothing ("按了都沒效").
  function drillToSeverity(severity: RiskSeverity) {
    navigateToCTEMActions({ severities: [severity.toLowerCase() as 'critical' | 'high' | 'medium' | 'low'] })
  }

  // Jump to Asset Map so the operator can set importance on the
  // unclassified assets — the action the all-unclassified banner asks for.
  function goToAssetMap() {
    if (!orgId) return
    navigate(`/projects/${orgId}/asset-map`)
  }

  return (
    <Box sx={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      bgcolor: (theme) => alpha(theme.palette.background.default, theme.palette.mode === 'dark' ? 0.3 : 0.55),
    }}>
      {/* Header */}
      <Box
        sx={{
          flexShrink: 0,
          mx: { xs: 1.5, md: 3 },
          mt: { xs: 1.25, md: 1.75 },
          px: { xs: 1.75, md: 2.25 },
          py: 1.45,
          border: '1px solid',
          borderColor: (theme) => alpha(RAW.violet500, theme.palette.mode === 'dark' ? 0.42 : 0.3),
          borderLeft: `3px solid ${RAW.violet500}`,
          borderRadius: 1,
          bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.62 : 0.94),
          backgroundImage: `linear-gradient(90deg, ${alpha(RAW.violet500, 0.075)} 0%, transparent 44%)`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Grid3x3 size={18} style={{ color: RAW.violet500 }} />
          <Typography component="h1" sx={{ fontSize: { xs: 20, md: 22 }, fontWeight: 700, lineHeight: 1.15 }}>
            {t('riskMatrix.title')}
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 13, mt: 0.5, color: 'text.secondary', maxWidth: 760, lineHeight: 1.5 }}>
          {t('riskMatrix.lede')}
        </Typography>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 1.5, md: 3 }, py: 1.5 }}>
        {isError && (
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography color="error" variant="body2">
              {t('riskMatrix.loadError')}
            </Typography>
          </Paper>
        )}

        {isLoading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" height={56} />
            ))}
          </Box>
        )}

        {!isLoading && !isError && data && totals.bad === 0 && totals.good === 0 && (
          /* Honest empty state — the engine returns all-zero cells when
             no findings have landed yet (fresh org, no classified assets,
             or no scan source connected). A grid full of "—" reads as
             broken; this says plainly that there's nothing to grade yet. */
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 4, md: 6 }, textAlign: 'center', borderRadius: 3,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5,
              borderStyle: 'dashed',
            }}
          >
            <Box sx={{
              width: 56, height: 56, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: alpha(RAW.violet500, 0.1), color: RAW.violet500,
            }}>
              <Grid3x3 size={26} />
            </Box>
            <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
              {t('riskMatrix.emptyTitle')}
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', maxWidth: 440, lineHeight: 1.6 }}>
              {t('riskMatrix.emptyBody')}
            </Typography>
          </Paper>
        )}

        {!isLoading && !isError && data && (totals.bad > 0 || totals.good > 0) && (
          <>
            {/* Totals strip — open-risk vs verified-safe metric tiles. */}
            <Box sx={{
              display: 'grid',
              gap: 1,
              mb: 1.5,
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
            }}>
              <TotalTile
                icon={<ShieldAlert size={16} />}
                tone={GRADE_TONE.bad.tone}
                label={t('riskMatrix.openRisk')}
                value={totals.bad}
              />
              <TotalTile
                icon={<ShieldCheck size={16} />}
                tone={GRADE_TONE.good.tone}
                label={t('riskMatrix.verifiedSafe')}
                value={totals.good}
              />
              <TotalTile
                icon={<HelpCircle size={16} />}
                tone={RAW.violet500}
                label={tOr('riskMatrix.unclassifiedSummary', '未分類缺口')}
                value={laneSplit.unclassified}
              />
            </Box>

            {/* All-unclassified banner — the findings exist, but every
                one is on an asset with no importance set, so the graded
                grid above is empty. Explain rather than look broken. */}
            {laneSplit.classified === 0 && laneSplit.unclassified > 0 && (
              <Box
                sx={{
                  display: 'flex', alignItems: 'flex-start', gap: 1.25,
                  p: 1.75, mb: 2.5, borderRadius: 2,
                  border: '1px solid', borderColor: alpha(RAW.violet500, 0.3),
                  bgcolor: alpha(RAW.violet500, 0.06),
                }}
              >
                <HelpCircle size={18} style={{ color: RAW.violet500, flexShrink: 0, marginTop: 2 }} />
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 700, mb: 0.25 }}>
                    {t('riskMatrix.allUnclassifiedTitle')}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.6, mb: 1.25 }}>
                    {`${laneSplit.unclassified} ${t('riskMatrix.allUnclassifiedBody')}`}
                  </Typography>
                  <Button
                    size="small"
                    variant="contained"
                    disableElevation
                    startIcon={<MapPin size={14} />}
                    onClick={goToAssetMap}
                    disabled={!orgId}
                    sx={{
                      textTransform: 'none', fontWeight: 700, fontSize: 12.5,
                      bgcolor: RAW.violet500, color: '#fff', boxShadow: 'none',
                      '&:hover': { bgcolor: alpha(RAW.violet500, 0.85), boxShadow: 'none' },
                    }}
                  >
                    {t('riskMatrix.setImportanceCta')}
                  </Button>
                </Box>
              </Box>
            )}

            {/* The grid. CSS grid: one label col + 4 severity cols. */}
            <Box sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              bgcolor: 'background.paper',
              p: { xs: 1, md: 1.25 },
              overflowX: 'auto',
            }}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: `minmax(138px, 1.05fr) repeat(${SEVERITY_COLS.length}, minmax(112px, 1fr))`,
                  gap: 1,
                  alignItems: 'stretch',
                  minWidth: 660,
                }}
              >
              {/* Header row: axis-hint corner + severity-toned column pills. */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'flex-start',
                  pb: 0.75,
                }}
              >
                <Typography
                  sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 600, letterSpacing: '0.03em' }}
                >
                  {t('riskMatrix.axisHint')}
                </Typography>
              </Box>
              {SEVERITY_COLS.map((sev) => {
                const st = SEVERITY_TONE[sev.toLowerCase() as Severity]
                return (
                  <Box key={sev} sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', pb: 0.75 }}>
                    {/* Column header is a working filter — click to triage
                        every finding of this severity. */}
                    <Tooltip title={t('riskMatrix.colTip')} arrow disableInteractive>
                      <Box
                        role="button"
                        tabIndex={0}
                        onClick={() => drillToSeverity(sev)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drillToSeverity(sev) } }}
                        sx={{
                          px: 1.25, py: 0.4, borderRadius: 1,
                          bgcolor: st.soft, border: '1px solid', borderColor: st.ring,
                          display: 'flex', alignItems: 'center', gap: 0.6,
                          cursor: 'pointer', transition: 'transform 120ms, box-shadow 120ms',
                          '&:hover': { transform: 'translateY(-1px)', boxShadow: `0 4px 14px ${alpha(st.tone, 0.25)}` },
                          '&:focus-visible': { outline: '2px solid', outlineColor: RAW.violet500, outlineOffset: 1 },
                        }}
                      >
                        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: st.tone }} />
                        <Typography sx={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: st.tone }}>
                          {severityLabel(sev)}
                        </Typography>
                      </Box>
                    </Tooltip>
                  </Box>
                )
              })}

              {/* Data rows. */}
              {IMPORTANCE_ROWS.map((imp) => {
                const isUnclassified = imp === 'unclassified'
                const impTone = isUnclassified ? null : IMPORTANCE_TONE[imp as 'critical' | 'high' | 'medium' | 'low']
                return (
                  <Box key={imp} sx={{ display: 'contents' }}>
                    {/* Row label cell. */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        px: 1.25,
                        py: 1,
                        borderRadius: 1,
                        bgcolor: isUnclassified ? 'action.hover' : alpha(impTone!.tone, 0.08),
                        border: '1px solid',
                        borderColor: isUnclassified ? 'divider' : impTone!.ring,
                        // Stronger left edge keys the row to its importance tone.
                        borderLeft: isUnclassified ? '1px solid' : '3px solid',
                        borderLeftColor: isUnclassified ? 'divider' : impTone!.tone,
                      }}
                    >
                      {isUnclassified ? (
                        <HelpCircle size={13} style={{ color: RAW.slate400, flexShrink: 0 }} />
                      ) : (
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            flexShrink: 0,
                            bgcolor: impTone!.tone,
                          }}
                        />
                      )}
                      <Typography
                        sx={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: isUnclassified ? 'text.secondary' : 'text.primary',
                          fontStyle: isUnclassified ? 'italic' : 'normal',
                        }}
                      >
                        {importanceLabel(imp)}
                      </Typography>
                    </Box>

                    {/* Severity cells for this row. */}
                    {SEVERITY_COLS.map((sev) => {
                      const cell = cellMap.get(`${imp}|${sev}`)
                      const bad = cell?.bad_count ?? 0
                      const good = cell?.good_count ?? 0
                      const grade: RiskGrade = cell?.grade ?? 'none'
                      const empty = bad === 0 && good === 0

                      // Unclassified lane is NEVER color-graded as a risk —
                      // it's a coverage gap. Render muted regardless of counts.
                      const toneKey = isUnclassified ? '' : gradeToTone(grade)
                      const tone = GRADE_TONE[toneKey]
                      // A 0/0 cell is an honest neutral blank, not green.
                      const graded = !isUnclassified && !empty && toneKey !== ''

                      const clickable = !!orgId && !empty
                      const tip = isUnclassified
                        ? t('riskMatrix.unclassifiedTip')
                        : `${importanceLabel(imp)} × ${severityLabel(sev)} — ${bad} ${t('riskMatrix.tipOpen')} · ${good} ${t('riskMatrix.tipSafe')}`

                      return (
                        <Tooltip key={sev} title={tip} arrow disableInteractive>
                          <Box
                            role={clickable ? 'button' : undefined}
                            tabIndex={clickable ? 0 : undefined}
                            onClick={clickable ? () => drillToSeverity(sev) : undefined}
                            onKeyDown={
                              clickable
                                ? (e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      drillToSeverity(sev)
                                    }
                                  }
                                : undefined
                            }
                            sx={{
                              position: 'relative',
                              minHeight: 60,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 0.5,
                              borderRadius: 1,
                              px: 1,
                              py: 0.75,
                              border: '1px solid',
                              borderColor: graded ? tone.ring : 'divider',
                              // Graded cells get a heat fill keyed to the
                              // engine grade; ungraded / unclassified stay flat.
                              bgcolor: isUnclassified
                                ? 'transparent'
                                : graded
                                  ? alpha(tone.tone, 0.14)
                                  : 'transparent',
                              opacity: isUnclassified ? 0.88 : 1,
                              cursor: clickable ? 'pointer' : 'default',
                              transition: 'border-color 120ms, background-color 120ms, transform 120ms, box-shadow 120ms',
                              '&:hover': clickable
                                ? {
                                    transform: 'translateY(-1px)',
                                    borderColor: graded ? tone.tone : 'text.secondary',
                                    boxShadow: graded ? `0 4px 14px ${alpha(tone.tone, 0.25)}` : 1,
                                  }
                                : undefined,
                              '&:focus-visible': clickable
                                ? { outline: '2px solid', outlineColor: RAW.violet500, outlineOffset: 1 }
                                : undefined,
                            }}
                          >
                            {/* Grade dot — top-right corner heat indicator. */}
                            {graded && (
                              <Box sx={{
                                position: 'absolute', top: 5, right: 5,
                                width: 6, height: 6, borderRadius: '50%', bgcolor: tone.tone,
                              }} />
                            )}
                            {empty ? (
                              <Typography sx={{ fontSize: 13, color: 'text.disabled' }}>—</Typography>
                            ) : (
                              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
                                {/* bad (red) */}
                                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.3 }}>
                                  <ShieldAlert
                                    size={12}
                                    style={{ color: bad > 0 ? GRADE_TONE.bad.tone : RAW.slate400, opacity: bad > 0 ? 1 : 0.4 }}
                                  />
                                  <Typography
                                    sx={{
                                      fontSize: 17,
                                      fontWeight: 800,
                                      fontVariantNumeric: 'tabular-nums',
                                      fontFamily: 'ui-monospace, monospace',
                                      color: bad > 0 ? GRADE_TONE.bad.tone : 'text.disabled',
                                    }}
                                  >
                                    {bad}
                                  </Typography>
                                </Box>
                                <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>/</Typography>
                                {/* good (green) */}
                                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.3 }}>
                                  <Typography
                                    sx={{
                                      fontSize: 17,
                                      fontWeight: 800,
                                      fontVariantNumeric: 'tabular-nums',
                                      fontFamily: 'ui-monospace, monospace',
                                      color: good > 0 ? GRADE_TONE.good.tone : 'text.disabled',
                                    }}
                                  >
                                    {good}
                                  </Typography>
                                  <ShieldCheck
                                    size={12}
                                    style={{ color: good > 0 ? GRADE_TONE.good.tone : RAW.slate400, opacity: good > 0 ? 1 : 0.4 }}
                                  />
                                </Box>
                              </Box>
                            )}
                          </Box>
                        </Tooltip>
                      )
                    })}
                  </Box>
                )
              })}
              </Box>
            </Box>

            {/* Legend — what red / green mean + the evidence bar. */}
            <Box sx={{ mt: 2.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <ShieldAlert size={13} style={{ color: GRADE_TONE.bad.tone }} />
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {t('riskMatrix.legendBad')}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <ShieldCheck size={13} style={{ color: GRADE_TONE.good.tone }} />
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {t('riskMatrix.legendGood')}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <HelpCircle size={13} style={{ color: RAW.slate400 }} />
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {t('riskMatrix.legendUnclassified')}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </>
        )}
      </Box>
    </Box>
  )
}

// TotalTile — a single open-risk / verified-safe metric tile in the
// header strip. Tone-tinted soft bg with a big monospace count.
function TotalTile({
  icon, tone, label, value,
}: { icon: React.ReactNode; tone: string; label: string; value: number }) {
  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.25,
        px: 2, py: 1.25, borderRadius: 2,
        border: '1px solid', borderColor: alpha(tone, 0.3),
        bgcolor: alpha(tone, 0.06),
        minWidth: 180,
      }}
    >
      <Box sx={{
        width: 34, height: 34, borderRadius: 1.5, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: alpha(tone, 0.14), color: tone,
      }}>
        {icon}
      </Box>
      <Box>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </Typography>
        <Typography sx={{
          fontSize: 22, fontWeight: 800, lineHeight: 1.1, color: tone,
          fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace, monospace',
        }}>
          {value.toLocaleString()}
        </Typography>
      </Box>
    </Box>
  )
}
