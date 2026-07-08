/**
 * PostureManagerView - manager-mode posture command surface.
 *
 * The manager page uses the same backend data as the engineer surface, but
 * changes the question: "what changed, what drags the rating, and where does
 * leadership spend attention?" It deliberately avoids large empty charts and
 * repeated KPI cards.
 */

import { useMemo, type ReactElement, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha, useTheme, type SxProps, type Theme } from '@mui/material/styles'
import {
  Activity,
  AlertTriangle,
  Gauge,
  Layers,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'

import {
  gradeColor,
} from '@compounds/_shared'

import { useOrg } from '@hooks/useOrg'
import { t, tOr } from '@lib/i18n'
import { colors } from '@/styles/designTokens'
import { qk } from '@lib/queryKeys'
import {
  getComputedScore,
  getUnifiedScoreHistory,
  getOrgBenchmark,
} from '@lib/engine/scoring/scoring'
import { getScoreForecast } from '@lib/engine/ctem/upstreamData'
import { gradeTone } from './managerShared'

const SCORE_MIN = 250
const SCORE_MAX = 900
const ACCENT = colors.section.scoring

interface CategoryManagerRow {
  id: string
  label: string
  display: number | null
  grade: string | null
  weight: number
  drag: number
}

interface ForecastPulsePoint {
  label: string
  value: number
  upper?: number
  lower?: number
  projected?: boolean
}

interface ForecastPulseData {
  history: ForecastPulsePoint[]
  forecast: ForecastPulsePoint[]
}

const EMPTY_CHART = (msg: string) => (
  <Box sx={{ height: 168, display: 'grid', placeItems: 'center', px: 2 }}>
    <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
      {msg}
    </Typography>
  </Box>
)

export function PostureManagerView() {
  const { org } = useOrg()
  const orgId = org?.id
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'

  const scoreQ = useQuery({
    queryKey: qk.computedScore(orgId),
    queryFn: () => getComputedScore(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const histQ = useQuery({
    queryKey: qk.scoring.scoreHistory(orgId, 90),
    queryFn: () => getUnifiedScoreHistory(orgId!, 90),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const benchQ = useQuery({
    queryKey: qk.scoring.benchmark(orgId),
    queryFn: () => getOrgBenchmark(orgId!),
    enabled: !!orgId,
    staleTime: 120_000,
  })
  const forecastQ = useQuery({
    queryKey: qk.scoring.scoreForecast(orgId),
    queryFn: () => getScoreForecast(orgId!, 30),
    enabled: !!orgId,
    staleTime: 120_000,
  })

  const score = scoreQ.data
  const hasScore = !!score && score.score_available !== false && score.overall_display != null
  const bench = benchQ.data
  const hasBench = !!bench && bench.score_available !== false && bench.percentile != null && !!bench.benchmark

  const trend = useMemo(() => {
    const entries = [...(histQ.data?.entries ?? [])].sort(
      (a, b) => new Date(a.computedAt).getTime() - new Date(b.computedAt).getTime(),
    )
    return {
      categories: entries.map((e) => new Date(e.computedAt).toLocaleDateString()),
      values: entries.map((e) => Math.round(e.overallDisplay)),
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

  const forecastPreview: ForecastPulseData | null = useMemo(() => {
    const fc = forecastQ.data?.forecast
    const history = trend.values.map((value, index) => ({
      label: compactDateLabel(trend.categories[index]),
      value,
    })).slice(-5)
    if ((!fc || fc.length === 0) && history.length < 2) return null

    const forecast = (fc ?? [])
      .map((point, index) => ({ point, day: index + 1 }))
      .filter(({ day }, index, arr) => day === 7 || day === 14 || day === 21 || day === 30 || index === arr.length - 1)
      .map(({ point, day }) => ({
        label: `+${day}d`,
        value: Math.round(point.value),
        upper: Math.round(point.upper),
        lower: Math.round(point.lower),
        projected: true,
      }))

    return { history, forecast }
  }, [forecastQ.data, trend])

  const catRows: CategoryManagerRow[] = useMemo(() => {
    return (score?.categories ?? []).map((c) => {
      const weight = Math.round(c.effective_weight * 100)
      const display = c.display == null ? null : Math.round(c.display)
      return {
        id: c.id,
        label: c.label,
        display,
        grade: c.grade,
        weight,
        drag: display == null ? 0 : Math.max(0, 100 - display) * (weight / 100),
      }
    })
  }, [score])

  const peerBand = hasBench ? bench!.benchmark! : null
  const scoreNow = hasScore ? Math.round(score!.overall_display!) : null
  const scoreDelta = scoreNow != null && prevScore != null ? scoreNow - prevScore : null
  const scoreTone = gradeColor(gradeTone(score?.overall_grade, score?.overall_display))
  const scoreProgress = scoreNow == null
    ? 0
    : Math.max(0, Math.min(100, ((scoreNow - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100))
  const activeText = score ? `${score.active_count}/${score.total_count}` : '--'
  const priorityRows = [...catRows]
    .filter((row) => row.display != null)
    .sort((a, b) => b.drag - a.drag)
    .slice(0, 4)
  const healthiestRows = [...catRows]
    .filter((row) => row.display != null)
    .sort((a, b) => (b.display ?? 0) - (a.display ?? 0))
    .slice(0, 3)
  const summaryText = hasScore
    ? `${score!.overall_grade ?? ''} · ${scoreNow} · ${score!.active_count}/${score!.total_count} ${t('external.kpiActiveDimensions')}${
        hasBench ? ` · ${Math.round(bench!.percentile!)}% ${t('external.kpiSectorPercentile')}` : ''
      }`
    : tOr('external.noScoreYet', '尚未產生分數')

  return (
    <Box sx={{
      height: '100%',
      minHeight: 0,
      overflow: 'hidden',
      p: { xs: 1.25, md: 1.5 },
      maxWidth: 1500,
      mx: 'auto',
      width: '100%',
      boxSizing: 'border-box',
      display: 'grid',
      gridTemplateRows: 'auto minmax(0, 1fr)',
      gap: 1,
    }}>
      <Card sx={{
        flexShrink: 0,
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(ACCENT, dark ? 0.42 : 0.32),
        borderLeft: `3px solid ${ACCENT}`,
        boxShadow: 'none',
        bgcolor: alpha(theme.palette.background.paper, dark ? 0.66 : 0.94),
        backgroundImage: `linear-gradient(90deg, ${alpha(ACCENT, dark ? 0.12 : 0.07)} 0%, transparent 45%)`,
        px: { xs: 2, md: 2.5 },
        py: 1.05,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        flexWrap: 'wrap',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
          <IconTile color={ACCENT}><Gauge size={20} /></IconTile>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h1" variant="h5" sx={{ fontWeight: 900, lineHeight: 1.1 }}>
              {t('external.postureTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
              {summaryText}
            </Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <SignalChip icon={<Layers size={13} />} label={activeText} hint={t('external.kpiActiveDimensions')} color={ACCENT} />
          <SignalChip
            icon={<Users size={13} />}
            label={hasBench ? `${Math.round(bench!.percentile!)}%` : '--'}
            hint={t('external.kpiSectorPercentile')}
            color={hasBench ? colors.semantic.success : theme.palette.text.secondary}
          />
          {scoreDelta != null && (
            <SignalChip
              icon={scoreDelta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              label={`${scoreDelta >= 0 ? '+' : ''}${scoreDelta}`}
              hint="90d"
              color={scoreDelta >= 0 ? colors.semantic.success : colors.semantic.danger}
            />
          )}
        </Stack>
      </Card>

      <Box sx={{
        minHeight: 0,
        minWidth: 0,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(310px, 0.68fr)' },
        gap: 1.25,
        alignContent: 'start',
        overflowY: 'auto',
        overflowX: 'hidden',
        pr: 0.25,
        pb: 0.5,
      }}>
        <Stack spacing={1.25} sx={{ minWidth: 0 }}>
          <ScoreCommandCard
            accent={ACCENT}
            scoreTone={scoreTone}
            scoreNow={scoreNow}
            scoreProgress={scoreProgress}
            grade={score?.overall_grade}
            hasScore={hasScore}
            loading={scoreQ.isLoading}
            activeText={activeText}
            peerBand={peerBand}
            benchSector={bench?.sector}
            benchSampleSize={peerBand?.sample_size}
            benchPercentile={bench?.percentile}
            leadDrag={priorityRows[0]}
            leadStrength={healthiestRows[0]}
          />

          <Panel title={tOr('external.postureManager.dimensionDrag', '分數拖累')} icon={<Target size={16} />} accent={ACCENT}>
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1.15fr 0.85fr' },
              gap: 1.25,
              minHeight: 0,
            }}>
              <Stack spacing={0.8} sx={{ minWidth: 0 }}>
                {catRows.length > 0 ? catRows.map((row) => (
                  <CategoryRow key={row.id} row={row} />
                )) : (
                  <EmptySoft text={tOr('external.noScoreYet', '尚未產生分數')} />
                )}
              </Stack>

              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 900, mb: 1 }}>
                  {tOr('external.postureManager.healthiestSignals', '最穩定訊號')}
                </Typography>
                <Stack spacing={0.8}>
                  {healthiestRows.length > 0 ? healthiestRows.map((row) => (
                    <MiniSignal key={row.id} label={row.label} value={row.display ?? 0} grade={row.grade} />
                  )) : <EmptySoft text={tOr('external.postureManager.noSignals', '尚無已評分維度')} />}
                </Stack>
                <Divider sx={{ my: 1.25 }} />
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.55, display: 'block' }}>
                  {tOr(
                    'external.postureManager.scaleHint',
                    '總分使用 250-900 態勢分數；維度列顯示後端 0-100 維度分數與有效權重。',
                  )}
                </Typography>
              </Box>
            </Box>
          </Panel>
        </Stack>

        <Stack spacing={1.25} sx={{ minWidth: 0 }}>
          <Panel title={tOr('external.postureManager.managementFocus', '管理重點')} icon={<AlertTriangle size={16} />} accent={colors.semantic.warning}>
            <Stack spacing={1}>
              {priorityRows.length > 0 ? priorityRows.map((row, idx) => (
                <PriorityRow key={row.id} row={row} index={idx + 1} />
              )) : (
                <EmptySoft text={tOr('external.noActions', '目前沒有需要處理的項目')} />
              )}
            </Stack>
          </Panel>

          <Box sx={{ display: 'grid', gap: 1.25, minHeight: 0 }}>
            <Panel title={t('scoring.trends.chartTitleTrendForecast')} icon={<Activity size={16} />} accent={colors.tech}>
              {forecastPreview
                ? <ForecastPulseChart data={forecastPreview} current={scoreNow} tone={scoreTone} />
                : EMPTY_CHART(tOr('scoring.trends.emptyHistoryMessage', '歷史資料不足，暫時無法繪製趨勢'))}
            </Panel>

            <Panel title={t('external.chartPeerBaseline')} icon={<Users size={16} />} accent={colors.semantic.success}>
              {peerBand ? (
                <PeerBandRow
                  org={scoreNow}
                  p25={peerBand.p25}
                  p50={peerBand.p50}
                  p75={peerBand.p75}
                  p90={peerBand.p90}
                  sector={bench!.sector}
                  sampleSize={peerBand.sample_size}
                />
              ) : (
                <EmptySoft text={tOr('scoring.benchmarkNoScore', '完成第一批可比掃描後，才會啟用同儕基準。')} minHeight={130} />
              )}
            </Panel>
          </Box>
        </Stack>
      </Box>
    </Box>
  )
}

function ScoreCommandCard({
  accent,
  scoreTone,
  scoreNow,
  scoreProgress,
  grade,
  hasScore,
  loading,
  activeText,
  peerBand,
  benchSector,
  benchSampleSize,
  benchPercentile,
  leadDrag,
  leadStrength,
}: {
  accent: string
  scoreTone: string
  scoreNow: number | null
  scoreProgress: number
  grade?: string | null
  hasScore: boolean
  loading: boolean
  activeText: string
  peerBand: { p25: number; p50: number; p75: number; p90: number } | null
  benchSector?: string
  benchSampleSize?: number
  benchPercentile?: number
  leadDrag?: CategoryManagerRow
  leadStrength?: CategoryManagerRow
}) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  return (
    <Card sx={{
      minHeight: 0,
      borderRadius: 1,
      border: '1px solid',
      borderColor: alpha(accent, dark ? 0.4 : 0.28),
      boxShadow: 'none',
      bgcolor: alpha(theme.palette.background.paper, dark ? 0.72 : 0.98),
      backgroundImage: `
        linear-gradient(135deg, ${alpha(accent, dark ? 0.12 : 0.055)} 0%, transparent 52%),
        linear-gradient(90deg, ${alpha(theme.palette.text.primary, dark ? 0.05 : 0.025)} 0%, transparent 60%)
      `,
      p: { xs: 1.35, md: 1.5 },
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', md: '154px minmax(0, 1fr)' },
      gap: { xs: 1.25, md: 1.5 },
      alignItems: 'center',
      minWidth: 0,
    }}>
      <Box sx={{ minWidth: 0, display: 'grid', placeItems: 'center' }}>
        {hasScore ? (
          <PostureDial
            score={scoreNow!}
            grade={grade}
            progress={scoreProgress}
            tone={scoreTone}
            accent={accent}
          />
        ) : (
          <EmptySoft text={loading ? t('common.loading') : tOr('external.noScoreYet', '尚未產生分數')} minHeight={132} />
        )}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
          <Chip
            icon={<ShieldCheck size={13} />}
            label={grade ?? tOr('scoring.noScoreYet', '尚未評分')}
            sx={{
              height: 28,
              borderRadius: 1,
              fontWeight: 900,
              color: scoreTone,
              bgcolor: alpha(scoreTone, dark ? 0.18 : 0.1),
              '& .MuiChip-icon': { color: 'inherit' },
            }}
          />
          <Chip size="small" label="250-900" variant="outlined" sx={{ height: 28, borderRadius: 1, fontWeight: 800 }} />
        </Stack>

        <Typography sx={{
          mt: 0.8,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: { xs: 44, md: 50 },
          fontWeight: 950,
          lineHeight: 0.95,
          letterSpacing: 0,
          color: scoreTone,
          textShadow: `0 0 34px ${alpha(scoreTone, 0.22)}`,
        }}>
          {scoreNow ?? '--'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.65, maxWidth: 660, lineHeight: 1.45 }}>
          {hasScore
            ? tOr(
                'external.postureManager.scoreMeaning',
                '這是後端計算的 250-900 態勢分數。主管頁優先看右側拖累隊列，決定下一輪資源要投到哪個維度。',
              )
            : tOr('scoring.noScoreHint', '連接儲存庫並執行掃描後，才會產生分數拆解。')}
        </Typography>

        <Box sx={{ mt: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.7 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>{SCORE_MIN}</Typography>
            <Typography variant="caption" sx={{ fontWeight: 900, color: scoreTone }}>{scoreNow ?? '--'}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>{SCORE_MAX}</Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={scoreProgress}
            sx={{
              height: 10,
              borderRadius: 999,
              bgcolor: alpha(theme.palette.text.primary, dark ? 0.12 : 0.08),
              '& .MuiLinearProgress-bar': {
                borderRadius: 999,
                bgcolor: scoreTone,
                boxShadow: `0 0 18px ${alpha(scoreTone, 0.38)}`,
              },
            }}
          />
        </Box>

        <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.8 }}>
          <InsightTile
            label={tOr('external.postureManager.topDrag', '最大拖累')}
            value={leadDrag?.label ?? '--'}
            detail={leadDrag ? `${Math.round(leadDrag.drag)} ${tOr('external.postureManager.dragDetail', '拖累')} · ${leadDrag.display ?? '--'} ${leadDrag.grade ?? ''}` : undefined}
            color={leadDrag ? gradeColor(gradeTone(leadDrag.grade, leadDrag.display)) : theme.palette.text.secondary}
          />
          <InsightTile
            label={tOr('external.postureManager.bestSignal', '最穩定維度')}
            value={leadStrength?.label ?? '--'}
            detail={leadStrength ? `${leadStrength.display ?? '--'} ${leadStrength.grade ?? ''} · ${leadStrength.weight}% ${tOr('external.postureManager.weight', '權重')}` : undefined}
            color={leadStrength ? gradeColor(gradeTone(leadStrength.grade, leadStrength.display)) : theme.palette.text.secondary}
          />
        </Box>

        <Box sx={{ mt: 0.8, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 0.8 }}>
          <MetricBlock label={t('external.kpiActiveDimensions')} value={activeText} color={accent} />
          <MetricBlock
            label={t('external.kpiSectorPercentile')}
            value={benchPercentile != null ? `${Math.round(benchPercentile)}%` : '--'}
            color={colors.semantic.success}
          />
          <MetricBlock
            label={tOr('scoring.sampleSize', '樣本數')}
            value={peerBand && benchSampleSize != null ? String(benchSampleSize) : '--'}
            detail={benchSector}
            color={theme.palette.text.secondary}
          />
        </Box>
      </Box>
    </Card>
  )
}

function Panel({
  title,
  icon,
  accent,
  children,
  sx,
}: {
  title: string
  icon: ReactNode
  accent: string
  children: ReactNode
  sx?: SxProps<Theme>
}) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  return (
    <Card sx={{
      minWidth: 0,
      borderRadius: 1,
      border: '1px solid',
      borderColor: alpha(accent, dark ? 0.28 : 0.18),
      borderLeft: `3px solid ${alpha(accent, dark ? 0.7 : 0.62)}`,
      boxShadow: 'none',
      bgcolor: alpha(theme.palette.background.paper, dark ? 0.66 : 0.98),
      overflow: 'hidden',
      ...sx,
    }}>
      <Box sx={{
        px: 1.5,
        py: 1.05,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        borderBottom: '1px solid',
        borderColor: alpha(accent, dark ? 0.18 : 0.12),
        bgcolor: alpha(accent, dark ? 0.1 : 0.045),
      }}>
        <Box sx={{ color: accent, display: 'flex' }}>{icon}</Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 950 }}>{title}</Typography>
      </Box>
      <Box sx={{ p: 1.35, minWidth: 0 }}>
        {children}
      </Box>
    </Card>
  )
}

function IconTile({ color, children }: { color: string; children: ReactNode }) {
  const theme = useTheme()
  return (
    <Box sx={{
      width: 42,
      height: 42,
      borderRadius: 1.4,
      display: 'grid',
      placeItems: 'center',
      flexShrink: 0,
      color,
      bgcolor: alpha(color, theme.palette.mode === 'dark' ? 0.18 : 0.1),
      border: `1px solid ${alpha(color, 0.34)}`,
    }}>
      {children}
    </Box>
  )
}

function PostureDial({
  score,
  grade,
  progress,
  tone,
  accent,
}: {
  score: number
  grade?: string | null
  progress: number
  tone: string
  accent: string
}) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const radius = 72
  const circumference = 2 * Math.PI * radius
  const dash = circumference * Math.max(0, Math.min(100, progress)) / 100
  return (
    <Box sx={{
      width: 142,
      aspectRatio: '1 / 1',
      position: 'relative',
      display: 'grid',
      placeItems: 'center',
      borderRadius: '50%',
      bgcolor: alpha(theme.palette.background.paper, dark ? 0.8 : 0.9),
      boxShadow: `0 0 24px ${alpha(tone, dark ? 0.12 : 0.07)}`,
    }}>
      <Box component="svg" viewBox="0 0 186 186" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <circle
          cx="93"
          cy="93"
          r="82"
          fill="none"
          stroke={alpha(accent, dark ? 0.18 : 0.12)}
          strokeWidth="1"
          strokeDasharray="3 7"
        />
        <circle
          cx="93"
          cy="93"
          r={radius}
          fill="none"
          stroke={alpha(theme.palette.text.primary, dark ? 0.14 : 0.1)}
          strokeWidth="12"
        />
        <circle
          cx="93"
          cy="93"
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 93 93)"
        />
        <circle
          cx="93"
          cy="93"
          r="52"
          fill={alpha(theme.palette.background.paper, dark ? 0.92 : 0.96)}
          stroke={alpha(tone, 0.26)}
          strokeWidth="1"
        />
      </Box>
      <Box sx={{
        position: 'relative',
        zIndex: 1,
        width: 82,
        height: 82,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        color: tone,
        bgcolor: alpha(theme.palette.background.paper, dark ? 0.9 : 0.92),
        border: `1px solid ${alpha(tone, 0.35)}`,
        boxShadow: `inset 0 0 28px ${alpha(tone, dark ? 0.14 : 0.09)}`,
      }}>
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 950, color: alpha(tone, 0.86), lineHeight: 1 }}>
            {grade ?? '--'}
          </Typography>
          <Typography sx={{ mt: 0.25, fontSize: 24, fontWeight: 950, lineHeight: 1, letterSpacing: 0 }}>
            {score}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850 }}>
            250-900
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}

