/**
 * Compliance Dashboard — framework compliance scores and control details.
 * Supports SOC2, ISO27001, PCI-DSS, OWASP Top 10, GDPR, HIPAA, NIST CSF.
 *
 * Overview surface: an animated FrameworkRow list — each framework as
 * a horizontal stacked bar (pass / partial / fail) that fills in via
 * motion springs on mount. 2D is the right tool here; the data is
 * fundamentally tabular and the previous 3D plaza added cost (lazy
 * three.js bundle) without helping the operator decide.
 *
 * Drill-in keeps the original control table.
 */
import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion, useMotionValue, useTransform, animate } from 'motion/react'
import {
  ShieldCheck, ArrowLeft, CheckCircle2, XCircle, AlertTriangle,
  TrendingUp, Shield, Lock, Globe, Activity,
  ChevronRight, Filter,
} from 'lucide-react'
import {
  Alert, AlertTitle,
  Box, Paper, Typography, Chip, Button, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import {
  getOrgCompliance,
  normalizeControlStatus,
  summarizeFrameworkControls,
  type FrameworkResult,
  type ControlResult,
} from '@lib/engine'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { StatTile } from '@atoms/StatTile'
import { MONO, BRAND, techGrid, techTile, TechEyebrow, ConsoleSectionLabel } from '@atoms/techConsole'

const FRAMEWORK_ORDER = ['SOC2', 'ISO27001', 'PCI_DSS', 'OWASP_TOP10', 'GDPR', 'HIPAA', 'NIST_CSF']

const FRAMEWORK_META: Record<string, { label: string; icon: typeof Shield; color: string; desc: string; descKey: string }> = {
  SOC2:        { label: 'SOC 2',        icon: Shield,   color: '#8b5cf6', desc: 'Service Organization Control',   descKey: 'compliance.frameworkDescSoc2' },
  ISO27001:    { label: 'ISO 27001',    icon: Lock,     color: '#3b82f6', desc: 'Information Security Management', descKey: 'compliance.frameworkDescIso27001' },
  PCI_DSS:     { label: 'PCI DSS',      icon: Lock,     color: '#f59e0b', desc: 'Payment Card Industry',          descKey: 'compliance.frameworkDescPciDss' },
  OWASP_TOP10: { label: 'OWASP Top 10', icon: Activity, color: '#ef4444', desc: 'Web Application Security',       descKey: 'compliance.frameworkDescOwasp' },
  GDPR:        { label: 'GDPR',         icon: Globe,    color: '#06b6d4', desc: 'General Data Protection',        descKey: 'compliance.frameworkDescGdpr' },
  HIPAA:       { label: 'HIPAA',        icon: Shield,   color: '#10b981', desc: 'Health Information Privacy',     descKey: 'compliance.frameworkDescHipaa' },
  NIST_CSF:    { label: 'NIST CSF',     icon: Shield,   color: '#6366f1', desc: 'Cybersecurity Framework',        descKey: 'compliance.frameworkDescNistCsf' },
}

function safe(n: unknown): number {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

function scoreColor(score: unknown): string {
  const s = safe(score)
  if (s >= 80) return '#22c55e'
  if (s >= 60) return '#eab308'
  if (s >= 40) return '#f97316'
  return '#ef4444'
}

// Contrast-safe foreground for a scoreColor() background. The green/yellow
// tiers are light enough that white text fails WCAG; use near-black on those.
function scoreTextColor(score: unknown): string {
  const s = safe(score)
  return s >= 60 ? '#0f172a' : '#fff'
}

function scoreGrade(score: unknown): string {
  const s = safe(score)
  if (s >= 90) return 'A'
  if (s >= 80) return 'B'
  if (s >= 60) return 'C'
  if (s >= 40) return 'D'
  return 'F'
}

// ── Reusable sub-components ──

function ScoreGauge({ score: rawScore, size = 80, strokeWidth = 6 }: { score: number; size?: number; strokeWidth?: number }) {
  const score = safe(rawScore)
  const color = scoreColor(score)
  const radius = (size - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  // Faint inner "scanner" ring (dashed track) just inside the gauge —
  // a radar/console motif that reads security-grade without adding noise.
  const tickR = radius - strokeWidth - 1
  const tickC = 2 * Math.PI * tickR

  return (
    <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="rgba(127,127,127,0.14)" strokeWidth={strokeWidth}
        />
        {tickR > 4 && (
          <circle
            cx={size / 2} cy={size / 2} r={tickR}
            fill="none" stroke={color} strokeOpacity={0.22} strokeWidth={1}
            strokeDasharray={`1.5 ${(tickC / 48).toFixed(2)}`}
          />
        )}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)',
            filter: `drop-shadow(0 0 ${strokeWidth * 0.8}px ${color}aa)`,
          }}
        />
      </svg>
      <Box sx={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <Typography fontWeight={900} sx={{ color, fontSize: size * 0.22, lineHeight: 1, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(score)}%
        </Typography>
      </Box>
    </Box>
  )
}

function StatusChip({ status }: { status: string }) {
  const normalized = normalizeControlStatus(status)
  const config = normalized === 'pass'
    ? { icon: CheckCircle2, label: t('compliance.pass'), color: '#22c55e' }
    : normalized === 'fail'
    ? { icon: XCircle, label: t('compliance.fail'), color: '#ef4444' }
    : normalized === 'not_applicable'
    ? { icon: AlertTriangle, label: t('compliance.notApplicable'), color: '#64748b' }
    : { icon: AlertTriangle, label: t('compliance.partial'), color: '#eab308' }

  return (
    <Chip
      icon={<config.icon size={13} />}
      label={config.label}
      size="small"
      sx={{
        fontSize: 13, fontWeight: 700,
        bgcolor: `${config.color}18`, color: config.color,
        border: `1px solid ${config.color}40`,
        '& .MuiChip-icon': { color: config.color },
      }}
    />
  )
}

// ── Status distribution bar ──

function StatusBar({ pass: rp, fail: rf, partial: rpart, total: rt }: { pass: number; fail: number; partial: number; total: number }) {
  const total = safe(rt), pass = safe(rp), fail = safe(rf), partial = safe(rpart)
  if (total === 0) return null
  const pPct = (pass / total) * 100
  const fPct = (fail / total) * 100
  const partPct = (partial / total) * 100
  // Slim status bar — gradient fills + 1px border to match the
  // AnimatedSegmentBar style used in FrameworkRow. The bigger row
  // animates on mount; this version is for the header strip + the
  // drill-in card where animation would be distracting.
  return (
    <Box sx={{
      display: 'flex', borderRadius: 1, overflow: 'hidden', height: 8, width: '100%',
      border: '1px solid', borderColor: 'divider',
    }}>
      {pPct > 0 && (
        <Box sx={{
          width: `${pPct}%`,
          background: 'linear-gradient(180deg, #4ade80 0%, #22c55e 100%)',
          transition: 'width 0.5s ease',
        }} />
      )}
      {partPct > 0 && (
        <Box sx={{
          width: `${partPct}%`,
          background: 'linear-gradient(180deg, #facc15 0%, #eab308 100%)',
          transition: 'width 0.5s ease',
        }} />
      )}
      {fPct > 0 && (
        <Box sx={{
          width: `${fPct}%`,
          background: 'linear-gradient(180deg, #f87171 0%, #ef4444 100%)',
          transition: 'width 0.5s ease',
        }} />
      )}
    </Box>
  )
}

// ── Main component ──

export function ComplianceDashboardView() {
  const { org } = useOrg()
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const orgId = org?.id
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null)
  const [controlFilter, setControlFilter] = useState<string>('all')

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: qk.scoring.compliance(orgId),
    queryFn: () => getOrgCompliance(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const frameworks = useMemo(() => {
    const list = (data?.frameworks ?? []).map((framework) => ({
      ...framework,
      controls: Array.isArray(framework.controls) ? framework.controls : [],
    }))
    return [...list].sort((a, b) => {
      const ai = FRAMEWORK_ORDER.indexOf(a.framework)
      const bi = FRAMEWORK_ORDER.indexOf(b.framework)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
  }, [data])

  const totals = useMemo(() => {
    let pass = 0, fail = 0, partial = 0, total = 0
    for (const fw of frameworks) {
      const summary = summarizeFrameworkControls(fw)
      pass += summary.pass_count
      partial += summary.partial_count
      fail += summary.fail_count
      total += summary.evaluated_count
    }
    return { pass, fail, partial, total }
  }, [frameworks])

  const overallScore = safe(data?.overall_score)

  const activeFramework = frameworks.find(f => f.framework === selectedFramework)

  const filteredControls = useMemo(() => {
    if (!activeFramework) return []
    if (controlFilter === 'all') return activeFramework.controls
    return activeFramework.controls.filter(c => normalizeControlStatus(c.status) === controlFilter)
  }, [activeFramework, controlFilter])

  // ── Drill-in: framework detail ──
  if (selectedFramework && activeFramework) {
    const meta = FRAMEWORK_META[activeFramework.framework]
    const FwIcon = meta?.icon ?? Shield
    const summary = summarizeFrameworkControls(activeFramework)

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', p: 2.5, gap: 2 }}>
        {/* Back */}
        <Button
          variant="text" size="small"
          startIcon={<ArrowLeft size={14} />}
          onClick={() => { setSelectedFramework(null); setControlFilter('all') }}
          color="inherit"
          sx={{ textTransform: 'none', alignSelf: 'flex-start', mb: -1 }}
        >
          {t('compliance.backToFrameworks')}
        </Button>

        {/* Framework header card */}
        <Paper elevation={0} sx={{
          borderRadius: 3, p: 2.5,
          border: '1px solid', borderColor: 'divider',
          borderLeft: `3px solid ${scoreColor(activeFramework.score)}`,
          ...techGrid(dark),
          '& > *': { position: 'relative', zIndex: 1 },
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap' }}>
            <ScoreGauge score={activeFramework.score} size={72} strokeWidth={7} />
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <FwIcon size={18} style={{ color: 'var(--mui-palette-text-secondary)' }} />
                <Typography variant="h5" fontWeight={800} color="text.primary">
                  {meta?.label ?? activeFramework.framework}
                </Typography>
                <Box component="span" sx={{
                  fontFamily: MONO, fontSize: 12, fontWeight: 600, color: 'text.secondary',
                  px: 0.75, py: 0.25, borderRadius: '3px', bgcolor: 'action.hover',
                }}>
                  {activeFramework.framework}
                </Box>
                <Chip label={scoreGrade(activeFramework.score)} size="small" sx={{
                  fontWeight: 900, bgcolor: scoreColor(activeFramework.score), color: scoreTextColor(activeFramework.score), height: 24, fontFamily: MONO,
                }} />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {meta?.descKey ? tOr(meta.descKey, meta.desc) : ''}
              </Typography>
              <StatusBar pass={summary.pass_count} fail={summary.fail_count} partial={summary.partial_count} total={summary.evaluated_count} />
              <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                <Typography variant="caption" sx={{ color: '#22c55e', fontWeight: 700 }}>
                  {summary.pass_count} pass
                </Typography>
                {summary.partial_count > 0 && (
                  <Typography variant="caption" sx={{ color: '#eab308', fontWeight: 700 }}>
                    {summary.partial_count} partial
                  </Typography>
                )}
                {summary.fail_count > 0 && (
                  <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 700 }}>
                    {summary.fail_count} fail
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  {summary.evaluated_count} evaluated
                </Typography>
              </Box>
            </Box>
          </Box>
        </Paper>

        {/* Filter row */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Filter size={14} style={{ color: '#a78bfa' }} />
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mr: 1 }}>
            {t('compliance.filterStatus')}
          </Typography>
          {['all', 'pass', 'fail', 'partial'].map(f => (
            <Chip
              key={f}
              label={f === 'all' ? t('compliance.all') : f === 'pass' ? t('compliance.pass') : f === 'fail' ? t('compliance.fail') : t('compliance.partial')}
              size="small"
              onClick={() => setControlFilter(f)}
              sx={{
                fontWeight: 700, fontSize: 13, cursor: 'pointer',
                bgcolor: controlFilter === f ? (f === 'pass' ? '#22c55e20' : f === 'fail' ? '#ef444420' : f === 'partial' ? '#eab30820' : 'rgba(139,92,246,0.12)') : 'transparent',
                color: controlFilter === f ? (f === 'pass' ? '#22c55e' : f === 'fail' ? '#ef4444' : f === 'partial' ? '#eab308' : '#a78bfa') : 'text.secondary',
                border: '1px solid',
                borderColor: controlFilter === f ? (f === 'pass' ? '#22c55e40' : f === 'fail' ? '#ef444440' : f === 'partial' ? '#eab30840' : 'rgba(139,92,246,0.3)') : 'divider',
              }}
            />
          ))}
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {filteredControls.length} / {activeFramework.controls.length}
          </Typography>
        </Box>

        {/* Controls table */}
        <TableContainer component={Paper} elevation={0} sx={{
          borderRadius: 3, flex: 1, overflow: 'auto',
          border: '1px solid', borderColor: 'divider',
        }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', minWidth: 120, borderBottom: '2px solid', borderBottomColor: 'divider', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 12, color: 'text.secondary' }}>
                  {t('compliance.controlId')}
                </TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', borderBottom: '2px solid', borderBottomColor: 'divider', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 12, color: 'text.secondary' }}>
                  {t('compliance.controlName')}
                </TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', minWidth: 100, borderBottom: '2px solid', borderBottomColor: 'divider', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 12, color: 'text.secondary' }}>
                  {t('compliance.status')}
                </TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: 'background.paper', borderBottom: '2px solid', borderBottomColor: 'divider', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 12, color: 'text.secondary' }}>
                  {t('compliance.details')}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredControls.map((ctrl) => (
                <ControlRow key={ctrl.control_id} control={ctrl} />
              ))}
              {filteredControls.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} sx={{ textAlign: 'center', py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      {t('compliance.noControls')}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    )
  }

  // ── Main: overview + framework cards ──
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ── Fixed: header + stats + status bar ── */}
      <Box sx={{ flexShrink: 0 }}>
        <Box sx={{
          px: 3, py: 2, borderBottom: '1px solid', borderBottomColor: 'divider',
          borderTop: `2px solid ${BRAND}`,
          ...techGrid(dark),
          '& > *': { position: 'relative', zIndex: 1 },
        }}>
          <FlytoPageHeader
            title={t('compliance.title')}
            subtitle={t('compliance.subtitle')}
            bottomGap={0}
            count={<TechEyebrow icon={<ShieldCheck size={12} />}>{t('hardcoded.posture.matrix.b0ec554e')}</TechEyebrow>}
            action={data ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <ScoreGauge score={overallScore} size={48} strokeWidth={5} />
                <Box>
                  <Typography sx={{ fontSize: 12, fontFamily: MONO, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>{t('compliance.overall')}</Typography>
                  <Typography variant="h6" fontWeight={900} sx={{ color: scoreColor(overallScore), lineHeight: 1, fontFamily: MONO }}>
                    {scoreGrade(overallScore)}
                  </Typography>
                </Box>
              </Box>
            ) : undefined}
          />
        </Box>

        {!isLoading && frameworks.length > 0 && (
          <Box sx={{ px: 2.5, pt: 2, pb: 1.5 }}>
            {/* Summary stat cards */}
            <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
              <StatTile orientation="horizontal" valueSize={20} minWidth={130} sx={{ p: 1.5, ...techTile('#8b5cf6', dark) }} icon={<Shield size={18} />} label={t('compliance.frameworks')} value={frameworks.length} color="#8b5cf6" sub={`${Math.round(overallScore)}% avg`} />
              <StatTile orientation="horizontal" valueSize={20} minWidth={130} sx={{ p: 1.5, ...techTile('#22c55e', dark) }} icon={<CheckCircle2 size={18} />} label={t('compliance.passed')} value={totals.pass} color="#22c55e" sub={totals.total > 0 ? `${Math.round((totals.pass / totals.total) * 100)}%` : ''} />
              <StatTile orientation="horizontal" valueSize={20} minWidth={130} sx={{ p: 1.5, ...techTile('#eab308', dark) }} icon={<AlertTriangle size={18} />} label={t('compliance.partial')} value={totals.partial} color="#eab308" />
              <StatTile orientation="horizontal" valueSize={20} minWidth={130} sx={{ p: 1.5, ...techTile('#ef4444', dark) }} icon={<XCircle size={18} />} label={t('compliance.failed')} value={totals.fail} color="#ef4444" sub={totals.total > 0 ? `${Math.round((totals.fail / totals.total) * 100)}%` : ''} />
              <StatTile orientation="horizontal" valueSize={20} minWidth={130} sx={{ p: 1.5, ...techTile('#94a3b8', dark) }} icon={<TrendingUp size={18} />} label={t('compliance.total')} value={totals.total} color="#6b7280" />
            </Box>

            {/* Overall status bar */}
            <Box sx={{ mb: 0.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  {t('compliance.overallStatus')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {totals.pass + totals.partial + totals.fail} controls
                </Typography>
              </Box>
              <StatusBar pass={totals.pass} fail={totals.fail} partial={totals.partial} total={totals.total} />
            </Box>
          </Box>
        )}
      </Box>

      {/* ── Scrollable: framework cards ── */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 2.5, pb: 2.5 }}>
        {/* Loading */}
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={28} sx={{ color: '#8b5cf6' }} />
          </Box>
        )}

        {isError && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => refetch()} disabled={isFetching}>
                {t('common.retry')}
              </Button>
            }
            sx={{ mt: 2 }}
          >
            <AlertTitle>{t('compliance.loadFailed')}</AlertTitle>
            {(error as Error | undefined)?.message}
          </Alert>
        )}

        {/* Empty state */}
        {!isLoading && !isError && frameworks.length === 0 && (
          <Paper elevation={0} sx={{
            borderRadius: 3, py: 8, px: 4, mt: 2,
            border: '1px solid', borderColor: 'divider',
          }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
              <Box sx={{
                width: 80, height: 80, borderRadius: '50%', mb: 3,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: 'action.hover',
              }}>
                <ShieldCheck size={36} style={{ opacity: 0.3 }} />
              </Box>
              <Typography variant="h6" fontWeight={600} color="text.primary" sx={{ mb: 1 }}>
                {t('compliance.emptyTitle')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 400 }}>
                {t('compliance.emptyDesc')}
              </Typography>
            </Box>
          </Paper>
        )}

        {!isLoading && !isError && frameworks.length > 0 && (
          <>
            <Box sx={{ mt: 0.5 }}>
              <ConsoleSectionLabel label={t('compliance.byFramework')} />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {[...frameworks]
                .sort((a, b) => safe(a.score) - safe(b.score))
                .map((fw, i) => (
                  <FrameworkRow
                    key={fw.framework}
                    framework={fw}
                    index={i}
                    onClick={() => setSelectedFramework(fw.framework)}
                  />
                ))}
            </Box>
          </>
        )}
      </Box>
    </Box>
  )
}

