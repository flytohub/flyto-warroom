/**
 * RuleTuningModal — admin-facing UI for per-org classifier
 * weight overrides. Operators with admin permission open this
 * from the Footprint header to nudge specific claim weights
 * for their org without forking the rule pack.
 *
 * Backend: footprint_rule_overrides table (migration 021).
 * Engine applies the delta at scoring time via
 * ScoreClaimsWithOverrides. Clamped [-50, +50] at the store
 * layer so a single override can't fully invert a rule.
 *
 * Design choice: we hard-code the claim catalogue here (mirroring
 * scoring.go claimWeights) rather than fetching from a /rules
 * endpoint. The catalogue rarely changes; coupling it to the
 * frontend lets us ship without an extra round-trip + lets the
 * UI add per-claim explanations the backend doesn't carry.
 */
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Stack, Box, Typography, Slider, TextField, Chip, LinearProgress, Tooltip, IconButton,
} from '@mui/material'
import { X, Trash2, RotateCcw, SlidersHorizontal } from 'lucide-react'
import {
  listFootprintRuleOverrides,
  upsertFootprintRuleOverride,
  deleteFootprintRuleOverride,
  type FootprintRuleOverride,
} from '@lib/engine/code/footprintGraph'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'

interface ClaimDef {
  kind: string
  defaultWeight: number
  label: string
  labelKey: string
  category: 'strong' | 'medium' | 'weak' | 'negative'
}

// Mirrors scoring.go claimWeights. Sourced from the rule pack
// documentation; bump in sync when claimWeights changes.
const CLAIM_CATALOG: ClaimDef[] = [
  // Strong (default weight >= 30; gates owned-asset tier)
  { kind: 'seed_links_to_entity',       defaultWeight: 50, label: 'Seed website links to entity',  labelKey: 'footprint.claim.seed_links_to_entity', category: 'strong' },
  { kind: 'entity_links_back_to_seed',  defaultWeight: 50, label: 'Entity links back to seed',     labelKey: 'footprint.claim.entity_links_back_to_seed', category: 'strong' },
  { kind: 'entity_mentions_seed_domain',defaultWeight: 40, label: 'Mentions seed domain',          labelKey: 'footprint.claim.entity_mentions_seed_domain', category: 'strong' },
  { kind: 'ssl_san_includes',           defaultWeight: 40, label: 'SSL SAN includes',              labelKey: 'footprint.claim.ssl_san_includes', category: 'strong' },
  { kind: 'subdomain_of_seed_domain',   defaultWeight: 40, label: 'Subdomain of seed (CT log)',    labelKey: 'footprint.claim.subdomain_of_seed_domain', category: 'strong' },
  { kind: 'email_domain_matches_seed',  defaultWeight: 35, label: 'Email domain matches seed',     labelKey: 'footprint.claim.email_domain_matches_seed', category: 'strong' },
  { kind: 'mx_resolves',                defaultWeight: 35, label: 'MX record resolves',            labelKey: 'footprint.claim.mx_resolves', category: 'strong' },
  { kind: 'canonical_metadata',         defaultWeight: 30, label: 'Authoritative metadata',        labelKey: 'footprint.claim.canonical_metadata', category: 'strong' },
  { kind: 'desc_brand_plus_domain',     defaultWeight: 30, label: 'Description: brand + domain',   labelKey: 'footprint.claim.desc_brand_plus_domain', category: 'strong' },
  { kind: 'alias_co_mention',           defaultWeight: 30, label: 'Alias co-mention (alias graph)', labelKey: 'footprint.claim.alias_co_mention', category: 'strong' },
  // Medium
  { kind: 'name_high_similarity',       defaultWeight: 20, label: 'Name closely resembles brand',  labelKey: 'footprint.claim.name_high_similarity', category: 'medium' },
  { kind: 'same_org_name',              defaultWeight: 15, label: 'Same org name (owned alias)',   labelKey: 'footprint.claim.same_org_name', category: 'medium' },
  { kind: 'product_name_mention',       defaultWeight: 15, label: 'Product name mention',          labelKey: 'footprint.claim.product_name_mention', category: 'medium' },
  { kind: 'news_co_mention',            defaultWeight: 15, label: 'News co-mention',               labelKey: 'footprint.claim.news_co_mention', category: 'medium' },
  // Weak
  { kind: 'keyword_match',              defaultWeight:  5, label: 'Keyword overlap',               labelKey: 'footprint.claim.keyword_match', category: 'weak' },
  { kind: 'fuzzy_brand_similarity',     defaultWeight:  5, label: 'Fuzzy brand similarity',        labelKey: 'footprint.claim.fuzzy_brand_similarity', category: 'weak' },
  { kind: 'search_snippet',             defaultWeight:  5, label: 'Search snippet',                labelKey: 'footprint.claim.search_snippet', category: 'weak' },
  // Negative
  { kind: 'different_industry',         defaultWeight: -40, label: 'Different industry (penalty)', labelKey: 'footprint.claim.different_industry', category: 'negative' },
  { kind: 'different_country',          defaultWeight: -30, label: 'Different country',            labelKey: 'footprint.claim.different_country', category: 'negative' },
  { kind: 'whois_ownership_conflict',   defaultWeight: -30, label: 'WHOIS ownership conflict',     labelKey: 'footprint.claim.whois_ownership_conflict', category: 'negative' },
  { kind: 'name_collision_common_word', defaultWeight: -20, label: 'Common-word brand collision',  labelKey: 'footprint.claim.name_collision_common_word', category: 'negative' },
]

