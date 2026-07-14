/**
 * Manager view for attack-path candidates.
 *
 * This page intentionally avoids the generic manager dashboard shell:
 * attack paths need a command-board hierarchy where the primary route,
 * validation queue, and go/no-go decision are visible at once.
 */
import { useMemo } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import LinearProgress from '@mui/material/LinearProgress'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'
import {
  Activity,
  ArrowUpRight,
  Crosshair,
  Flame,
  GitBranch,
  Radar,
  RefreshCw,
  ShieldCheck,
  Target,
} from 'lucide-react'

import {
  getAttackPaths,
  type AttackPathCandidate,
  type AttackPathCategory,
  type AttackPathEvidenceSource,
  type AttackPathSignalsSummary,
} from '@lib/engine/code/attackPaths'
import { useOrg } from '@hooks/useOrg'
import { qk } from '@lib/queryKeys'
import { useExperience } from '@/contexts/ExperienceContext'
import { colors } from '@/styles/designTokens'

const ACCENT = colors.section.exposure
const DANGER = colors.semantic.danger
const WARNING = colors.semantic.warning
const SUCCESS = colors.semantic.success
const TECH = colors.tech

const CATEGORY_LABEL: Record<AttackPathCategory, string> = {
  initial_access: '初始入侵',
  web_app: 'Web 入口',
  information_exposure: '資訊外洩',
  email_spoofing: '郵件偽冒',
  supply_chain: '供應鏈',
}

const EVIDENCE_SOURCE_LABEL: Record<AttackPathEvidenceSource, string> = {
  attack_surface: '攻擊面',
  dns_security: 'DNS',
  code_alert: '程式碼告警',
  repo_pr_cache: '開放 PR',
  github_exposure: 'GitHub 曝露',
  breach_exposure: '外洩資料',
  threat_intel: '威脅情資',
  external_issue_tracker: '外部議題',
  freshness: '新鮮度',
  social_intel: '社群情資',
}

type SeverityTone = 'critical' | 'high' | 'medium' | 'low'

interface AttackPathStats {
  total: number
  high: number
  medium: number
  low: number
  validatable: number
  whyNow: number
  categories: Array<{ label: string; value: number; tone: string }>
}

