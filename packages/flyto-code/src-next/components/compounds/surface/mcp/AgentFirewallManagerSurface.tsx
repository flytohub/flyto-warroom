import { useState, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'
import { Activity, ArrowUpRight, ShieldCheck } from 'lucide-react'
import { tOr } from '@lib/i18n'
import { colors } from '@/styles/designTokens'

export type RuntimeTone = 'good' | 'warn' | 'bad' | 'info' | 'neutral' | string

export interface RuntimeMetric {
  label: string
  value: ReactNode
  helper?: string
  tone?: RuntimeTone
}

export interface RuntimeLane {
  title: string
  detail: string
  value?: ReactNode
  status?: string
  tone?: RuntimeTone
}

export type ManagerSurfaceVariant =
  | 'control'
  | 'activity'
  | 'security'
  | 'governance'
  | 'shadow'
  | 'dlp'
  | 'evidence'
  | 'attack-lab'

export interface AgentFirewallManagerSurfaceProps {
  title: string
  subtitle: string
  icon: ReactNode
  status?: string
  decision: string
  decisionDetail?: string
  metrics: RuntimeMetric[]
  primaryTitle: string
  primaryItems: RuntimeLane[]
  secondaryTitle: string
  secondaryItems: RuntimeLane[]
  railSteps?: string[]
  surfaceLabel?: string
  variant?: ManagerSurfaceVariant
  footer?: ReactNode
}

const ACCENT = colors.brand
const CYAN = colors.brandDeep

export function runtimeModeLabel(mode?: string): string {
  const key = String(mode || 'observe')
  const fallbacks: Record<string, string> = {
    observe: '觀察',
    shadow: '影子模式',
    soft_enforce: '軟執法',
    enforce: '正式執法',
  }
  return tOr(`agentFirewall.mode.${key}`, fallbacks[key] ?? key)
}

function toneColor(tone?: RuntimeTone): string {
  if (!tone || tone === 'neutral') return colors.semantic.neutral
  if (tone === 'good') return colors.semantic.success
  if (tone === 'warn') return colors.semantic.warning
  if (tone === 'bad') return colors.semantic.danger
  if (tone === 'info') return ACCENT
  return String(tone)
}

export function AgentFirewallManagerSurface({
  title,
  subtitle,
  icon,
  status,
  decision,
  decisionDetail,
  metrics,
  primaryTitle,
  primaryItems,
  secondaryTitle,
  secondaryItems,
  railSteps,
  surfaceLabel,
  variant = 'control',
  footer,
}: AgentFirewallManagerSurfaceProps) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'

  if (variant === 'security') {
    return (
      <SecurityCenterManagerLayout
        title={title}
        subtitle={subtitle}
        icon={icon}
        status={status}
        decision={decision}
        decisionDetail={decisionDetail}
        metrics={metrics}
        primaryTitle={primaryTitle}
        primaryItems={primaryItems}
        secondaryTitle={secondaryTitle}
        secondaryItems={secondaryItems}
        railSteps={railSteps}
        surfaceLabel={surfaceLabel}
      />
    )
  }

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        p: { xs: 2, md: 3 },
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        background: dark
          ? `linear-gradient(180deg, ${alpha('#120f24', 0.98)}, ${alpha('#17122c', 0.94)})`
          : `linear-gradient(180deg, #faf9ff 0%, #f2efff 100%)`,
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 1,
          borderColor: dark ? alpha(CYAN, 0.32) : alpha(CYAN, 0.2),
          bgcolor: dark ? alpha('#0b1220', 0.92) : alpha('#ffffff', 0.96),
          boxShadow: dark
            ? `0 18px 46px ${alpha('#000', 0.32)}`
            : `0 14px 34px ${alpha('#0f172a', 0.08)}`,
          p: { xs: 1.5, md: 2 },
          flexShrink: 0,
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: '0 auto 0 0',
            width: 4,
            bgcolor: CYAN,
            boxShadow: `0 0 18px ${alpha(CYAN, 0.36)}`,
          },
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: dark ? 0.22 : 0.28,
            background:
              `linear-gradient(${alpha('#64748b', 0.09)} 1px, transparent 1px), linear-gradient(90deg, ${alpha('#64748b', 0.08)} 1px, transparent 1px)`,
            backgroundSize: '28px 28px',
            maskImage: 'linear-gradient(90deg, black 0%, transparent 75%)',
          }}
        />
        <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          <Box sx={{ minWidth: 0, display: 'flex', gap: 1.5, width: '100%' }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 1,
                flexShrink: 0,
                display: 'grid',
                placeItems: 'center',
                color: CYAN,
                bgcolor: dark ? alpha(CYAN, 0.12) : alpha(CYAN, 0.1),
                boxShadow: `inset 0 0 0 1px ${alpha(CYAN, 0.36)}`,
              }}
            >
              {icon}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography component="h1" sx={{ fontSize: { xs: 25, md: 30 }, lineHeight: 1.05, fontWeight: 900, letterSpacing: 0 }}>
                  {title}
                </Typography>
                {status && (
                  <Chip
                    size="small"
                    icon={<Activity size={13} />}
                    label={status}
                    sx={{
                      height: 24,
                      fontSize: 12,
                      fontWeight: 850,
                      color: CYAN,
                      bgcolor: alpha(CYAN, dark ? 0.18 : 0.1),
                      border: `1px solid ${alpha(CYAN, 0.28)}`,
                      '& .MuiChip-icon': { color: 'inherit' },
                    }}
                  />
                )}
              </Box>
              <Typography sx={{ mt: 0.75, color: 'text.secondary', fontSize: 13, maxWidth: 860, lineHeight: 1.58 }}>
                {subtitle}
              </Typography>
              <Box sx={{ mt: 1.4, display: 'flex', flexWrap: 'wrap', gap: 0.75, '& > *': { flex: '1 1 140px' } }}>
                {metrics.map((metric) => <RuntimeMetricTile key={metric.label} metric={metric} />)}
              </Box>
            </Box>
          </Box>

          <SecurityRail steps={railSteps} label={surfaceLabel} />
          <VariantCommandModule variant={variant} metrics={metrics} primaryItems={primaryItems} secondaryItems={secondaryItems} />

          <Box
            sx={{
              borderRadius: 1,
              border: `1px solid ${alpha('#334155', dark ? 0.34 : 0.18)}`,
              bgcolor: dark ? alpha('#0f172a', 0.72) : alpha('#f8fafc', 0.9),
              p: 1.5,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              minWidth: 0,
              boxShadow: `inset 0 0 0 1px ${alpha(CYAN, dark ? 0.08 : 0.06)}`,
            }}
          >
            <Typography sx={{ color: ACCENT, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {tOr('agentFirewall.managerDecision', '管理決策')}
            </Typography>
            <Typography sx={{ mt: 0.6, fontSize: { xs: 19, md: 22 }, fontWeight: 900, lineHeight: 1.18 }}>
              {decision}
            </Typography>
            {decisionDetail && (
              <Typography sx={{ mt: 0.75, color: 'text.secondary', fontSize: 12, lineHeight: 1.55 }}>
                {decisionDetail}
              </Typography>
            )}
          </Box>
        </Box>
      </Paper>

      <Box
        sx={{
          flexShrink: 0,
          overflow: 'visible',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.25,
        }}
      >
        <RuntimePanel title={primaryTitle} items={primaryItems} />
        <RuntimePanel title={secondaryTitle} items={secondaryItems} />
      </Box>

      {footer && <Box sx={{ flexShrink: 0 }}>{footer}</Box>}
    </Box>
  )
}

