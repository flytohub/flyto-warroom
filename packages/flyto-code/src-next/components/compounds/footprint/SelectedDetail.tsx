/**
 * SelectedDetail.tsx — right-panel detail card for the currently-
 * selected Footprint entity.
 *
 * Extracted from FootprintGraphView.tsx 2026-05-23 (was 3500 lines).
 * Bundles three related pieces:
 *   SelectedDetail   — the orchestrator's selection drawer
 *   FeedbackButtons  — operator 👍/👎/unsure on classifier verdict
 *   ScoreGauge       — mini horizontal 0..100 gauge with tier-color
 *
 * Owns its own queries (path score) but no global state. Caller
 * passes the selected entity + the full entity map for chain walks.
 */
import { useMemo, useRef, useState } from 'react'
import {
  Box, Stack, Typography, Chip, IconButton,
  LinearProgress, Paper, Button,
} from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import {
  actionability, getFootprintPathScore,
  promotionTier, relationshipScore, submitFootprintFeedback,
  type ActionabilityTier, type FeedbackVote, type FootprintEntity,
  type FootprintSignalKind,
} from '@lib/engine'
import { TYPE_META, SIGNAL_GLOW } from './scene'
import {
  reasonCodeLabel, bucketReasonCodes, discoveryChain,
  TIER_BADGE, ACTIONABILITY_BADGE,
} from './shared'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { FileText, ThumbsUp, ThumbsDown, HelpCircle } from 'lucide-react'
import { researchFootprintSubjectSelector, type ResearchFootprintSelector } from '@lib/engine/code/footprintSurface'
import { footprintText } from '@/styles/footprintVisual'

export interface SelectedDetailProps {
  orgId: string
  entity: FootprintEntity
  signal?: FootprintSignalKind
}

export interface SelectedDetailExtraProps {
  allEntities: FootprintEntity[]
  onClose?: () => void
  onOpenResearchFootprint?: (selector: ResearchFootprintSelector) => void
}