// ── AnimatedNumber — small wrapper that count-ups a value on mount.
// Cheap motion v12 helper; gracefully no-ops under reduced-motion.
function AnimatedNumber({ value, duration = 1.1 }: { value: number; duration?: number }) {
  const reduced = useReducedMotion()
  const mv = useMotionValue(reduced ? value : 0)
  const rounded = useTransform(mv, (v) => Math.round(v))
  useEffect(() => {
    if (reduced) { mv.set(value); return }
    const controls = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] })
    return () => controls.stop()
  }, [value, duration, reduced, mv])
  return <motion.span>{rounded}</motion.span>
}

// ── AnimatedSegmentBar — horizontal stacked bar that grows from 0→
// target on mount via spring. Three segments (pass / partial / fail),
// each animated independently so the eye sees the proportions fill
// in. Per-row stagger handled by the caller's mount delay.
function AnimatedSegmentBar({
  pass, partial, fail, total, delay = 0,
}: {
  pass: number; partial: number; fail: number; total: number; delay?: number
}) {
  const reduced = useReducedMotion()
  const t = Math.max(1, total)
  const pPct = (pass / t) * 100
  const partPct = (partial / t) * 100
  const fPct = (fail / t) * 100
  // motion v12 spring: low stiffness + medium damping = a soft grow,
  // not a snap. Matches JellyCard's vibe.
  const grow = (target: number, segDelay: number) => reduced
    ? { width: `${target}%` }
    : { width: `${target}%`, transition: { duration: 0.8, delay: delay + segDelay, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } }
  return (
    <Box sx={{
      display: 'flex', height: 26, borderRadius: 1.5, overflow: 'hidden',
      bgcolor: 'action.hover',
      border: '1px solid', borderColor: 'divider',
    }}>
      {pass > 0 && (
        <motion.div
          initial={{ width: 0 }}
          animate={grow(pPct, 0)}
          style={{
            background: 'linear-gradient(180deg, #4ade80 0%, #22c55e 100%)',
            boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.08)',
            height: '100%',
          }}
        />
      )}
      {partial > 0 && (
        <motion.div
          initial={{ width: 0 }}
          animate={grow(partPct, 0.05)}
          style={{
            background: 'linear-gradient(180deg, #facc15 0%, #eab308 100%)',
            boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.08)',
            height: '100%',
          }}
        />
      )}
      {fail > 0 && (
        <motion.div
          initial={{ width: 0 }}
          animate={grow(fPct, 0.1)}
          style={{
            background: 'linear-gradient(180deg, #f87171 0%, #ef4444 100%)',
            boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.08)',
            height: '100%',
          }}
        />
      )}
    </Box>
  )
}