function number(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '--'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

function severity(candidate: AttackPathCandidate): SeverityTone {
  if (candidate.confidence === 'high') return 'critical'
  if (candidate.confidence === 'medium') return 'high'
  if (candidate.validation_readiness === 'high') return 'medium'
  return 'low'
}

function severityTone(tone: SeverityTone): string {
  if (tone === 'critical') return DANGER
  if (tone === 'high') return WARNING
  if (tone === 'medium') return ACCENT
  return SUCCESS
}

function scoreCandidate(candidate: AttackPathCandidate): number {
  return candidate.confidence_score
    + candidate.validation_readiness_score
    + (candidate.why_now?.length ?? 0) * 8
    + candidate.red_team_validation.length * 4
}

export function AttackPathsManagerView() {
  const { org } = useOrg()
  const { setMode } = useExperience()
  const orgId = org?.id

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: qk.ctem.attackPathsManager(orgId),
    queryFn: () => getAttackPaths(orgId!, { limit: 100, minConfidence: 'low', sort: 'confidence' }),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })

  const candidates = useMemo(() => data?.candidates ?? [], [data])
  const summary = data?.signals_summary

  const ranked = useMemo(
    () => [...candidates].sort((a, b) => scoreCandidate(b) - scoreCandidate(a)),
    [candidates],
  )
  const top = ranked[0]

  const stats: AttackPathStats = useMemo(() => {
    const byCategory = new Map<AttackPathCategory, number>()
    let high = 0
    let medium = 0
    let low = 0
    let validatable = 0
    let whyNow = 0

    for (const candidate of candidates) {
      if (candidate.confidence === 'high') high += 1
      else if (candidate.confidence === 'medium') medium += 1
      else low += 1
      if (candidate.validation_readiness === 'high') validatable += 1
      if ((candidate.why_now?.length ?? 0) > 0) whyNow += 1
      byCategory.set(candidate.category, (byCategory.get(candidate.category) ?? 0) + 1)
    }

    const palette = [DANGER, WARNING, ACCENT, TECH, SUCCESS]
    return {
      total: candidates.length,
      high,
      medium,
      low,
      validatable,
      whyNow,
      categories: Array.from(byCategory.entries()).map(([category, value], index) => ({
        label: CATEGORY_LABEL[category],
        value,
        tone: palette[index % palette.length],
      })),
    }
  }, [candidates])

  const topTone = top ? severityTone(severity(top)) : ACCENT
  const source = top?.evidence[0]
  const topSource = source ? EVIDENCE_SOURCE_LABEL[source.source] : '尚無來源'
  const topAsset = top?.targets[0]?.value ?? '尚無目標'
  const topImpact = top ? CATEGORY_LABEL[top.category] : '尚無影響面'
  const gateLabel = stats.high > 0
    ? '先驗證再放行'
    : stats.total > 0
      ? '可排入觀察'
      : '等待訊號'

  return (
    <Box sx={(theme) => ({
      height: '100%',
      minHeight: 0,
      overflow: 'hidden',
      display: 'grid',
      gridTemplateRows: 'auto minmax(0, 1fr)',
      gap: 1.4,
      p: { xs: 1.2, lg: 1.8 },
      bgcolor: theme.palette.background.default,
      backgroundImage: `
        linear-gradient(90deg, ${alpha(ACCENT, 0.055)} 1px, transparent 1px),
        linear-gradient(0deg, ${alpha(ACCENT, 0.045)} 1px, transparent 1px)
      `,
      backgroundSize: '32px 32px',
    })}>
      <CommandHeader
        loading={isLoading}
        fetching={isFetching}
        stats={stats}
        summary={summary}
        onRefresh={() => { void refetch() }}
        onEngineer={() => setMode('engineer')}
      />

      <Box sx={{
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.55fr) minmax(330px, 0.45fr)' },
        gap: 1.4,
        overflow: 'hidden',
      }}>
        <Box sx={{
          minHeight: 0,
          display: 'grid',
          gridTemplateRows: 'minmax(184px, 0.48fr) minmax(0, 1.52fr)',
          gap: 1.4,
          overflow: 'hidden',
        }}>
          <RouteCommandPanel
            loading={isLoading}
            top={top}
            topTone={topTone}
            source={topSource}
            asset={topAsset}
            impact={topImpact}
          />
          <PathQueuePanel
            loading={isLoading}
            candidates={ranked}
            onEngineer={() => setMode('engineer')}
          />
        </Box>

        <Box sx={{
          minHeight: 0,
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr)',
          gap: 1.4,
          overflow: 'hidden',
        }}>
          <DecisionPanel
            loading={isLoading}
            top={top}
            stats={stats}
            summary={summary}
            gateLabel={gateLabel}
            topTone={topTone}
          />
          <SignalPanel loading={isLoading} stats={stats} summary={summary} />
        </Box>
      </Box>
    </Box>
  )
}

