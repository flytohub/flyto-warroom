/**
 * AttackPathsView — top-level "where would an attacker start?" view.
 *
 * Sits between Dashboard and Pulse in the sidebar:
 *   Dashboard     — how do we score overall? (executive lens)
 *   AttackPaths   — where would an attacker start, and why? (attacker lens)
 *   Pulse         — which finding should I act on now? (defender lens)
 *
 * Backend: `GET /api/v1/code/orgs/{id}/attack-paths`. Read-only,
 * no scanning. The page is intentionally a SHORT list (Top 5 by
 * default) — the goal is convergence, not another scanner result
 * page. Operators who want the long tail toggle to `min_confidence=low`.
 *
 * Design doc: `flyto-engine/docs/ATTACK_PATHS_DESIGN.md`.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Box, Paper, Typography, Chip, Collapse, IconButton, Stack, Divider,
  Tooltip, Button,
} from '@mui/material'
import {
  ChevronDown, ChevronUp, Radar, KeyRound, Globe, FileSearch, Mail,
  Truck, Sparkles, ShieldAlert, ExternalLink, AlertCircle,
  Crosshair, Activity, Cpu, Network, Target,
} from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import { useOrg } from '@hooks/useOrg'
import { qk } from '@lib/queryKeys'
import {
  getAttackPaths,
  type AttackPathCandidate,
  type AttackPathCategory,
  type AttackPathLabel,
  type AttackPathEvidence,
  type WhyNowSignal,
} from '@lib/engine'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { DataBoundary } from '@atoms/DataBoundary'
import { FlytoSelect } from '@atoms/FlytoSelect'
import { JellyCard } from '@atoms/JellyCard'
import { colors, softBg } from '@/styles/designTokens'

// Page accent — attack-paths lives in the EXPOSURE sidebar group, so
// it inherits the tech-cyan section accent for visual continuity with
// CTEM / Posture. Cards add their own per-category tone on top.
const ACCENT = colors.section.exposure

// Header accent — the offense-red section colour the MANAGER lens
// carries on its hero header. Mirrored here (a thin left rail + tinted
// recon badge) so toggling manager↔engineer feels like the same page.
const HEADER_ACCENT = colors.semantic.danger // #ef4444

// ── Per-category icon mapping. Drives the card's left rail colour.
// Conservative palette — one accent per category, no rainbow.
const CATEGORY_META: Record<AttackPathCategory, {
  Icon: typeof Radar
  tone: string
  labelKey: string
  fallback: string
}> = {
  initial_access:        { Icon: KeyRound,    tone: '#ef4444', labelKey: 'code.attackpath.cat.initial_access',        fallback: 'Initial Access' },
  web_app:               { Icon: Globe,       tone: '#38bdf8', labelKey: 'code.attackpath.cat.web_app',               fallback: 'Web Portal' },
  information_exposure:  { Icon: FileSearch,  tone: '#a78bfa', labelKey: 'code.attackpath.cat.information_exposure',  fallback: 'Public Exposure' },
  email_spoofing:        { Icon: Mail,        tone: '#f97316', labelKey: 'code.attackpath.cat.email_spoofing',        fallback: 'Email Spoofing' },
  supply_chain:          { Icon: Truck,       tone: '#eab308', labelKey: 'code.attackpath.cat.supply_chain',          fallback: 'Supply Chain' },
}

// ── Label → MUI color mapping (chips). Keep two axes visually
// distinct: Confidence uses semantic severity tones, Validation
// Readiness uses a calmer grey-to-green ramp so the operator
// never confuses "this is real" with "we can test it now".
function confidenceColor(label: AttackPathLabel): 'error' | 'warning' | 'default' {
  if (label === 'high') return 'error'
  if (label === 'medium') return 'warning'
  return 'default'
}
function readinessColor(label: AttackPathLabel): 'success' | 'info' | 'default' {
  if (label === 'high') return 'success'
  if (label === 'medium') return 'info'
  return 'default'
}

// ── WhyNow chip kind → short-form copy.
const WHYNOW_LABEL: Record<string, string> = {
  policy_regression: 'policy regressed',
  new_asset:         'new this week',
  leak_recent:       'leak recent',
  freshness_drop:    'stale surface',
  advisory_recent:   'advisory recent',
}

interface AttackPathsViewProps {
  /** When the operator clicks a target row in a candidate, jump to
   *  the relevant war-room section. Optional; pages without nav
   *  context just render the chip read-only. */
  onNavigate?: (sectionId: string) => void
}