function SecurityRail({ steps = ['接入', '政策', '外流控制', '證據'], label }: { steps?: string[]; label?: string }) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        flexWrap: 'wrap',
        px: 1,
        py: 0.85,
        borderRadius: 1,
        border: `1px solid ${alpha(CYAN, dark ? 0.28 : 0.18)}`,
        bgcolor: dark ? alpha('#0f172a', 0.52) : alpha('#f6f2ff', 0.74),
      }}
    >
      {label && (
        <Typography sx={{ mr: 0.5, color: CYAN, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.6, whiteSpace: 'nowrap' }}>
          {label}
        </Typography>
      )}
      {steps.map((step, index) => (
        <Box key={step} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          <Box
            sx={{
              width: 24,
              height: 24,
              borderRadius: 1,
              display: 'grid',
              placeItems: 'center',
              color: CYAN,
              fontSize: 11,
              fontWeight: 900,
              fontVariantNumeric: 'tabular-nums',
              border: `1px solid ${alpha(CYAN, 0.26)}`,
              bgcolor: dark ? alpha(CYAN, 0.14) : alpha('#ffffff', 0.84),
            }}
          >
            {index + 1}
          </Box>
          <Typography sx={{ fontSize: 12, fontWeight: 850, color: 'text.secondary', whiteSpace: 'nowrap' }}>
            {step}
          </Typography>
          {index < steps.length - 1 && (
            <Box sx={{ width: { xs: 16, md: 42 }, height: 2, borderRadius: 999, bgcolor: alpha(CYAN, dark ? 0.34 : 0.24) }} />
          )}
        </Box>
      ))}
    </Box>
  )
}