// ── FrameworkRow — animated 2D row. Replaces the previous compact
// row + the brief detour into 3D towers. Stagger-mounts via motion
// (caller-supplied index), bar segments fill in with spring eases,
// the score number count-ups, and F-grade rows get a subtle red
// glow. One brand surface, semantic colours only on the bar +
// grade chip. No rainbow.
function FrameworkRow({
  framework, index, onClick,
}: {
  framework: FrameworkResult
  index: number
  onClick: () => void
}) {
  const reduced = useReducedMotion()
  const color = scoreColor(framework.score)
  const meta = FRAMEWORK_META[framework.framework]
  const FwIcon = meta?.icon ?? Shield
  const summary = summarizeFrameworkControls(framework)
  const grade = scoreGrade(framework.score)
  const isFailing = grade === 'F'
  const mountDelay = index * 0.06

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={reduced ? undefined : { duration: 0.45, delay: mountDelay, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
    >
      <Paper
        elevation={0}
        onClick={onClick}
        sx={{
          position: 'relative', overflow: 'hidden',
          borderRadius: 2, px: 2, py: 1.5, cursor: 'pointer',
          border: '1px solid', borderColor: 'divider',
          borderLeft: `3px solid ${color}`,
          transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background-color 0.18s ease',
          display: 'flex', alignItems: 'center', gap: 2,
          // Scanline sweep on hover — a console "row scanned" cue.
          '&::after': {
            content: '""', position: 'absolute', inset: 0, pointerEvents: 'none',
            background: `linear-gradient(90deg, transparent, ${color}1f, transparent)`,
            transform: 'translateX(-120%)', transition: 'transform 0.7s ease',
          },
          '&:hover::after': { transform: 'translateX(120%)' },
          // Subtle red glow on F-grade rows — pulls the eye without
          // a screaming background colour.
          ...(isFailing ? {
            boxShadow: '0 0 0 1px rgba(239,68,68,0.18), 0 4px 12px -6px rgba(239,68,68,0.35)',
          } : {}),
          '&:hover': {
            borderColor: color,
            bgcolor: 'action.hover',
            transform: 'translateY(-1px)',
            boxShadow: isFailing
              ? '0 0 0 1px rgba(239,68,68,0.3), 0 8px 20px -8px rgba(239,68,68,0.5)'
              : `0 0 0 1px ${color}3a, 0 8px 20px -8px ${color}4a`,
          },
        }}
      >
        {/* Framework identity column — fixed width so bars align */}
        <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 200, flexShrink: 0 }}>
          <Box sx={{
            width: 32, height: 32, borderRadius: 1.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: `${color}14`, color, flexShrink: 0,
            border: `1px solid ${color}33`,
          }}>
            <FwIcon size={16} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={700} color="text.primary" noWrap>
                {meta?.label ?? framework.framework}
              </Typography>
              <Box component="span" sx={{
                fontFamily: MONO, fontSize: 12, fontWeight: 600, lineHeight: 1.4,
                color: 'text.secondary', px: 0.5, borderRadius: '3px',
                bgcolor: 'action.hover', flexShrink: 0,
                maxWidth: 92, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {framework.framework}
              </Box>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, display: 'block' }} noWrap>
              {meta?.descKey ? tOr(meta.descKey, meta.desc) : ''}
            </Typography>
          </Box>
        </Box>

        {/* Animated stacked bar — the meaty signal */}
        <Box sx={{ position: 'relative', zIndex: 1, flex: 1, minWidth: 200 }}>
          <AnimatedSegmentBar
            pass={summary.pass_count}
            partial={summary.partial_count}
            fail={summary.fail_count}
            total={summary.evaluated_count}
            delay={mountDelay + 0.1}
          />
          <Box sx={{ display: 'flex', gap: 1.25, mt: 0.6 }}>
            <Typography variant="caption" sx={{ color: '#22c55e', fontWeight: 700, fontSize: 12 }}>
              {summary.pass_count} pass
            </Typography>
            {summary.partial_count > 0 && (
              <Typography variant="caption" sx={{ color: '#eab308', fontWeight: 700, fontSize: 12 }}>
                {summary.partial_count} partial
              </Typography>
            )}
            {summary.fail_count > 0 && (
              <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 700, fontSize: 12 }}>
                {summary.fail_count} fail
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, ml: 'auto' }}>
              {summary.evaluated_count} evaluated
            </Typography>
          </Box>
        </Box>

        {/* Score % + grade chip — fixed-width right column */}
        <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 1.25, flexShrink: 0 }}>
          <Box sx={{
            minWidth: 64, height: 40,
            display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 0.25,
            color, fontWeight: 900,
          }}>
            <Typography sx={{ color, fontWeight: 900, fontSize: 26, lineHeight: 1, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
              <AnimatedNumber value={Math.round(safe(framework.score))} />
            </Typography>
            <Typography sx={{ color, fontWeight: 700, fontSize: 14, lineHeight: 1, fontFamily: MONO }}>%</Typography>
          </Box>
          <Chip
            label={grade}
            size="small"
            sx={{
              fontWeight: 900, bgcolor: color, color: scoreTextColor(framework.score),
              height: 26, minWidth: 32, fontSize: 14, fontFamily: MONO,
              boxShadow: isFailing ? `0 0 12px ${color}88` : 'none',
            }}
          />
          <ChevronRight size={18} style={{ color: 'var(--mui-palette-text-secondary)', flexShrink: 0 }} />
        </Box>
      </Paper>
    </motion.div>
  )
}

// ── Control table row ──

function ControlRow({ control }: { control: ControlResult }) {
  const status = normalizeControlStatus(control.status)
  const rowBg = status === 'fail'
    ? 'rgba(239,68,68,0.04)'
    : status === 'partial'
    ? 'rgba(234,179,8,0.03)'
    : 'transparent'

  return (
    <TableRow sx={{
      bgcolor: rowBg,
      '&:hover': { bgcolor: 'action.hover' },
      borderLeft: status === 'fail' ? '3px solid #ef4444' : status === 'partial' ? '3px solid #eab308' : '3px solid transparent',
    }}>
      <TableCell>
        <Typography variant="body2" fontWeight={600} color="text.primary" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
          {control.control_id}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2" color="text.primary" fontWeight={500}>
          {control.control_name}
        </Typography>
      </TableCell>
      <TableCell>
        <StatusChip status={control.status} />
      </TableCell>
      <TableCell>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 500 }}>
          {control.details}
        </Typography>
      </TableCell>
    </TableRow>
  )
}