export function AttackPathsView({ onNavigate: _onNavigate }: AttackPathsViewProps = {}) {
  const { org, loading: orgLoading, ready: orgReady, error: orgError } = useOrg()
  const orgId = org?.id

  // UI default is `medium` — design's "page should feel like a
  // short-list, not a scanner" rule. Operator toggles to `low`
  // when they want the long tail.
  const [minConfidence, setMinConfidence] = useState<AttackPathLabel>('medium')
  const [sort, setSort] = useState<'confidence' | 'readiness' | 'why_now'>('confidence')

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: qk.ctem.attackPathsFiltered(orgId, minConfidence, sort),
    queryFn: () => getAttackPaths(orgId!, { limit: 5, minConfidence, sort }),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })

  const candidates = data?.candidates ?? []
  const summary = data?.signals_summary

  // Severity options for FlytoSelect — labels created at render so
  // tOr() sees the latest i18n cache (memory: tOr at module level
  // returns stale fallbacks).
  const confidenceOpts = useMemo(() => [
    { value: 'low',    label: t('code.attackpath.filter.confidence.low') },
    { value: 'medium', label: t('code.attackpath.filter.confidence.medium') },
    { value: 'high',   label: t('code.attackpath.filter.confidence.high') },
  ], [])
  const sortOpts = useMemo(() => [
    { value: 'confidence', label: t('code.attackpath.sort.confidence') },
    { value: 'readiness',  label: t('code.attackpath.sort.readiness') },
    { value: 'why_now',    label: t('code.attackpath.sort.why_now') },
  ], [])

  return (
    <Box sx={{ height: '100%', overflowY: 'auto', p: 3 }}>
      <Box sx={{ position: 'relative', pl: 2 }}>
        {/* Offense-red header rail — matches the manager lens accent so
            the mode toggle reads as one continuous page. */}
        <Box sx={{
          position: 'absolute', left: 0, top: 2, bottom: 6, width: 3,
          borderRadius: 2, bgcolor: HEADER_ACCENT,
          boxShadow: `0 0 12px ${softBg(HEADER_ACCENT, 0.6)}`,
        }} />
      <FlytoPageHeader
        title={t('code.attackpath.title')}
        subtitle={t('code.attackpath.subtitle')}
        action={
          <Stack direction="row" spacing={1.5} alignItems="center">
            {/* Recon-mode badge — signals "passive, attacker lens" in
                a terminal-style monospace pill for tech credibility. */}
            <Tooltip title={t('code.attackpath.reconModeTip')}>
              <Box sx={{
                display: { xs: 'none', md: 'inline-flex' }, alignItems: 'center', gap: 0.75,
                px: 1.25, py: 0.5, borderRadius: 1.5,
                border: '1px solid', borderColor: softBg(HEADER_ACCENT, 0.4),
                bgcolor: softBg(HEADER_ACCENT, 0.08), color: HEADER_ACCENT,
                fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.08em', whiteSpace: 'nowrap',
              }}>
                <Crosshair size={13} />
                RECON // PASSIVE
              </Box>
            </Tooltip>
            <FlytoSelect
              value={sort}
              options={sortOpts}
              onChange={v => setSort(v as 'confidence' | 'readiness' | 'why_now')}
              size="sm"
              width={160}
            />
            <FlytoSelect
              value={minConfidence}
              options={confidenceOpts}
              onChange={v => setMinConfidence(v as AttackPathLabel)}
              size="sm"
              width={140}
            />
          </Stack>
        }
      />
      </Box>

      <DataBoundary
        isLoading={(orgLoading && !org) || isLoading}
        isFetching={isFetching}
        isError={!!orgError || isError}
        error={orgError ?? error}
        onRetry={() => { void refetch() }}
        hasData={!!data || (!isLoading && !isError && !!orgId && !(orgReady && !org))}
        empty={orgReady && !org}
        label="attack paths"
        emptyTitle={t('code.attackpath.workspaceUnavailable')}
        emptyDescription={t('code.attackpath.workspaceUnavailableDesc')}
        loadingVariant="spinner"
      >
        <>
          <SignalsBar summary={summary} totalShown={candidates.length} total={data?.total ?? 0} />
          <Stack spacing={1.75} sx={{ mt: 2 }}>
            {candidates.length === 0 && <EmptyState minConfidence={minConfidence} onShowAll={() => setMinConfidence('low')} />}
            {candidates.map((c, i) => (
              <CandidateCard key={c.id} candidate={c} rank={i + 1} delay={i * 0.05} />
            ))}
          </Stack>
          <Disclaimer />
        </>
      </DataBoundary>
    </Box>
  )
}