function CommandHeader({
  loading,
  fetching,
  stats,
  summary,
  onRefresh,
  onEngineer,
}: {
  loading: boolean
  fetching: boolean
  stats: AttackPathStats
  summary?: AttackPathSignalsSummary
  onRefresh: () => void
  onEngineer: () => void
}) {
  const theme = useTheme()
  return (
    <Box sx={{
      borderRadius: 1.1,
      border: `1px solid ${alpha(ACCENT, 0.28)}`,
      bgcolor: alpha(theme.palette.background.paper, 0.94),
      px: { xs: 1.25, md: 1.6 },
      py: 1.25,
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', lg: 'auto minmax(0, 1fr) auto' },
      gap: 1.2,
      alignItems: 'center',
      boxShadow: `0 18px 48px ${alpha(ACCENT, 0.08)}`,
    }}>
      <Box sx={{
        width: 48,
        height: 48,
        borderRadius: 1.1,
        display: 'grid',
        placeItems: 'center',
        color: ACCENT,
        bgcolor: alpha(ACCENT, 0.11),
        border: `1px solid ${alpha(ACCENT, 0.25)}`,
      }}>
        <Crosshair size={23} />
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: { xs: 26, lg: 32 }, lineHeight: 1, fontWeight: 950, letterSpacing: 0 }}>
            攻擊路徑指揮台
          </Typography>
          <Chip
            size="small"
            label={stats.high > 0 ? '需要驗證' : '監控中'}
            sx={{
              height: 25,
              borderRadius: 0.8,
              fontWeight: 900,
              color: stats.high > 0 ? DANGER : SUCCESS,
              bgcolor: alpha(stats.high > 0 ? DANGER : SUCCESS, 0.12),
              border: `1px solid ${alpha(stats.high > 0 ? DANGER : SUCCESS, 0.22)}`,
            }}
          />
        </Box>
        <Typography sx={{ mt: 0.55, color: 'text.secondary', fontWeight: 650 }}>
          從攻擊面、程式碼告警、外洩與情資訊號，排序最可信的初始入侵假設。
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: { xs: 'flex-start', lg: 'flex-end' }, gap: 0.8, flexWrap: 'wrap' }}>
        <HeaderPill icon={<GitBranch size={14} />} label={`${loading ? '--' : number(stats.total)} 路徑`} tone={ACCENT} />
        <HeaderPill icon={<Flame size={14} />} label={`${loading ? '--' : number(stats.high)} 高可信`} tone={DANGER} />
        <HeaderPill icon={<Activity size={14} />} label={`${loading ? '--' : number(summary?.why_now_signals_last_30d ?? stats.whyNow)} 近期訊號`} tone={TECH} />
        <Button
          size="small"
          variant="outlined"
          startIcon={<RefreshCw size={15} />}
          onClick={onRefresh}
          disabled={fetching}
          sx={{ borderRadius: 1, minHeight: 34, fontWeight: 900 }}
        >
          重新整理
        </Button>
        <Button
          size="small"
          variant="contained"
          endIcon={<ArrowUpRight size={15} />}
          onClick={onEngineer}
          sx={{ borderRadius: 1, minHeight: 34, fontWeight: 900 }}
        >
          工程檢視
        </Button>
      </Box>
    </Box>
  )
}

function HeaderPill({ icon, label, tone }: { icon: ReactElement; label: string; tone: string }) {
  return (
    <Chip
      size="small"
      icon={icon}
      label={label}
      sx={{
        height: 34,
        borderRadius: 1,
        fontWeight: 900,
        color: tone,
        bgcolor: alpha(tone, 0.1),
        border: `1px solid ${alpha(tone, 0.24)}`,
        '& .MuiChip-icon': { color: 'inherit' },
      }}
    />
  )
}