function SignalChip({ icon, label, hint, color }: { icon: ReactElement; label: string; hint: string; color: string }) {
  return (
    <Chip
      icon={icon}
      label={`${label} ${hint}`}
      variant="outlined"
      sx={{
        height: 28,
        borderRadius: 1,
        fontWeight: 850,
        color,
        borderColor: alpha(color, 0.32),
        bgcolor: alpha(color, 0.08),
        '& .MuiChip-icon': { color: 'inherit' },
      }}
    />
  )
}

function InsightTile({ label, value, detail, color }: { label: string; value: string; detail?: string; color: string }) {
  const theme = useTheme()
  return (
    <Box sx={{
      minWidth: 0,
      borderRadius: 1,
      border: '1px solid',
      borderColor: alpha(color, 0.3),
      bgcolor: alpha(color, theme.palette.mode === 'dark' ? 0.1 : 0.055),
      px: 1.2,
      py: 0.85,
      position: 'relative',
      overflow: 'hidden',
      '&::before': {
        content: '""',
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 3,
        bgcolor: color,
      },
    }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 950 }} noWrap title={value}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" noWrap title={detail}>
        {detail ?? '--'}
      </Typography>
    </Box>
  )
}

function MetricBlock({ label, value, color, detail }: { label: string; value: string; color: string; detail?: string }) {
  const theme = useTheme()
  return (
    <Box sx={{
      minWidth: 0,
      border: '1px solid',
      borderColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.12 : 0.08),
      borderRadius: 1,
      px: 1.2,
      py: 1,
      bgcolor: alpha(color, theme.palette.mode === 'dark' ? 0.08 : 0.05),
    }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850, display: 'block' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 24, fontWeight: 950, color, lineHeight: 1.05 }}>
        {value}
      </Typography>
      {detail && (
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.35 }}>
          {detail}
        </Typography>
      )}
    </Box>
  )
}