// ─────────────────────────────────────────────────────────────────
// SignalsBar — the "you have N of these" header. Helps the
// operator gauge whether the short list reflects efficiency or
// data sparseness.
// ─────────────────────────────────────────────────────────────────

function SignalsBar({
  summary,
  totalShown,
  total,
}: {
  summary: { external_assets: number; leak_signals: number; tech_fingerprints: number; pentest_projects: number; dmarc_status: string; why_now_signals_last_30d: number } | undefined
  totalShown: number
  total: number
}) {
  if (!summary) return null
  const dmarcOk = summary.dmarc_status === 'reject' || summary.dmarc_status === 'quarantine'
  const dmarcTone = dmarcOk ? colors.semantic.success
    : (summary.dmarc_status === 'none' || summary.dmarc_status === 'missing') ? colors.semantic.warning
    : colors.semantic.neutral
  return (
    <JellyCard delay={0} noHover>
    <Paper
      elevation={0}
      sx={{
        mt: 2, p: 1.5, borderRadius: 3,
        border: '1px solid', borderColor: 'divider',
        // Faint scan-line glow at the top edge → "telemetry feed".
        background: `linear-gradient(180deg, ${softBg(ACCENT, 0.05)} 0%, transparent 60%)`,
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5, mb: 1.25 }}>
        <Radar size={14} style={{ color: ACCENT }} />
        <Typography sx={{
          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'text.secondary',
        }}>
          {t('code.attackpath.telemetry')}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Box sx={{
          fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 700,
          color: ACCENT, px: 1, py: 0.25, borderRadius: 1,
          bgcolor: softBg(ACCENT, 0.1),
        }}>
          {totalShown} / {total}
        </Box>
      </Box>
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' },
        gap: 1,
      }}>
        <TelemetryTile icon={<Network size={16} />} tone={colors.tech}            value={summary.external_assets}            labelKey="code.attackpath.summary.external_assets" fallback="External assets" />
        <TelemetryTile icon={<KeyRound size={16} />} tone={colors.semantic.danger} value={summary.leak_signals}              labelKey="code.attackpath.summary.leak_signals"    fallback="Leak signals" />
        <TelemetryTile icon={<Cpu size={16} />}      tone={colors.brand}           value={summary.tech_fingerprints}          labelKey="code.attackpath.summary.tech"            fallback="Tech fingerprints" />
        <TelemetryTile icon={<Crosshair size={16} />} tone={colors.semantic.warning} value={summary.pentest_projects}         labelKey="code.attackpath.summary.pentests"        fallback="Pentest projects" />
        <TelemetryTile icon={<Activity size={16} />} tone={colors.severity.high}    value={summary.why_now_signals_last_30d}   labelKey="code.attackpath.summary.whynow_30d"      fallback="Recent (30d)" />
        {summary.dmarc_status && (
          <TelemetryTile icon={<Mail size={16} />} tone={dmarcTone} value={summary.dmarc_status.toUpperCase()} labelKey="code.attackpath.summary.dmarc" fallback="DMARC" mono />
        )}
      </Box>
    </Paper>
    </JellyCard>
  )
}