function RouteCommandPanel({
  loading,
  top,
  topTone,
  source,
  asset,
  impact,
}: {
  loading: boolean
  top?: AttackPathCandidate
  topTone: string
  source: string
  asset: string
  impact: string
}) {
  const score = Math.round(top?.confidence_score ?? 0)
  const readiness = Math.round(top?.validation_readiness_score ?? 0)
  return (
    <Panel sx={{
      p: 1.05,
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', md: '154px minmax(0, 1fr)' },
      gap: 1,
      overflow: 'hidden',
    }}>
      <Box sx={{
        minWidth: 0,
        borderRadius: 1,
        border: `1px solid ${alpha(topTone, 0.2)}`,
        bgcolor: alpha(topTone, 0.055),
        display: 'grid',
        placeItems: 'center',
        p: 0.85,
      }}>
        <ScoreDial score={score} readiness={readiness} tone={topTone} loading={loading} />
      </Box>

      <Box sx={{
        minWidth: 0,
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        gap: 1,
      }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 950, color: topTone, display: 'flex', alignItems: 'center', gap: 0.6 }}>
            <Radar size={14} />
            最可能突破點
          </Typography>
          {loading ? (
            <Skeleton width="70%" height={42} />
          ) : (
            <Typography sx={{
              mt: 0.3,
              fontSize: { xs: 20, lg: 25 },
              lineHeight: 1.08,
              fontWeight: 950,
              letterSpacing: 0,
              color: 'text.primary',
              overflowWrap: 'anywhere',
            }}>
              {top?.title ?? '尚未形成可信攻擊路徑'}
            </Typography>
          )}
          <Typography sx={{ mt: 0.5, color: 'text.secondary', fontWeight: 650, maxWidth: 880, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {top?.description ?? '等待攻擊面、程式碼告警或外洩訊號匯入後，這裡會顯示最值得管理者優先追問的路徑。'}
          </Typography>
        </Box>

        <Box sx={{
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 34px minmax(0, 1fr) 34px minmax(0, 1fr)' },
          alignItems: 'center',
          gap: 0.85,
        }}>
          <RouteNode icon={<Radar size={16} />} label="來源" value={source} detail={top?.evidence[0]?.kind ?? 'signal'} tone={ACCENT} />
          <RouteArrow />
          <RouteNode icon={<Target size={16} />} label="資產" value={asset} detail={`${top?.targets.length ?? 0} targets`} tone={TECH} />
          <RouteArrow />
          <RouteNode icon={<Flame size={16} />} label="影響" value={impact} detail={`${top?.red_team_validation.length ?? 0} validation steps`} tone={topTone} />
        </Box>

      </Box>
    </Panel>
  )
}

function PathQueuePanel({
  loading,
  candidates,
  onEngineer,
}: {
  loading: boolean
  candidates: AttackPathCandidate[]
  onEngineer: () => void
}) {
  return (
    <Panel sx={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', overflow: 'hidden' }}>
      <PanelHeader
        icon={<GitBranch size={17} />}
        title="驗證隊列"
        subtitle="先處理可信度高、證據足、可被紅隊重現的路徑"
        aside={`${candidates.length} candidates`}
      />
      <Box sx={{ minHeight: 0, overflow: 'auto', p: 1.15, display: 'grid', gap: 0.85, alignContent: 'start' }}>
        {loading && Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} height={76} sx={{ borderRadius: 1 }} />)}
        {!loading && candidates.length === 0 && (
          <EmptyState title="目前沒有攻擊路徑" subtitle="先補齊 attack surface、repo 與外洩情資來源，再回來看收斂結果。" />
        )}
        {!loading && candidates.slice(0, 18).map((candidate, index) => {
          const tone = severityTone(severity(candidate))
          return (
            <Box
              key={candidate.id}
              sx={{
                borderRadius: 1,
                border: `1px solid ${alpha(tone, 0.24)}`,
                bgcolor: alpha(tone, 0.055),
                p: 1,
                display: 'grid',
                gridTemplateColumns: { xs: '32px minmax(0, 1fr)', md: '34px minmax(0, 1fr) auto' },
                gap: 0.9,
                alignItems: 'center',
              }}
            >
              <Box sx={{
                width: 30,
                height: 30,
                borderRadius: 1,
                display: 'grid',
                placeItems: 'center',
                color: tone,
                bgcolor: alpha(tone, 0.12),
                fontWeight: 950,
              }}>
                {index + 1}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 950, color: 'text.primary' }} noWrap title={candidate.title}>
                  {candidate.title}
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }} noWrap>
                  {CATEGORY_LABEL[candidate.category]} / {candidate.targets.length} 目標 / {candidate.evidence.length} 證據 / {candidate.red_team_validation.length} 驗證步驟
                </Typography>
              </Box>
              <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.65 }}>
                <ScoreBadge label={candidate.confidence} value={Math.round(candidate.confidence_score)} tone={tone} />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={onEngineer}
                  sx={{ borderRadius: 1, minHeight: 30, fontWeight: 900, whiteSpace: 'nowrap' }}
                >
                  看證據
                </Button>
              </Box>
            </Box>
          )
        })}
      </Box>
    </Panel>
  )
}