function ForecastPulseChart({
  data,
  current,
  tone,
}: {
  data: ForecastPulseData
  current: number | null
  tone: string
}) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const history = data.history
  const forecast = data.forecast
  const points = [...history, ...forecast]
  if (points.length < 2) {
    return EMPTY_CHART(tOr('scoring.trends.emptyHistoryMessage', '歷史資料不足，暫時無法繪製趨勢'))
  }

  const lastForecast = forecast.length > 0 ? forecast[forecast.length - 1] : points[points.length - 1]
  const delta = current != null && lastForecast ? lastForecast.value - current : null
  const coords = buildForecastCoords(points)
  const historyCoords = coords.slice(0, Math.max(1, history.length))
  const forecastCoords = coords.slice(Math.max(0, history.length - 1))
  const labelCoords = coords.filter((_, index) => index === 0 || index >= history.length - 1)

  return (
    <Box sx={{ minHeight: 166, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 1 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
        <ForecastStat label={tOr('external.postureManager.now', '現況')} value={current != null ? String(current) : '--'} color={tone} />
        <ForecastStat label={tOr('external.postureManager.day30', '30 天預測')} value={lastForecast ? String(lastForecast.value) : '--'} color={colors.tech} />
        <ForecastStat
          label={tOr('external.postureManager.expectedDelta', '預估變化')}
          value={delta == null ? '--' : `${delta >= 0 ? '+' : ''}${delta}`}
          color={delta == null || delta >= 0 ? colors.semantic.success : colors.semantic.danger}
        />
      </Box>

      <Box sx={{
        minHeight: 110,
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(theme.palette.text.primary, dark ? 0.12 : 0.08),
        bgcolor: alpha(theme.palette.background.default, dark ? 0.42 : 0.5),
        overflow: 'hidden',
      }}>
        <svg viewBox="0 0 520 132" width="100%" height="132" role="img" aria-label="score forecast">
          <defs>
            <linearGradient id="postureForecastLine" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor={tone} stopOpacity="0.95" />
              <stop offset="100%" stopColor={colors.tech} stopOpacity="0.95" />
            </linearGradient>
            <pattern id="postureForecastGrid" width="28" height="28" patternUnits="userSpaceOnUse">
              <path d="M 28 0 L 0 0 0 28" fill="none" stroke={alpha(theme.palette.text.primary, dark ? 0.12 : 0.08)} strokeWidth="1" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="520" height="132" fill="url(#postureForecastGrid)" opacity="0.7" />
          <line x1="24" y1="106" x2="496" y2="106" stroke={alpha(theme.palette.text.primary, dark ? 0.18 : 0.13)} strokeWidth="1" />
          <line x1="24" y1="26" x2="496" y2="26" stroke={alpha(theme.palette.text.primary, dark ? 0.12 : 0.09)} strokeWidth="1" strokeDasharray="4 7" />
          <text x="24" y="22" fill={theme.palette.text.secondary} fontSize="11" fontWeight="700">900</text>
          <text x="24" y="120" fill={theme.palette.text.secondary} fontSize="11" fontWeight="700">250</text>
          {historyCoords.length > 1 && (
            <path d={svgPath(historyCoords)} fill="none" stroke={tone} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {forecastCoords.length > 1 && (
            <path d={svgPath(forecastCoords)} fill="none" stroke="url(#postureForecastLine)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 6" />
          )}
          {coords.map((point, index) => (
            <circle
              key={`${point.label}-${index}`}
              cx={point.x}
              cy={point.y}
              r={points[index]?.projected ? 4 : 3.5}
              fill={points[index]?.projected ? colors.tech : tone}
              stroke={theme.palette.background.paper}
              strokeWidth="2"
            />
          ))}
          {labelCoords.map((point) => (
            <text key={`${point.label}-${point.x}`} x={point.x} y="124" textAnchor="middle" fill={theme.palette.text.secondary} fontSize="11" fontWeight="800">
              {point.label}
            </text>
          ))}
        </svg>
      </Box>
    </Box>
  )
}

function ForecastStat({ label, value, color }: { label: string; value: string; color: string }) {
  const theme = useTheme()
  return (
    <Box sx={{
      minWidth: 0,
      borderRadius: 1,
      px: 1,
      py: 0.65,
      bgcolor: alpha(color, theme.palette.mode === 'dark' ? 0.11 : 0.06),
      border: `1px solid ${alpha(color, 0.24)}`,
    }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850, display: 'block' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 19, fontWeight: 950, lineHeight: 1.05, color }}>
        {value}
      </Typography>
    </Box>
  )
}

interface ForecastCoord extends ForecastPulsePoint {
  x: number
  y: number
}

function compactDateLabel(value: string | number): string {
  const text = String(value)
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function buildForecastCoords(points: ForecastPulsePoint[]): ForecastCoord[] {
  const left = 58
  const width = 420
  const top = 24
  const height = 86
  const step = points.length > 1 ? width / (points.length - 1) : 0
  return points.map((point, index) => {
    const clamped = Math.max(SCORE_MIN, Math.min(SCORE_MAX, point.value))
    const ratio = (clamped - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)
    return {
      ...point,
      x: left + step * index,
      y: top + height - ratio * height,
    }
  })
}

function svgPath(points: ForecastCoord[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
}

function CategoryRow({ row }: { row: CategoryManagerRow }) {
  const tone = gradeColor(gradeTone(row.grade, row.display))
  const value = row.display ?? 0
  const theme = useTheme()
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 86px 52px' },
      gap: 1,
      alignItems: 'center',
      px: 1,
      py: 0.8,
      borderRadius: 1,
      border: '1px solid',
      borderColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.1 : 0.07),
      bgcolor: alpha(tone, theme.palette.mode === 'dark' ? 0.06 : 0.035),
    }}>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.55 }}>
          <Typography variant="body2" sx={{ fontWeight: 900 }} noWrap title={row.label}>
            {row.label}
          </Typography>
          <Chip size="small" label={`${row.weight}%`} sx={{ height: 20, borderRadius: 1, fontSize: 11, fontWeight: 800 }} />
        </Box>
        <LinearProgress
          variant="determinate"
          value={Math.max(0, Math.min(100, value))}
          sx={{
            height: 7,
            borderRadius: 999,
            bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.12 : 0.08),
            '& .MuiLinearProgress-bar': { bgcolor: tone, borderRadius: 999 },
          }}
        />
      </Box>
      <Typography sx={{ fontWeight: 950, color: tone, textAlign: { xs: 'left', md: 'right' } }}>
        {row.display != null ? `${row.display}` : '--'} {row.grade ?? ''}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textAlign: { xs: 'left', md: 'right' } }}>
        -{Math.round(row.drag)}
      </Typography>
    </Box>
  )
}