function VariantCommandModule({
  variant,
  metrics,
  primaryItems,
  secondaryItems,
}: {
  variant: ManagerSurfaceVariant
  metrics: RuntimeMetric[]
  primaryItems: RuntimeLane[]
  secondaryItems: RuntimeLane[]
}) {
  if (variant === 'attack-lab') return <AttackLabModule metrics={metrics} items={primaryItems} />
  if (variant === 'activity') return <ActivityModule metrics={metrics} items={secondaryItems} />
  if (variant === 'dlp') return <DlpModule metrics={metrics} items={primaryItems} />
  if (variant === 'evidence') return <EvidenceModule metrics={metrics} items={primaryItems} />
  if (variant === 'governance') return <GovernanceModule metrics={metrics} items={primaryItems} />
  if (variant === 'shadow') return <ShadowModule metrics={metrics} items={primaryItems} />
  if (variant === 'security') return <SecurityCenterModule metrics={metrics} items={primaryItems} />
  return <ControlPlaneModule metrics={metrics} items={secondaryItems} />
}

function CommandFrame({ children, tone = ACCENT }: { children: ReactNode; tone?: string }) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  return (
    <Box
      sx={{
        borderRadius: 1,
        border: `1px solid ${alpha(tone, dark ? 0.32 : 0.2)}`,
        bgcolor: dark ? alpha('#0f172a', 0.56) : alpha('#fbfaff', 0.84),
        p: 1,
        boxShadow: `inset 0 0 0 1px ${alpha('#ffffff', dark ? 0.02 : 0.5)}`,
      }}
    >
      {children}
    </Box>
  )
}

function MiniLabel({ children, color = ACCENT }: { children: ReactNode; color?: string }) {
  return (
    <Typography sx={{ color, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.55 }}>
      {children}
    </Typography>
  )
}

function ControlPlaneModule({ metrics, items }: { metrics: RuntimeMetric[]; items: RuntimeLane[] }) {
  return (
    <CommandFrame>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr 1fr' }, gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          {['入口', '政策', '外流', '證據'].map((step, index) => (
            <Box key={step} sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ height: 8, borderRadius: 999, bgcolor: alpha(ACCENT, 0.12), overflow: 'hidden' }}>
                <Box sx={{ width: `${index === 0 ? 70 : index === 1 ? 46 : 28}%`, height: '100%', bgcolor: alpha(ACCENT, 0.86) }} />
              </Box>
              <Typography sx={{ mt: 0.5, color: 'text.secondary', fontSize: 11, fontWeight: 850 }}>{step}</Typography>
            </Box>
          ))}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.75 }}>
          {metrics.slice(0, 2).map((metric) => <CompactSignal key={metric.label} metric={metric} />)}
        </Box>
      </Box>
      <Typography sx={{ mt: 0.8, color: 'text.secondary', fontSize: 12 }}>
        {items[0]?.detail || '控制面依接入、政策、外流與證據形成可稽核鏈路。'}
      </Typography>
    </CommandFrame>
  )
}