function DecisionPanel({
  loading,
  top,
  stats,
  summary,
  gateLabel,
  topTone,
}: {
  loading: boolean
  top?: AttackPathCandidate
  stats: AttackPathStats
  summary?: AttackPathSignalsSummary
  gateLabel: string
  topTone: string
}) {
  const decision = stats.high > 0
    ? '先驗證高可信路徑，再決定是否啟動阻擋或修補。'
    : stats.total > 0
      ? '目前以觀察和補證據為主，避免把弱訊號直接升級。'
      : '尚無足夠訊號形成管理決策。'
  return (
    <Panel sx={{ overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto auto minmax(0, 1fr)' }}>
      <PanelHeader
        icon={<ShieldCheck size={17} />}
        title="決策雷達"
        subtitle="管理者只看三件事：能不能重現、是否高可信、下一步誰處理"
        aside={gateLabel}
      />
      <Box sx={{ p: 1.15, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.8 }}>
        <MiniMetric label="高可信" value={loading ? '--' : stats.high} tone={DANGER} />
        <MiniMetric label="可驗證" value={loading ? '--' : `${stats.validatable}/${stats.total}`} tone={SUCCESS} />
        <MiniMetric label="近期訊號" value={loading ? '--' : (summary?.why_now_signals_last_30d ?? stats.whyNow)} tone={TECH} />
      </Box>
      <Box sx={{ minHeight: 0, overflow: 'auto', px: 1.15, pb: 1.15 }}>
        <Box sx={{ borderRadius: 1, border: `1px solid ${alpha(topTone, 0.24)}`, bgcolor: alpha(topTone, 0.06), p: 1.15 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 950, color: topTone }}>建議判斷</Typography>
          <Typography sx={{ mt: 0.45, fontSize: 20, lineHeight: 1.18, fontWeight: 950 }}>
            {decision}
          </Typography>
          <Divider sx={{ my: 1.1 }} />
          <DecisionLine label="第一步" value={top ? `確認 ${top.targets[0]?.value ?? top.title} 的證據鏈` : '補掃描來源與資料新鮮度'} />
          <DecisionLine label="阻擋條件" value={top?.restrictions[0] ?? '高可信且可重現時才升級'} />
          <DecisionLine label="工程落點" value={top ? `${top.red_team_validation.length} 個驗證步驟` : '切工程檢視建立證據'} />
        </Box>
      </Box>
    </Panel>
  )
}

function SignalPanel({
  loading,
  stats,
  summary,
}: {
  loading: boolean
  stats: AttackPathStats
  summary?: AttackPathSignalsSummary
}) {
  const totalCategory = Math.max(1, stats.categories.reduce((sum, item) => sum + item.value, 0))
  return (
    <Panel sx={{ minHeight: 0, overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)' }}>
      <PanelHeader
        icon={<Activity size={17} />}
        title="訊號結構"
        subtitle="避免只看總數，先確認來源是否足以支撐決策"
        aside={loading ? '--' : `${number(stats.total)} total`}
      />
      <Box sx={{ minHeight: 0, overflow: 'auto', p: 1.15, display: 'grid', gap: 1.05, alignContent: 'start' }}>
        <Box sx={{ display: 'grid', gap: 0.85 }}>
          {stats.categories.length === 0 && !loading ? (
            <EmptyState title="尚無分類資料" subtitle="有候選路徑後，這裡會顯示攻擊入口集中在哪些面向。" />
          ) : stats.categories.map((item) => (
            <BarRow key={item.label} label={item.label} value={item.value} max={totalCategory} tone={item.tone} />
          ))}
          {loading && Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} height={28} />)}
        </Box>
        <Divider />
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.8 }}>
          <MiniMetric label="外部資產" value={loading ? '--' : number(summary?.external_assets)} tone={ACCENT} />
          <MiniMetric label="外洩訊號" value={loading ? '--' : number(summary?.leak_signals)} tone={DANGER} />
          <MiniMetric label="技術指紋" value={loading ? '--' : number(summary?.tech_fingerprints)} tone={TECH} />
          <MiniMetric label="滲透專案" value={loading ? '--' : number(summary?.pentest_projects)} tone={SUCCESS} />
        </Box>
        <Box sx={{ borderRadius: 1, bgcolor: alpha(ACCENT, 0.06), border: `1px solid ${alpha(ACCENT, 0.16)}`, p: 1 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 950, color: ACCENT }}>郵件姿態</Typography>
          <Typography sx={{ mt: 0.45, fontSize: 13, color: 'text.secondary', fontWeight: 700 }}>
            DMARC {summary?.dmarc_status || '--'} / SPF {summary?.spf_status || '--'} / DKIM {summary?.dkim_status || '--'}
          </Typography>
        </Box>
      </Box>
    </Panel>
  )
}