function PriorityRow({ row, index }: { row: CategoryManagerRow; index: number }) {
  const theme = useTheme()
  const tone = gradeColor(gradeTone(row.grade, row.display))
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: '34px minmax(0, 1fr) auto',
      gap: 1,
      alignItems: 'center',
      px: 1,
      py: 1,
      borderRadius: 1,
      border: '1px solid',
      borderColor: alpha(tone, 0.28),
      bgcolor: alpha(tone, theme.palette.mode === 'dark' ? 0.08 : 0.045),
    }}>
      <Box sx={{
        width: 26,
        height: 26,
        borderRadius: 1,
        display: 'grid',
        placeItems: 'center',
        fontWeight: 950,
        color: tone,
        bgcolor: alpha(tone, 0.13),
      }}>
        {index}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 950 }} noWrap title={row.label}>
          {row.label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {tOr('external.postureManager.dragDetail', '拖累')} {Math.round(row.drag)} · {row.weight}% {tOr('scoring.weight.tipStatic', '權重')}
        </Typography>
      </Box>
      <Chip
        size="small"
        label={`${row.display ?? '--'} ${row.grade ?? ''}`}
        sx={{ height: 24, borderRadius: 1, fontWeight: 900, color: tone, bgcolor: alpha(tone, 0.12) }}
      />
    </Box>
  )
}