interface RuleTuningModalProps {
  open: boolean
  onClose: () => void
  orgId: string
}

export function RuleTuningModal({ open, onClose, orgId }: RuleTuningModalProps) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: qk.footprint.ruleOverrides(orgId),
    queryFn: () => listFootprintRuleOverrides(orgId),
    enabled: open,
  })
  const overrides: Record<string, FootprintRuleOverride> = {}
  for (const o of data?.overrides ?? []) {
    overrides[o.claim_kind] = o
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: qk.footprint.ruleOverrides(orgId) })
  const upsert = useMutation({
    mutationFn: (vars: { claim_kind: string; weight_delta: number; reason: string }) =>
      upsertFootprintRuleOverride(orgId, vars),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (claimKind: string) => deleteFootprintRuleOverride(orgId, claimKind),
    onSuccess: invalidate,
  })

  // Group catalog by category for visual hierarchy.
  const grouped = {
    strong:   CLAIM_CATALOG.filter(c => c.category === 'strong'),
    medium:   CLAIM_CATALOG.filter(c => c.category === 'medium'),
    weak:     CLAIM_CATALOG.filter(c => c.category === 'weak'),
    negative: CLAIM_CATALOG.filter(c => c.category === 'negative'),
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}>
      <DialogTitle sx={{ px: 3, pt: 2.5, pb: 1.5 }}>
        <Stack direction="row" alignItems="flex-start" spacing={1.5}>
          <Box sx={{
            width: 40, height: 40, borderRadius: 1.5,
            bgcolor: 'primary.main', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <SlidersHorizontal size={20} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>
              {t('footprint.tuning.title')}
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5, lineHeight: 1.5 }}>
              {t('footprint.tuning.subtitle')}
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={onClose}
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <X size={18} />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers sx={{ px: 3, py: 2 }}>
        {isLoading && <LinearProgress />}
        <Stack spacing={2.5}>
          {(['strong', 'medium', 'weak', 'negative'] as const).map(cat => (
            <Box key={cat}>
              <Typography sx={{
                fontSize: 12, fontWeight: 700,
                color: 'text.secondary', textTransform: 'uppercase',
                letterSpacing: '0.08em', mb: 1,
              }}>
                {tOr(`footprint.tuning.category.${cat}`, cat)}
              </Typography>
              <Stack spacing={1.25}>
                {grouped[cat].map(claim => (
                  <ClaimRow
                    key={claim.kind}
                    claim={claim}
                    override={overrides[claim.kind]}
                    onSave={(delta, reason) => upsert.mutate({ claim_kind: claim.kind, weight_delta: delta, reason })}
                    onReset={() => remove.mutate(claim.kind)}
                    busy={upsert.isPending || remove.isPending}
                  />
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  )
}

interface ClaimRowProps {
  claim: ClaimDef
  override?: FootprintRuleOverride
  onSave: (delta: number, reason: string) => void
  onReset: () => void
  busy: boolean
}

function ClaimRow({ claim, override, onSave, onReset, busy }: ClaimRowProps) {
  const [delta, setDelta] = useState(override?.weight_delta ?? 0)
  const [reason, setReason] = useState(override?.reason ?? '')
  const [editing, setEditing] = useState(false)

  // useState only initialises once — sync when the server override
  // changes (e.g. after a reset/delete the prop becomes undefined and
  // the slider must return to 0, not stay at the stale typed value).
  // Skip sync while the user is actively editing so in-progress input
  // is not overwritten by a background refetch.
  useEffect(() => {
    if (!editing) {
      setDelta(override?.weight_delta ?? 0)
      setReason(override?.reason ?? '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [override?.weight_delta, override?.reason])

  const isNegative = claim.defaultWeight < 0
  const effective = claim.defaultWeight + delta
  const dirty = delta !== (override?.weight_delta ?? 0) || reason !== (override?.reason ?? '')

  return (
    <Box sx={{
      p: 1.5, borderRadius: 1.5,
      bgcolor: 'action.hover',
      border: 1, borderColor: override ? 'primary.main' : 'divider',
    }}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{tOr(claim.labelKey, claim.label)}</Typography>
            <Chip size="small" label={claim.kind}
              sx={{ fontSize: 12, height: 18, fontFamily: 'ui-monospace, Menlo, monospace' }} />
          </Stack>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
            {t('footprint.tuning.defaultWeight')}: <b>{claim.defaultWeight}</b>
            {delta !== 0 && (
              <>
                {' · '}{t('footprint.tuning.effective')}: <b style={{ color: isNegative ? '#dc2626' : '#7c3aed' }}>{effective}</b>
              </>
            )}
          </Typography>
        </Box>
        <Box sx={{ width: 60, textAlign: 'right' }}>
          <Typography sx={{
            fontSize: 16, fontWeight: 700,
            color: delta > 0 ? 'success.main' : delta < 0 ? 'error.main' : 'text.secondary',
          }}>
            {delta > 0 ? '+' : ''}{delta}
          </Typography>
        </Box>
        {!editing && (
          <Button size="small" onClick={() => setEditing(true)} sx={{ fontSize: 13 }}>
            {override ? t('footprint.tuning.adjust') : t('footprint.tuning.override')}
          </Button>
        )}
        {override && (
          <Tooltip title={t('footprint.tuning.reset')}>
            <IconButton
              size="small"
              onClick={onReset}
              disabled={busy}
              aria-label={t('footprint.tuning.reset')}
              title={t('footprint.tuning.reset')}
            >
              <Trash2 size={14} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      {editing && (
        <Stack spacing={1.25} sx={{ mt: 1.5 }}>
          <Box sx={{ px: 2.5, pb: 3 }}>
            <Slider
              value={delta}
              onChange={(_, v) => {
                // Slider can theoretically fire with undefined / an
                // array (range mode). Both would corrupt state into
                // NaN. Coerce defensively + fall back to current
                // override value.
                const raw = typeof v === 'number' ? v : (Array.isArray(v) && typeof v[0] === 'number' ? v[0] : null)
                if (raw === null || !Number.isFinite(raw)) {
                  return // ignore noisy event
                }
                setDelta(Math.max(-50, Math.min(50, raw)))
              }}
              min={-50} max={50} step={1}
              marks={[{ value: -50, label: '-50' }, { value: 0, label: '0' }, { value: 50, label: '+50' }]}
            />
          </Box>
          <TextField
            label={t('footprint.tuning.reason')}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={t('footprint.tuning.reason.example')}
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button size="small" onClick={() => {
              setDelta(override?.weight_delta ?? 0)
              setReason(override?.reason ?? '')
              setEditing(false)
            }}>
              <RotateCcw size={14} style={{ marginRight: 6 }} />
              {t('common.cancel')}
            </Button>
            <Button
              size="small" variant="contained"
              disabled={!dirty || busy}
              onClick={() => {
                onSave(delta, reason)
                setEditing(false)
              }}
            >
              {t('footprint.tuning.save')}
            </Button>
          </Stack>
        </Stack>
      )}
    </Box>
  )
}