function ActivityModule({ metrics, items }: { metrics: RuntimeMetric[]; items: RuntimeLane[] }) {
  return (
    <CommandFrame>
      <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 0.75 }}>
        {[0, 1, 2, 3, 4].map((index) => (
          <Box key={index} sx={{ flex: 1, minHeight: 54, borderRadius: 1, border: `1px solid ${alpha(ACCENT, 0.16)}`, bgcolor: alpha(ACCENT, index % 2 ? 0.05 : 0.09), display: 'flex', flexDirection: 'column', justifyContent: 'space-between', p: 0.8 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: 999, bgcolor: index < 2 ? colors.semantic.success : alpha(ACCENT, 0.46) }} />
            <Typography sx={{ color: 'text.secondary', fontSize: 11, fontWeight: 850 }}>{['事件', '副作用', '工具', '風險', '決策'][index]}</Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: 0.8, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.75 }}>
        {metrics.slice(0, 3).map((metric) => <CompactSignal key={metric.label} metric={metric} />)}
      </Box>
      <Typography sx={{ mt: 0.8, color: 'text.secondary', fontSize: 12 }}>{items[0]?.detail}</Typography>
    </CommandFrame>
  )
}

function AttackLabModule({ metrics, items }: { metrics: RuntimeMetric[]; items: RuntimeLane[] }) {
  const danger = colors.semantic.danger
  return (
    <CommandFrame tone={danger}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '220px 1fr' }, gap: 1, alignItems: 'stretch' }}>
        <Box sx={{ borderRadius: 1, border: `1px solid ${alpha(danger, 0.28)}`, bgcolor: alpha(danger, 0.08), p: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <MiniLabel color={danger}>Attack chain validation</MiniLabel>
          <Typography sx={{ mt: 0.35, fontSize: 30, fontWeight: 950, color: danger, lineHeight: 1 }}>
            {metrics[0]?.value}
          </Typography>
          <Typography sx={{ mt: 0.35, color: 'text.secondary', fontSize: 12 }}>攻擊鏈情境</Typography>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.7 }}>
          {items.slice(0, 3).map((item, index) => (
            <Box key={item.title} sx={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) auto', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 24, height: 24, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: alpha(danger, 0.12), color: danger, fontWeight: 900, fontSize: 12 }}>{index + 1}</Box>
              <Typography sx={{ minWidth: 0, fontSize: 13, fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</Typography>
              <Chip size="small" label={item.status || 'test'} sx={{ height: 22, color: danger, bgcolor: alpha(danger, 0.1), fontWeight: 850 }} />
            </Box>
          ))}
        </Box>
      </Box>
    </CommandFrame>
  )
}