function TelemetryTile({
  icon, tone, value, labelKey, fallback, mono,
}: { icon: React.ReactNode; tone: string; value: number | string; labelKey: string; fallback: string; mono?: boolean }) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.25,
      px: 1.25, py: 1, borderRadius: 2,
      border: '1px solid', borderColor: softBg(tone, 0.25),
      bgcolor: softBg(tone, 0.05),
      minWidth: 0,
    }}>
      <Box sx={{
        width: 32, height: 32, borderRadius: 1.5, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: softBg(tone, 0.14), color: tone,
      }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{
          fontFamily: 'ui-monospace, monospace',
          fontSize: mono ? 14 : 18, fontWeight: 800, lineHeight: 1.1,
          color: 'text.primary',
        }}>
          {value}
        </Typography>
        <Typography noWrap sx={{
          fontSize: 12, color: 'text.secondary',
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          {tOr(labelKey, fallback)}
        </Typography>
      </Box>
    </Box>
  )
}

function EmptyState({ minConfidence, onShowAll }: { minConfidence: AttackPathLabel; onShowAll?: () => void }) {
  return (
    <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
      <Sparkles size={28} style={{ opacity: 0.5, marginBottom: 8 }} />
      <Typography variant="h6" sx={{ mb: 1 }}>
        {t('code.attackpath.empty.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {minConfidence === 'low'
          ? t('code.attackpath.empty.low')
          : t('code.attackpath.empty.medium')}
      </Typography>
      {/* One-click escape from the (intentional) medium+ default so the page
          never dead-ends — flips the filter to All instead of making the
          operator hunt for the dropdown. */}
      {minConfidence !== 'low' && onShowAll && (
        <Button onClick={onShowAll} variant="outlined" size="small"
          sx={{ mt: 2, textTransform: 'none', fontWeight: 600, borderRadius: 2 }}>
          {t('code.attackpath.empty.showAll')}
        </Button>
      )}
    </Paper>
  )
}

function Disclaimer() {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2, mt: 3, borderRadius: 2.5, display: 'flex', alignItems: 'flex-start', gap: 1.5,
        border: '1px solid', borderColor: softBg(ACCENT, 0.25),
        bgcolor: softBg(ACCENT, 0.04),
      }}
    >
      <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: 2, color: ACCENT }} />
      <Typography variant="body2" sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.6 }}>
        {t('code.attackpath.disclaimer')}
      </Typography>
    </Paper>
  )
}

// ─────────────────────────────────────────────────────────────────
// CandidateCard — one Top-N row.
// ─────────────────────────────────────────────────────────────────