export function SelectedDetail({ orgId, entity, signal, allEntities, onClose, onOpenResearchFootprint }: SelectedDetailProps & SelectedDetailExtraProps) {
  const { data, isLoading } = useQuery({
    queryKey: qk.footprint.path(orgId, entity.id),
    queryFn: () => getFootprintPathScore(orgId, entity.id),
    staleTime: 60_000,
  })
  const tier = promotionTier(entity)
  const score = relationshipScore(entity)
  const aClass = actionability(entity)
  const aKey: ActionabilityTier | 'none' = aClass?.tier ?? 'none'
  const aCfg = ACTIONABILITY_BADGE[aKey]

  const byId = useMemo(() => new Map(allEntities.map(e => [e.id, e])), [allEntities])
  const chain = useMemo(() => discoveryChain(entity, byId), [entity, byId])
  const bucketed = useMemo(() => bucketReasonCodes(aClass?.reason_codes ?? []), [aClass])

  const typeLabel = TYPE_META[entity.type]?.label ?? entity.type
  const firstSeen = entity.first_seen_at ? new Date(entity.first_seen_at).toLocaleDateString() : '—'
  const lastSeen = entity.last_seen_at ? new Date(entity.last_seen_at).toLocaleDateString() : '—'

  return (
    <Paper variant="outlined" sx={{ p: 0, overflow: 'hidden' }}>
      {/* Header — entity name + actionability badge + close × */}
      <Box sx={{ p: 1.5, pb: 1.25, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
          <Typography sx={{
            ...footprintText.monoStrong,
            fontSize: 15,
            wordBreak: 'break-all',
            flex: 1, minWidth: 0,
          }}>
            {entity.canonical_name}
          </Typography>
          <Stack direction="row" spacing={0.5} alignItems="center">
            {aKey !== 'none' && (
              <Chip
                size="small"
                label={aCfg.label}
                sx={{
                  ...footprintText.panelButton,
                  ...footprintText.badge,
                  bgcolor: aCfg.bg, color: aCfg.fg,
                  '& .MuiChip-label': { px: 1 },
                }}
              />
            )}
            {onClose && (
              <IconButton size="small" onClick={onClose} aria-label={t('common.close')}>
                <Box sx={{ ...footprintText.indicator, fontSize: 18, color: 'text.secondary' }}>×</Box>
              </IconButton>
            )}
          </Stack>
        </Stack>
      </Box>

      {/* Structured key-value rows */}
      <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Stack spacing={0.75}>
          {[
            { k: t('footprint.field.type'), v: typeLabel },
            { k: t('footprint.field.promotion'), v: tier },
            { k: t('footprint.field.relationship'), v: `${score} / 100` },
            { k: t('footprint.field.depth'), v: String(entity.depth) },
            { k: t('footprint.field.firstSeen'), v: firstSeen },
            { k: t('footprint.field.lastSeen'), v: lastSeen },
            ...(aClass ? [{ k: t('footprint.field.confidenceCap'), v: aClass.confidence_cap === 'none' ? '—' : aClass.confidence_cap }] : []),
          ].map(row => (
            <Stack key={row.k} direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
              <Typography sx={{ ...footprintText.panelSubtitle }}>{row.k}</Typography>
              <Typography sx={{ ...footprintText.panelButton, textAlign: 'right' }}>{row.v}</Typography>
            </Stack>
          ))}
          {signal && (
            <Stack direction="row" justifyContent="space-between" alignItems="baseline">
              <Typography sx={{ ...footprintText.panelSubtitle }}>{t('footprint.signal.label')}</Typography>
              <Chip size="small" label={signal.replace('_', ' ')}
                sx={{ ...footprintText.badge, bgcolor: SIGNAL_GLOW[signal], color: '#fff', height: 20 }} />
            </Stack>
          )}
        </Stack>
      </Box>

      {/* Why related — relationship reason codes as check items */}
      {bucketed.rel.length > 0 && (
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography sx={{ ...footprintText.panelButton, fontWeight: 700, mb: 0.75 }}>
            {t('footprint.panel.whyRelated')}
          </Typography>
          <Stack spacing={0.5}>
            {bucketed.rel.map(c => (
              <Stack key={c} direction="row" spacing={0.75} alignItems="flex-start">
                <Box sx={{ ...footprintText.indicator, color: 'success.main', mt: '2px' }}>✓</Box>
                <Typography sx={{ ...footprintText.panelSubtitle, color: 'text.primary' }}>{reasonCodeLabel(c)}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      {/* Discovery chain — seed → ... → entity, monospace tape */}
      {chain.length > 1 && (
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography sx={{ ...footprintText.panelButton, fontWeight: 700, mb: 0.75 }}>
            {t('footprint.panel.discoveryChain')}
          </Typography>
          <Stack spacing={0.5}>
            {chain.map((node, i) => (
              <Stack key={node.id} direction="row" spacing={0.75} alignItems="center">
                <Typography sx={{
                  ...footprintText.panelSubtitle,
                  width: 14, textAlign: 'center',
                }}>
                  {i === 0 ? '◉' : '↓'}
                </Typography>
                <Typography sx={{
                  ...footprintText.mono,
                  color: node.id === entity.id ? aCfg.ring : 'text.primary',
                  fontWeight: node.id === entity.id ? 600 : 400,
                  wordBreak: 'break-all',
                }}>
                  {node.canonical_name}
                  {i === 0 && <Box component="span" sx={{ ...footprintText.smallMuted, ml: 0.5 }}>{t('footprint.panel.seedHint')}</Box>}
                </Typography>
              </Stack>
            ))}
          </Stack>
          {data && (
            <Typography sx={{ ...footprintText.panelSubtitle, mt: 0.75 }}>
              {t('footprint.panel.pathScore')}: <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{data.score}</Box>
              {data.weakest_link_id && data.weakest_link_id !== entity.id && (
                <Box component="span" sx={{ ml: 1, color: 'warning.main' }}>
                  · {t('footprint.panel.weakestHop')}: {data.weakest_link_id.slice(0, 10)}…
                </Box>
              )}
            </Typography>
          )}
          {isLoading && <LinearProgress sx={{ mt: 0.75 }} />}
        </Box>
      )}

      {/* Validation signals — check items in green */}
      {bucketed.signal.length > 0 && (
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography sx={{ ...footprintText.panelButton, fontWeight: 700, mb: 0.75 }}>
            {t('footprint.panel.validationSignals')}
          </Typography>
          <Stack spacing={0.5}>
            {bucketed.signal.map(c => (
              <Stack key={c} direction="row" spacing={0.75} alignItems="flex-start">
                <Box sx={{ ...footprintText.indicator, color: 'success.main', mt: '2px' }}>✓</Box>
                <Typography sx={{ ...footprintText.panelSubtitle, color: 'text.primary' }}>{reasonCodeLabel(c)}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      {/* Attack-surface codes — if surface present */}
      {bucketed.surface.length > 0 && (
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography sx={{ ...footprintText.panelButton, fontWeight: 700, mb: 0.75 }}>
            {t('footprint.panel.attackSurface')}
          </Typography>
          <Stack spacing={0.5}>
            {bucketed.surface.map(c => (
              <Stack key={c} direction="row" spacing={0.75} alignItems="flex-start">
                <Box sx={{ ...footprintText.indicator, color: aCfg.ring, mt: '2px' }}>•</Box>
                <Typography sx={{ ...footprintText.panelSubtitle, color: 'text.primary' }}>{reasonCodeLabel(c)}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      {/* Negative evidence — contradiction */}
      {bucketed.negative.length > 0 && (
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography sx={{ ...footprintText.panelButton, fontWeight: 700, mb: 0.75, color: 'error.main' }}>
            {t('footprint.panel.contradicting')}
          </Typography>
          <Stack spacing={0.5}>
            {bucketed.negative.map(c => (
              <Stack key={c} direction="row" spacing={0.75} alignItems="flex-start">
                <Box sx={{ ...footprintText.indicator, color: 'error.main', mt: '2px' }}>✗</Box>
                <Typography sx={{ ...footprintText.panelSubtitle }}>{reasonCodeLabel(c)}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      {/* Next steps — required authorizations as numbered list */}
      {aClass && aClass.required_authorization && aClass.required_authorization.length > 0 && (
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography sx={{ ...footprintText.panelButton, fontWeight: 700, mb: 0.75 }}>
            {t('footprint.panel.nextSteps')}
          </Typography>
          <Stack spacing={0.5}>
            {aClass.required_authorization.map((a, i) => (
              <Stack key={a} direction="row" spacing={0.75} alignItems="flex-start">
                <Typography sx={{ ...footprintText.panelSubtitle, minWidth: 16 }}>{i + 1}.</Typography>
                <Typography sx={{ ...footprintText.panelSubtitle, color: 'text.primary' }}>{a.replace(/_/g, ' ')}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      {/* Recon restrictions — what we explicitly DON'T do */}
      {aClass && aClass.recon_restrictions && aClass.recon_restrictions.length > 0 && (
        <Box sx={{ p: 1.5 }}>
          <Typography sx={{ ...footprintText.panelButton, fontWeight: 700, mb: 0.75, color: 'text.secondary' }}>
            {t('footprint.panel.reconRestrictions')}
          </Typography>
          <Stack spacing={0.4}>
            {aClass.recon_restrictions.map(r => (
              <Typography key={r} sx={{ ...footprintText.panelSubtitle }}>
                · {r.replace(/_/g, ' ')}
              </Typography>
            ))}
          </Stack>
          {aClass.rule_pack_version && (
            <Typography sx={{ ...footprintText.mono, mt: 1 }}>
              {aClass.rule_pack_version} · {aClass.profile}
            </Typography>
          )}
        </Box>
      )}

      {/* Operator feedback — 👍/👎/unsure buttons that record
          the operator's opinion on the classifier verdict so a
          downstream worker can later auto-tune rule weights from
          aggregated wisdom. Submission is fire-and-forget; the
          UI flashes briefly to confirm.
          See docs/footprint-operator-manual.md "feedback loop". */}
      <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
        {onOpenResearchFootprint && (
          <Button
            fullWidth
            variant="outlined"
            startIcon={<FileText size={16} />}
            onClick={() => {
              const selector = researchFootprintSubjectSelector(entity.type, entity.canonical_name)
              if (selector) onOpenResearchFootprint(selector)
            }}
            sx={{ mb: 1 }}
          >
            {t('footprint.panel.researchFootprint')}
          </Button>
        )}
        <FeedbackButtons orgId={orgId} entityId={entity.id}
          rulePackVersion={aClass?.rule_pack_version ?? ''} />
      </Box>
    </Paper>
  )
}

export function FeedbackButtons({ orgId, entityId, rulePackVersion }: { orgId: string; entityId: string; rulePackVersion: string }) {
  const [voted, setVoted] = useState<FeedbackVote | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // useRef-based lock — state updates batch in React, so a
  // rapid double-click can BOTH see submitting=false and both
  // fire the POST. Ref mutates synchronously so the second
  // call sees the lock immediately.
  const inFlight = useRef(false)
  const cast = async (vote: FeedbackVote) => {
    if (inFlight.current || voted) return
    inFlight.current = true
    setSubmitting(true)
    setVoted(vote) // optimistic
    try {
      await submitFootprintFeedback(orgId, {
        entity_id: entityId,
        vote,
        rule_pack_version: rulePackVersion,
      })
    } catch (e) {
      // Rollback the optimistic state if the POST failed so the
      // operator can retry.
      console.error('feedback submission failed', e)
      setVoted(null)
      inFlight.current = false
    } finally {
      setSubmitting(false)
    }
  }
  if (voted) {
    return (
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box sx={{ ...footprintText.indicator, color: 'success.main' }}>✓</Box>
        <Typography sx={{ ...footprintText.panelSubtitle }}>
          {t('footprint.feedback.thanks')}
        </Typography>
      </Stack>
    )
  }
  return (
    <Stack spacing={0.75}>
      <Typography sx={{ ...footprintText.panelButton }}>
        {t('footprint.feedback.prompt')}
      </Typography>
      <Stack direction="row" spacing={0.75}>
        <Button
          size="small" variant="outlined"
          disabled={submitting}
          onClick={() => cast('up')}
          startIcon={<ThumbsUp size={14} />}
          sx={{ ...footprintText.panelButton, minWidth: 0, px: 1.25 }}
        >
          {t('footprint.feedback.up')}
        </Button>
        <Button
          size="small" variant="outlined"
          disabled={submitting}
          onClick={() => cast('down')}
          startIcon={<ThumbsDown size={14} />}
          sx={{ ...footprintText.panelButton, minWidth: 0, px: 1.25 }}
        >
          {t('footprint.feedback.down')}
        </Button>
        <Button
          size="small" variant="outlined"
          disabled={submitting}
          onClick={() => cast('unsure')}
          startIcon={<HelpCircle size={14} />}
          sx={{ ...footprintText.panelButton, minWidth: 0, px: 1.25 }}
        >
          {t('footprint.feedback.unsure')}
        </Button>
      </Stack>
    </Stack>
  )
}

export function ScoreGauge({ score, tier }: { score: number; tier: string }) {
  // Guard against NaN / undefined / non-numeric input — would
  // otherwise render an invalid SVG path that visually breaks
  // the donut. Default to 0 when the upstream API returns a
  // garbage score.
  const safeScore = Number.isFinite(score) ? score : 0
  const pct = Math.max(0, Math.min(100, safeScore))
  const accent = (TIER_BADGE[tier] ?? TIER_BADGE.unknown).accent
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 110 }}>
      <Box sx={{
        flex: 1,
        height: 5,
        borderRadius: 3,
        bgcolor: 'action.hover',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <Box sx={{
          position: 'absolute',
          inset: 0,
          width: `${pct}%`,
          bgcolor: accent,
          borderRadius: 3,
          transition: 'width 320ms ease',
        }} />
      </Box>
      <Typography sx={{ ...footprintText.panelButton, fontVariantNumeric: 'tabular-nums', color: 'text.primary', minWidth: 26, textAlign: 'right' }}>
        {pct}
      </Typography>
    </Stack>
  )
}