function Panel({
  children,
  sx,
}: {
  children: ReactNode
  sx?: object
}) {
  const theme = useTheme()
  return (
    <Box sx={{
      minWidth: 0,
      minHeight: 0,
      borderRadius: 1.15,
      border: `1px solid ${alpha(ACCENT, 0.18)}`,
      bgcolor: alpha(theme.palette.background.paper, 0.96),
      boxShadow: `0 16px 42px ${alpha(theme.palette.common.black, 0.06)}`,
      ...sx,
    }}>
      {children}
    </Box>
  )
}

function PanelHeader({
  icon,
  title,
  subtitle,
  aside,
}: {
  icon: ReactNode
  title: string
  subtitle: string
  aside?: string
}) {
  return (
    <Box sx={{
      px: 1.15,
      py: 1,
      borderBottom: (theme) => `1px solid ${alpha(theme.palette.divider, 0.78)}`,
      display: 'flex',
      alignItems: 'center',
      gap: 0.85,
      minWidth: 0,
    }}>
      <Box sx={{ color: ACCENT, display: 'grid', placeItems: 'center' }}>{icon}</Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontWeight: 950, lineHeight: 1.15 }}>{title}</Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 650 }} noWrap>{subtitle}</Typography>
      </Box>
      {aside && (
        <Chip
          size="small"
          label={aside}
          sx={{ height: 26, borderRadius: 0.8, fontWeight: 900, color: ACCENT, bgcolor: alpha(ACCENT, 0.11) }}
        />
      )}
    </Box>
  )
}

function ScoreDial({ score, readiness, tone, loading }: { score: number; readiness: number; tone: string; loading: boolean }) {
  const theme = useTheme()
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const dash = circumference * Math.max(0, Math.min(100, score)) / 100
  return (
    <Box sx={{ minHeight: 104, display: 'grid', placeItems: 'center', position: 'relative' }}>
      <Box component="svg" viewBox="0 0 116 116" sx={{ width: 116, height: 116 }}>
        <circle cx="58" cy="58" r="50" fill="none" stroke={alpha(tone, 0.15)} strokeWidth="1" strokeDasharray="4 8" />
        <circle cx="58" cy="58" r={radius} fill="none" stroke={alpha(theme.palette.text.primary, 0.1)} strokeWidth="10" />
        <circle
          cx="58"
          cy="58"
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 58 58)"
        />
        <circle cx="58" cy="58" r="25" fill={theme.palette.background.paper} stroke={alpha(tone, 0.24)} />
      </Box>
      <Box sx={{ position: 'absolute', textAlign: 'center' }}>
        <Typography sx={{ fontSize: 10, fontWeight: 950, color: 'text.secondary' }}>信心</Typography>
        <Typography sx={{ fontSize: 28, lineHeight: 1, fontWeight: 950, color: tone }}>
          {loading ? '--' : score}
        </Typography>
        <Typography sx={{ fontSize: 10, fontWeight: 900, color: 'text.secondary' }}>
          ready {loading ? '--' : readiness}
        </Typography>
      </Box>
    </Box>
  )
}