function CandidateCard({ candidate: c, rank, delay }: { candidate: AttackPathCandidate; rank: number; delay: number }) {
  const [expanded, setExpanded] = useState(false)
  const meta = CATEGORY_META[c.category] ?? CATEGORY_META.initial_access
  const { Icon, tone, labelKey, fallback } = meta

  return (
    <JellyCard delay={delay} noHover>
    <Paper
      elevation={0}
      sx={{
        position: 'relative', overflow: 'hidden', borderRadius: 3,
        border: '1px solid', borderColor: softBg(tone, 0.3),
        bgcolor: 'background.paper',
        // Per-category tone wash, fading out across the card — gives
        // each hypothesis its own threat colour without a heavy fill.
        backgroundImage: `linear-gradient(115deg, ${softBg(tone, 0.07)} 0%, transparent 50%)`,
        transition: 'border-color 160ms, box-shadow 160ms',
        '&:hover': {
          borderColor: softBg(tone, 0.55),
          boxShadow: `0 0 0 1px ${softBg(tone, 0.25)}, 0 10px 34px ${softBg(tone, 0.14)}`,
        },
      }}
    >
      {/* Glowing left rail — the card's category signature. */}
      <Box sx={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
        bgcolor: tone, boxShadow: `0 0 18px ${tone}`,
      }} />

      <Box sx={{ display: 'flex', gap: 2, p: 2, pl: 2.5 }}>
        {/* Category glyph — rounded tile with inset ring. */}
        <Box sx={{
          width: 46, height: 46, borderRadius: 2, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: softBg(tone, 0.14), color: tone,
          boxShadow: `inset 0 0 0 1px ${softBg(tone, 0.3)}`,
        }}>
          <Icon size={22} />
        </Box>

        {/* Body */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75, flexWrap: 'wrap' }}>
            <Box sx={{
              fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 700,
              color: 'text.secondary', opacity: 0.7,
            }}>
              #{String(rank).padStart(2, '0')}
            </Box>
            <Chip
              size="small"
              label={tOr(labelKey, fallback)}
              sx={{
                height: 19, fontSize: 12, fontWeight: 700,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                bgcolor: softBg(tone, 0.14), color: tone,
                border: `1px solid ${softBg(tone, 0.3)}`,
              }}
            />
            <Box sx={{ flex: 1 }} />
            <Tooltip title={t('code.attackpath.readiness.tooltip')}>
              <Chip
                size="small"
                variant="outlined"
                color={readinessColor(c.validation_readiness)}
                icon={<Target size={11} />}
                label={`${t('code.attackpath.readiness.label')}: ${c.validation_readiness.toUpperCase()}`}
                sx={{ fontWeight: 600, fontSize: 12 }}
              />
            </Tooltip>
          </Box>

          <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3, mb: 0.75 }}>
            {tOr(c.title_key, c.title)}
          </Typography>

          <Typography variant="body2" sx={{ fontSize: 14, lineHeight: 1.6, mb: 1, color: 'text.secondary' }}>
            {tOr(c.desc_key, c.description)}
          </Typography>

          {c.targets.length > 0 && (
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', mb: 1, gap: 0.75 }}>
              {c.targets.slice(0, 6).map((t, i) => (
                <Chip
                  key={i}
                  size="small"
                  variant="outlined"
                  icon={<ExternalLink size={11} />}
                  label={t.value}
                  sx={{
                    fontFamily: 'ui-monospace, monospace', fontSize: 12,
                    bgcolor: softBg(colors.tech, 0.06),
                    borderColor: softBg(colors.tech, 0.3),
                    '& .MuiChip-icon': { color: colors.tech },
                  }}
                />
              ))}
              {c.targets.length > 6 && (
                <Chip size="small" variant="outlined" label={`+${c.targets.length - 6}`}
                  sx={{ fontSize: 12, fontFamily: 'ui-monospace, monospace' }} />
              )}
            </Stack>
          )}

          {c.why_now && c.why_now.length > 0 && (
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', mb: 1, gap: 0.5 }}>
              {c.why_now.map((w, i) => <WhyNowChip key={i} signal={w} />)}
            </Stack>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
            <IconButton
              size="small"
              onClick={() => setExpanded(e => !e)}
	              aria-label={expanded ? t('hardcoded.collapse.expand.2493b441') : t('common.expand')}
              sx={{ color: tone }}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </IconButton>
            <Typography variant="caption" sx={{ fontSize: 12, color: 'text.secondary' }}>
              {expanded
                ? t('code.attackpath.collapse')
                : t('code.attackpath.expand')}
            </Typography>
          </Box>
        </Box>

        {/* Confidence meter — the "threat gauge". Monospace score with
            a tone-glow + a thin fill bar reading as 0–100. */}
        <ConfidenceMeter score={c.confidence_score} tone={tone} confidence={c.confidence} />
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ px: 2.5, pb: 2 }}>
          <Divider sx={{ mb: 1.5 }} />
          <CardDetails candidate={c} tone={tone} />
        </Box>
      </Collapse>
    </Paper>
    </JellyCard>
  )
}

// ConfidenceMeter — the per-card threat gauge. The numeric score gets
// a monospace, tone-glowing treatment so it reads as a "signal level"
// rather than a soft chip; the bar underneath gives an at-a-glance fill.
function ConfidenceMeter({ score, tone, confidence }: { score: number; tone: string; confidence: AttackPathLabel }) {
  const conf = confidenceColor(confidence)
  const confTone = conf === 'error' ? colors.semantic.danger : conf === 'warning' ? colors.semantic.warning : colors.semantic.neutral
  return (
    <Tooltip title={t('code.attackpath.confidence.tooltip')}>
      <Box sx={{
        flexShrink: 0, width: 92, textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5,
        pl: 1, borderLeft: '1px solid', borderColor: 'divider',
      }}>
        <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
          {t('code.attackpath.confidence.label')}
        </Typography>
        <Typography sx={{
          fontFamily: 'ui-monospace, monospace', fontSize: 30, fontWeight: 800, lineHeight: 1,
          color: tone, textShadow: `0 0 18px ${softBg(tone, 0.7)}`,
        }}>
          {score}
        </Typography>
        <Box sx={{ width: '100%', height: 4, borderRadius: 2, bgcolor: softBg(tone, 0.15), overflow: 'hidden' }}>
          <Box sx={{ width: `${Math.max(0, Math.min(100, score))}%`, height: '100%', bgcolor: tone, boxShadow: `0 0 8px ${tone}` }} />
        </Box>
        <Box sx={{
          fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
          color: confTone, px: 0.75, borderRadius: 0.75, bgcolor: softBg(confTone, 0.12),
        }}>
          {confidence.toUpperCase()}
        </Box>
      </Box>
    </Tooltip>
  )
}