function MiniSignal({ label, value, grade }: { label: string; value: number; grade?: string | null }) {
  const tone = gradeColor(gradeTone(grade, value))
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: tone, flexShrink: 0 }} />
      <Typography variant="body2" sx={{ flex: 1, minWidth: 0, fontWeight: 800 }} noWrap title={label}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 950, color: tone }}>
        {value}
      </Typography>
    </Box>
  )
}

function EmptySoft({ text, minHeight = 92 }: { text: string; minHeight?: number }) {
  const theme = useTheme()
  return (
    <Box sx={{
      minHeight,
      borderRadius: 1,
      border: '1px dashed',
      borderColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.18 : 0.14),
      display: 'grid',
      placeItems: 'center',
      px: 2,
      textAlign: 'center',
    }}>
      <Typography variant="body2" color="text.secondary">{text}</Typography>
    </Box>
  )
}

/** PeerBandRow - org score plotted against sector p25/p50/p75/p90. No
 * individual peers are exposed. */
function PeerBandRow({
  org, p25, p50, p75, p90, sector, sampleSize,
}: {
  org: number | null
  p25: number
  p50: number
  p75: number
  p90: number
  sector: string
  sampleSize: number
}) {
  const theme = useTheme()
  const min = Math.min(p25, org ?? p25, SCORE_MIN) - 10
  const max = Math.max(p90, org ?? p90, SCORE_MAX) + 10
  const span = Math.max(1, max - min)
  const pos = (v: number) => `${((v - min) / span) * 100}%`
  const marks: { v: number; label: string }[] = [
    { v: p25, label: 'P25' },
    { v: p50, label: 'P50' },
    { v: p75, label: 'P75' },
    { v: p90, label: 'P90' },
  ]
  return (
    <Box sx={{ minHeight: 130, display: 'flex', flexDirection: 'column', justifyContent: 'center', px: 0.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 2 }}>
        {sector} · {sampleSize} {tOr('external.postureManager.peers', '同儕')}
      </Typography>
      <Box sx={{ position: 'relative', height: 9, borderRadius: 4.5, bgcolor: alpha(theme.palette.text.primary, 0.1), mb: 4 }}>
        <Box
          sx={{
            position: 'absolute',
            left: pos(p25),
            width: `calc(${pos(p90)} - ${pos(p25)})`,
            top: 0,
            bottom: 0,
            borderRadius: 4.5,
            bgcolor: alpha(theme.palette.primary.main, 0.25),
          }}
        />
        {marks.map((m) => (
          <Box key={m.label} sx={{ position: 'absolute', left: pos(m.v), top: -4, transform: 'translateX(-50%)' }}>
            <Box sx={{ width: 2, height: 17, bgcolor: alpha(theme.palette.text.primary, 0.4) }} />
            <Typography variant="caption" sx={{ position: 'absolute', top: 19, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 12 }}>
              {m.label}
            </Typography>
            <Typography variant="caption" sx={{ position: 'absolute', top: 32, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 12, color: theme.palette.text.secondary }}>
              {Math.round(m.v)}
            </Typography>
          </Box>
        ))}
        {org != null && (
          <Box sx={{ position: 'absolute', left: pos(org), top: -10, transform: 'translateX(-50%)' }}>
            <Box sx={{ width: 3, height: 29, bgcolor: theme.palette.primary.main, borderRadius: 1 }} />
            <Typography variant="caption" sx={{ position: 'absolute', top: -17, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontWeight: 900, color: theme.palette.primary.main }}>
              {tOr('external.postureManager.you', '本組織')} · {org}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  )
}