function RouteNode({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
  tone: string
}) {
  return (
    <Box sx={{
      minWidth: 0,
      minHeight: 76,
      borderRadius: 1,
      border: `1px solid ${alpha(tone, 0.28)}`,
      bgcolor: alpha(tone, 0.07),
      p: 1,
      display: 'grid',
      gridTemplateColumns: '32px minmax(0, 1fr)',
      gap: 0.85,
      alignItems: 'center',
    }}>
      <Box sx={{
        width: 32,
        height: 32,
        borderRadius: 1,
        display: 'grid',
        placeItems: 'center',
        color: tone,
        bgcolor: alpha(tone, 0.13),
      }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 950, color: tone }}>{label}</Typography>
        <Typography sx={{ fontSize: 14, fontWeight: 950 }} noWrap title={value}>{value}</Typography>
        <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }} noWrap title={detail}>{detail}</Typography>
      </Box>
    </Box>
  )
}

function RouteArrow() {
  return (
    <Box sx={{ display: { xs: 'none', md: 'grid' }, placeItems: 'center' }}>
      <Box sx={{ width: '100%', height: 2, bgcolor: alpha(ACCENT, 0.22), position: 'relative' }}>
        <Box sx={{
          position: 'absolute',
          right: -1,
          top: -4,
          width: 10,
          height: 10,
          borderTop: `2px solid ${alpha(ACCENT, 0.5)}`,
          borderRight: `2px solid ${alpha(ACCENT, 0.5)}`,
          transform: 'rotate(45deg)',
        }} />
      </Box>
    </Box>
  )
}

function MiniMetric({ label, value, tone }: { label: string; value: ReactNode; tone: string }) {
  return (
    <Box sx={{ minWidth: 0, borderRadius: 1, border: `1px solid ${alpha(tone, 0.18)}`, bgcolor: alpha(tone, 0.055), px: 0.9, py: 0.75 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 950, color: 'text.secondary' }} noWrap>{label}</Typography>
      <Typography sx={{ mt: 0.25, fontSize: 22, lineHeight: 1, fontWeight: 950, color: tone }} noWrap>{value}</Typography>
    </Box>
  )
}

function ScoreBadge({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Chip
      size="small"
      label={`${label} ${value}`}
      sx={{ height: 28, borderRadius: 0.8, fontWeight: 950, color: tone, bgcolor: alpha(tone, 0.12) }}
    />
  )
}

function DecisionLine({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', gap: 0.8, py: 0.55 }}>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 950 }}>{label}</Typography>
      <Typography sx={{ fontSize: 13, fontWeight: 750, color: 'text.primary' }}>{value}</Typography>
    </Box>
  )
}

function BarRow({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '90px minmax(0, 1fr) 32px', gap: 0.9, alignItems: 'center' }}>
      <Typography sx={{ fontSize: 12.5, fontWeight: 900 }} noWrap>{label}</Typography>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 9,
          borderRadius: 999,
          bgcolor: alpha(tone, 0.12),
          '& .MuiLinearProgress-bar': { borderRadius: 999, bgcolor: tone },
        }}
      />
      <Typography sx={{ textAlign: 'right', fontSize: 12.5, fontWeight: 950, color: tone }}>{number(value)}</Typography>
    </Box>
  )
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Box sx={{
      minHeight: 150,
      borderRadius: 1,
      border: `1px dashed ${alpha(ACCENT, 0.28)}`,
      bgcolor: alpha(ACCENT, 0.045),
      display: 'grid',
      placeItems: 'center',
      textAlign: 'center',
      px: 2,
    }}>
      <Box>
        <Typography sx={{ fontWeight: 950 }}>{title}</Typography>
        <Typography sx={{ mt: 0.45, color: 'text.secondary', fontSize: 13, fontWeight: 650 }}>{subtitle}</Typography>
      </Box>
    </Box>
  )
}