function WhyNowChip({ signal }: { signal: WhyNowSignal }) {
  const short = WHYNOW_LABEL[signal.kind] ?? signal.kind
  const days = signal.days_ago === 0
    ? t('code.attackpath.whynow.today')
    : `${signal.days_ago}d`
  return (
    <Tooltip title={tOr(signal.detail_key || '', signal.detail)}>
      <Chip
        size="small"
        icon={<AlertCircle size={12} />}
        label={`${short} · ${days}`}
        color="warning"
        variant="outlined"
        sx={{ fontSize: 12 }}
      />
    </Tooltip>
  )
}

function CardDetails({ candidate: c, tone }: { candidate: AttackPathCandidate; tone: string }) {
  return (
    <Stack spacing={2}>
      <Section title={t('code.attackpath.section.risk_logic')} tone={tone}>
        <Typography variant="body2" sx={{ fontSize: 14, lineHeight: 1.6 }}>
          {tOr(c.risk_logic_key, c.risk_logic)}
        </Typography>
      </Section>

      <Section title={t('code.attackpath.section.evidence')} tone={tone}>
        <Stack spacing={0.75}>
          {c.evidence.map((e, i) => <EvidenceRow key={i} evidence={e} />)}
        </Stack>
      </Section>

      <Section title={t('code.attackpath.section.red_team')} tone={tone}>
        <Stack component="ul" sx={{ pl: 2.5, m: 0 }} spacing={0.5}>
          {c.red_team_validation.map((step, i) => (
            <Typography key={i} component="li" variant="body2" sx={{ fontSize: 14 }}>{step}</Typography>
          ))}
        </Stack>
      </Section>

      <Section title={t('code.attackpath.section.restrictions')} tone={tone}>
        <Stack component="ul" sx={{ pl: 2.5, m: 0 }} spacing={0.5}>
          {c.restrictions.map((step, i) => (
            <Typography key={i} component="li" variant="body2" sx={{ fontSize: 13, color: 'text.secondary' }}>{step}</Typography>
          ))}
        </Stack>
      </Section>

      <Box sx={{
        display: 'flex', flexWrap: 'wrap', gap: 2, mt: 0.5, pt: 1.5,
        borderTop: '1px solid', borderColor: 'divider',
        fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'text.secondary',
      }}>
        <span>
          confidence=<b style={{ color: tone }}>{c.confidence_score}</b>/100
          {' '}(exposure {c.exposure} · correlation {c.correlation})
        </span>
        <span>
          readiness=<b style={{ color: tone }}>{c.validation_readiness_score}</b>/100
        </span>
      </Box>
    </Stack>
  )
}

function Section({ title, tone, children }: { title: string; tone: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography
        variant="overline"
        sx={{ fontSize: 12, fontWeight: 700, color: tone, letterSpacing: '0.05em', display: 'block', mb: 0.5 }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  )
}

function EvidenceRow({ evidence: e }: { evidence: AttackPathEvidence }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
      <Chip size="small" label={e.source}
        sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, height: 20 }} variant="outlined" />
      <Typography variant="body2" sx={{ fontSize: 13, flex: 1 }}>
        {tOr(e.detail_key || '', e.detail)}
      </Typography>
      <Typography sx={{
        fontFamily: 'ui-monospace, monospace', fontSize: 12,
        color: 'text.secondary', minWidth: 50, textAlign: 'right',
      }}>
        w={e.weight.toFixed(1)}
      </Typography>
    </Box>
  )
}