function DlpModule({ metrics, items }: { metrics: RuntimeMetric[]; items: RuntimeLane[] }) {
  const green = colors.semantic.success
  return (
    <CommandFrame tone={green}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 0.75 }}>
        {['Prompt', 'File', 'Code', 'Payload'].map((label, index) => (
          <Box key={label} sx={{ borderRadius: 1, border: `1px solid ${alpha(green, 0.2)}`, bgcolor: alpha(green, index === 2 ? 0.08 : 0.05), p: 0.9 }}>
            <MiniLabel color={green}>{label}</MiniLabel>
            <Typography sx={{ mt: 0.5, color: 'text.secondary', fontSize: 12 }}>{items[index % items.length]?.title}</Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: 0.8, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {metrics.slice(0, 3).map((metric) => <CompactSignal key={metric.label} metric={metric} />)}
      </Box>
    </CommandFrame>
  )
}

function EvidenceModule({ metrics, items }: { metrics: RuntimeMetric[]; items: RuntimeLane[] }) {
  return (
    <CommandFrame>
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
        {items.slice(0, 3).map((item, index) => (
          <Box key={item.title} sx={{ flex: '1 1 180px', borderRadius: 1, border: `1px solid ${alpha(ACCENT, 0.18)}`, bgcolor: alpha('#fff', 0.5), p: 0.85 }}>
            <Typography sx={{ color: ACCENT, fontSize: 11, fontWeight: 900 }}>0{index + 1}</Typography>
            <Typography sx={{ mt: 0.25, fontSize: 13, fontWeight: 850 }}>{item.title}</Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: 0.8, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.75 }}>
        {metrics.slice(0, 2).map((metric) => <CompactSignal key={metric.label} metric={metric} />)}
      </Box>
    </CommandFrame>
  )
}

function GovernanceModule({ metrics, items }: { metrics: RuntimeMetric[]; items: RuntimeLane[] }) {
  return (
    <CommandFrame>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '160px 1fr' }, gap: 1 }}>
        <Box sx={{ borderRadius: 1, bgcolor: alpha(ACCENT, 0.1), border: `1px solid ${alpha(ACCENT, 0.18)}`, p: 1 }}>
          <MiniLabel>readiness</MiniLabel>
          <Typography sx={{ mt: 0.4, color: ACCENT, fontSize: 28, fontWeight: 950 }}>{metrics[0]?.value}</Typography>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.7 }}>
          {items.slice(0, 3).map((item) => (
            <Box key={item.title} sx={{ borderRadius: 1, border: `1px solid ${alpha(ACCENT, 0.16)}`, p: 0.85 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 850 }}>{item.title}</Typography>
              <Typography sx={{ mt: 0.35, color: 'text.secondary', fontSize: 11, lineHeight: 1.35 }}>{item.status || item.value || 'review'}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </CommandFrame>
  )
}

function ShadowModule({ metrics, items }: { metrics: RuntimeMetric[]; items: RuntimeLane[] }) {
  return (
    <CommandFrame>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {items.slice(0, 3).map((item, index) => (
          <Box key={item.title} sx={{ flex: '1 1 160px', minHeight: 70, borderRadius: 1, border: `1px dashed ${alpha(ACCENT, 0.34)}`, bgcolor: alpha(ACCENT, 0.055), p: 0.9 }}>
            <MiniLabel>{['Unknown', 'Agent', 'Browser'][index]}</MiniLabel>
            <Typography sx={{ mt: 0.45, fontSize: 13, fontWeight: 850 }}>{item.title}</Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: 0.8, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {metrics.slice(0, 3).map((metric) => <CompactSignal key={metric.label} metric={metric} />)}
      </Box>
    </CommandFrame>
  )
}

function SecurityCenterModule({ metrics, items }: { metrics: RuntimeMetric[]; items: RuntimeLane[] }) {
  return (
    <CommandFrame>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 0.75 }}>
        {items.slice(0, 4).map((item, index) => (
          <Box key={item.title} sx={{ borderRadius: 1, border: `1px solid ${alpha(ACCENT, 0.17)}`, bgcolor: index < 2 ? alpha(ACCENT, 0.06) : alpha('#fff', 0.55), p: 0.85 }}>
            <Typography sx={{ color: ACCENT, fontSize: 11, fontWeight: 900 }}>{String(index + 1).padStart(2, '0')}</Typography>
            <Typography sx={{ mt: 0.3, fontSize: 13, fontWeight: 850 }}>{item.title}</Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: 0.8, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {metrics.slice(0, 2).map((metric) => <CompactSignal key={metric.label} metric={metric} />)}
      </Box>
    </CommandFrame>
  )
}

function CompactSignal({ metric }: { metric: RuntimeMetric }) {
  const color = toneColor(metric.tone)
  return (
    <Box sx={{ flex: '1 1 120px', minWidth: 0, borderRadius: 1, border: `1px solid ${alpha(color, 0.18)}`, bgcolor: alpha(color, 0.06), px: 0.9, py: 0.75 }}>
      <Typography sx={{ color: 'text.secondary', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{metric.label}</Typography>
      <Typography sx={{ mt: 0.2, color, fontSize: 18, fontWeight: 950, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{metric.value}</Typography>
    </Box>
  )
}

function SecurityCenterManagerLayout({
  title,
  subtitle,
  icon,
  status,
  decision,
  decisionDetail,
  metrics,
  primaryTitle,
  primaryItems,
  secondaryTitle,
  secondaryItems,
  railSteps,
  surfaceLabel,
}: AgentFirewallManagerSurfaceProps) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const [tab, setTab] = useState<'overview' | 'controls' | 'decisions'>('overview')
  const tabs = [
    { id: 'overview' as const, label: '總控態勢' },
    { id: 'controls' as const, label: primaryTitle },
    { id: 'decisions' as const, label: secondaryTitle },
  ]

  const activeItems = tab === 'controls' ? primaryItems : tab === 'decisions' ? secondaryItems : []

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        p: { xs: 2, md: 3 },
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        background: dark
          ? `linear-gradient(180deg, ${alpha('#120f24', 0.98)}, ${alpha('#17122c', 0.94)})`
          : `linear-gradient(180deg, #faf9ff 0%, #f3efff 100%)`,
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          flexShrink: 0,
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 1,
          borderColor: alpha(CYAN, dark ? 0.34 : 0.22),
          bgcolor: dark ? alpha('#0b1220', 0.92) : alpha('#ffffff', 0.97),
          p: { xs: 1.5, md: 2 },
          boxShadow: dark ? `0 18px 46px ${alpha('#000', 0.32)}` : `0 14px 34px ${alpha('#0f172a', 0.08)}`,
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: '0 auto 0 0',
            width: 4,
            bgcolor: CYAN,
          },
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: dark ? 0.18 : 0.24,
            background: `linear-gradient(${alpha('#64748b', 0.08)} 1px, transparent 1px), linear-gradient(90deg, ${alpha('#64748b', 0.08)} 1px, transparent 1px)`,
            backgroundSize: '28px 28px',
            maskImage: 'linear-gradient(90deg, black 0%, transparent 72%)',
          }}
        />
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.4 }}>
            <Box sx={{ width: 48, height: 48, borderRadius: 1, flexShrink: 0, display: 'grid', placeItems: 'center', color: CYAN, bgcolor: alpha(CYAN, dark ? 0.15 : 0.1), boxShadow: `inset 0 0 0 1px ${alpha(CYAN, 0.34)}` }}>
              {icon}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography component="h1" sx={{ fontSize: { xs: 26, md: 32 }, lineHeight: 1.02, fontWeight: 950, letterSpacing: 0 }}>
                  {title}
                </Typography>
                {status && (
                  <Chip size="small" icon={<Activity size={13} />} label={status} sx={{ height: 24, color: CYAN, bgcolor: alpha(CYAN, 0.1), border: `1px solid ${alpha(CYAN, 0.26)}`, fontWeight: 850, '& .MuiChip-icon': { color: 'inherit' } }} />
                )}
              </Box>
              <Typography sx={{ mt: 0.6, color: 'text.secondary', fontSize: 13, lineHeight: 1.55, maxWidth: 920 }}>
                {subtitle}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ mt: 1.25, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {metrics.map((metric) => <SecurityMetric key={metric.label} metric={metric} />)}
          </Box>

          <Box sx={{ mt: 1.25 }}>
            <SecurityRail steps={railSteps} label={surfaceLabel} />
          </Box>

          <Box sx={{ mt: 1.25, borderRadius: 1, border: `1px solid ${alpha(CYAN, 0.18)}`, bgcolor: dark ? alpha('#0f172a', 0.62) : alpha('#f8fafc', 0.94), p: 1.25 }}>
            <MiniLabel>管理決策</MiniLabel>
            <Typography sx={{ mt: 0.45, fontSize: { xs: 18, md: 22 }, fontWeight: 950, lineHeight: 1.18 }}>
              {decision}
            </Typography>
            {decisionDetail && (
              <Typography sx={{ mt: 0.5, color: 'text.secondary', fontSize: 12, lineHeight: 1.5 }}>
                {decisionDetail}
              </Typography>
            )}
          </Box>
        </Box>
      </Paper>

      <Paper
        variant="outlined"
        sx={{
          minHeight: 0,
          flex: 1,
          overflow: 'hidden',
          borderRadius: 1,
          borderColor: alpha(CYAN, dark ? 0.26 : 0.16),
          bgcolor: dark ? alpha('#0b1220', 0.88) : alpha('#ffffff', 0.97),
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ flexShrink: 0, display: 'flex', gap: 0.6, p: 0.8, borderBottom: `1px solid ${alpha('#334155', dark ? 0.28 : 0.12)}`, bgcolor: dark ? alpha('#0f172a', 0.68) : alpha('#f8fafc', 0.92), overflowX: 'auto' }}>
          {tabs.map((item) => (
            <Button
              key={item.id}
              size="small"
              onClick={() => setTab(item.id)}
              sx={{
                height: 34,
                px: 1.4,
                borderRadius: 1,
                flexShrink: 0,
                fontWeight: 900,
                color: tab === item.id ? '#fff' : CYAN,
                bgcolor: tab === item.id ? CYAN : alpha(CYAN, 0.08),
                border: `1px solid ${alpha(CYAN, tab === item.id ? 0.4 : 0.18)}`,
                '&:hover': { bgcolor: tab === item.id ? CYAN : alpha(CYAN, 0.14) },
              }}
            >
              {item.label}
            </Button>
          ))}
        </Box>

        <Box sx={{ minHeight: 0, flex: 1, overflow: 'auto', p: 1 }}>
          {tab === 'overview' ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.1fr 0.9fr' }, gap: 1 }}>
              <SecurityCenterModule metrics={metrics} items={primaryItems} />
              <CommandFrame>
                <MiniLabel>下一步</MiniLabel>
                <Box sx={{ mt: 0.8, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {[...primaryItems.slice(0, 2), ...secondaryItems.slice(0, 2)].map((item) => (
                    <RuntimeLaneRow key={`${item.title}-${item.detail}`} item={item} />
                  ))}
                </Box>
              </CommandFrame>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {activeItems.map((item) => <RuntimeLaneRow key={`${item.title}-${item.detail}`} item={item} />)}
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  )
}

function SecurityMetric({ metric }: { metric: RuntimeMetric }) {
  const color = toneColor(metric.tone)
  return (
    <Box sx={{ flex: '1 1 170px', minWidth: 0, borderRadius: 1, border: `1px solid ${alpha(color, 0.2)}`, borderTop: `3px solid ${alpha(color, 0.8)}`, bgcolor: alpha(color, 0.055), px: 1, py: 0.85 }}>
      <Typography sx={{ color: 'text.secondary', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{metric.label}</Typography>
      <Typography sx={{ mt: 0.25, color, fontSize: 22, fontWeight: 950, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{metric.value}</Typography>
      {metric.helper && <Typography sx={{ mt: 0.3, color: 'text.secondary', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{metric.helper}</Typography>}
    </Box>
  )
}

function RuntimeMetricTile({ metric }: { metric: RuntimeMetric }) {
  const theme = useTheme()
  const color = toneColor(metric.tone)
  return (
    <Box
      sx={{
        minWidth: 0,
        borderRadius: 1,
        border: `1px solid ${alpha('#334155', theme.palette.mode === 'dark' ? 0.32 : 0.16)}`,
        borderLeft: `3px solid ${alpha(color, 0.84)}`,
        bgcolor: theme.palette.mode === 'dark' ? alpha('#0f172a', 0.7) : alpha('#f8fafc', 0.96),
        p: 1,
        boxShadow: theme.palette.mode === 'dark' ? 'none' : `0 8px 18px ${alpha('#0f172a', 0.04)}`,
      }}
    >
      <Typography sx={{ color: 'text.secondary', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {metric.label}
      </Typography>
      <Typography sx={{ mt: 0.25, color, fontSize: 23, fontWeight: 900, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {metric.value}
      </Typography>
      {metric.helper && (
        <Typography sx={{ mt: 0.45, color: 'text.secondary', fontSize: 11, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {metric.helper}
        </Typography>
      )}
    </Box>
  )
}

function RuntimePanel({ title, items }: { title: string; items: RuntimeLane[] }) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  return (
    <Paper
      variant="outlined"
      sx={{
        minHeight: 0,
        overflow: 'visible',
        borderRadius: 1,
        borderColor: dark ? alpha(CYAN, 0.22) : alpha('#0f172a', 0.14),
        bgcolor: dark ? alpha('#0b1220', 0.86) : alpha('#ffffff', 0.96),
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        boxShadow: dark ? `0 14px 34px ${alpha('#000', 0.22)}` : `0 10px 24px ${alpha('#0f172a', 0.06)}`,
      }}
    >
      <Box sx={{ px: 1.5, py: 1.05, borderBottom: `1px solid ${alpha('#334155', dark ? 0.26 : 0.12)}`, bgcolor: dark ? alpha('#0f172a', 0.66) : alpha('#f8fafc', 0.92), display: 'flex', alignItems: 'center', gap: 1 }}>
        <ShieldCheck size={15} style={{ color: CYAN }} />
        <Typography sx={{ fontSize: 14, fontWeight: 900 }}>{title}</Typography>
      </Box>
      <Box sx={{ minHeight: 0, overflow: 'visible', p: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {items.map((item) => <RuntimeLaneRow key={`${item.title}-${item.detail}`} item={item} />)}
      </Box>
    </Paper>
  )
}

function RuntimeLaneRow({ item }: { item: RuntimeLane }) {
  const theme = useTheme()
  const color = toneColor(item.tone)
  return (
    <Box
      sx={{
        borderRadius: 1,
        border: `1px solid ${alpha('#334155', theme.palette.mode === 'dark' ? 0.28 : 0.13)}`,
        borderLeft: `3px solid ${alpha(color, 0.8)}`,
        bgcolor: theme.palette.mode === 'dark' ? alpha('#0f172a', 0.62) : alpha('#f8fafc', 0.9),
        p: 1,
        display: 'flex',
        justifyContent: 'space-between',
        gap: 1,
        alignItems: 'center',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 850, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.title}
        </Typography>
        <Typography sx={{ mt: 0.35, color: 'text.secondary', fontSize: 12, lineHeight: 1.45 }}>
          {item.detail}
        </Typography>
        {item.status && (
          <Chip
            size="small"
            label={item.status}
            sx={{ mt: 0.75, height: 22, fontSize: 11, fontWeight: 800, color, bgcolor: alpha(color, 0.11), border: `1px solid ${alpha(color, 0.2)}` }}
          />
        )}
      </Box>
      {item.value != null && (
        <Box sx={{ minWidth: 54, height: 34, px: 1, borderRadius: 1, border: `1px solid ${alpha(color, 0.22)}`, bgcolor: alpha(color, theme.palette.mode === 'dark' ? 0.12 : 0.08), display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5, color, fontSize: 20, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
          {item.value}
          <ArrowUpRight size={14} />
        </Box>
      )}
    </Box>
  )
}
