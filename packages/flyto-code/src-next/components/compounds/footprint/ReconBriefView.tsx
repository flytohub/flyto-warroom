/**
 * ReconBriefView — vertical-scroll "Recon Brief" layout. The new
 * default Footprint view: 8 sections operators read top-to-bottom.
 *
 * Extracted from FootprintGraphView.tsx 2026-05-23.
 *   1. Target Profile + Narrative
 *   2. External Attack Surface
 *   3. Technology Fingerprint
 *   4. Credential Exposure signals
 *   5. Initial Access Paths
 *   6. Recommended Red Team Scenarios
 *   7. Discovery Map
 *   8. Export Evidence Pack CTA
 */
import { useMemo } from 'react'
import { Box, Stack, Typography, Chip, Paper, Button, LinearProgress, IconButton, Tooltip } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, Cpu, FileText, Mail, RefreshCw } from 'lucide-react'
import {
  actionability, getFootprintActionable, getFootprintNarrative,
  openFootprintEvidencePack,
  type ActionabilityTier, type ActionableFinding, type FootprintEntity,
} from '@lib/engine'
import { TYPE_META } from './scene'
import { ACTIONABILITY_VISUAL } from './shared'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { MarkdownNarrative } from './FootprintGraphView'
import { footprintText } from '@/styles/footprintVisual'

// MarkdownNarrative + NarrativePanel + TopAttackPathsPanel still
// live in FootprintGraphView.tsx (Phase 5 pulled only ReconBrief).
// Re-import them as named exports added to the orchestrator file
// so the Brief view can compose without circular deps.

export interface ReconBriefViewProps {
  orgId: string
  entities: FootprintEntity[]
  latestRunEntitiesCreated: number
  selectedId: string | null
  onSelect: (id: string) => void
}

export function ReconBriefView({ orgId, entities, latestRunEntitiesCreated, selectedId: _selectedId, onSelect }: ReconBriefViewProps) {
  // ─ Section data derivations (cheap, in-memory)
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of entities) {
      if (e.status === 'suppressed') continue
      c[e.type] = (c[e.type] ?? 0) + 1
    }
    return c
  }, [entities])

  const seedEntity = entities.find(e => e.type === 'organization') ?? entities.find(e => e.type === 'domain')
  const subdomains = useMemo(() => entities.filter(e => e.type === 'subdomain'), [entities])
  const techs = useMemo(() => entities.filter(e => e.type === 'technology' || e.type === 'vendor'), [entities])
  const emails = useMemo(() => entities.filter(e => e.type === 'email_domain'), [entities])
  const docs = useMemo(() => entities.filter(e => e.type === 'document'), [entities])
  const handles = useMemo(() => entities.filter(e => e.type === 'handle' || e.type === 'social_handle'), [entities])

  // Bucket reason-codes across all actionable findings into scenarios.
  const scenarios = useMemo(() => {
    const buckets: Record<string, { label: string; count: number; entities: string[] }> = {
      credential: { label: t('footprint.scenario.credential'), count: 0, entities: [] },
      code_exposure: { label: t('footprint.scenario.codeExposure'), count: 0, entities: [] },
      subdomain_takeover: { label: t('footprint.scenario.subdomainTakeover'), count: 0, entities: [] },
      email_phishing: { label: t('footprint.scenario.emailPhishing'), count: 0, entities: [] },
      lookalike: { label: t('footprint.scenario.lookalike'), count: 0, entities: [] },
    }
    for (const e of entities) {
      const cls = actionability(e)
      if (!cls || cls.tier === 'rejected') continue
      for (const code of cls.reason_codes) {
        if (code.includes('breach') || code.includes('credential') || code.includes('email_format')) {
          buckets.credential.count++
          buckets.credential.entities.push(e.canonical_name)
          break
        }
        if (code.includes('secret') || code.includes('repo') || code.includes('internal_url')) {
          buckets.code_exposure.count++
          buckets.code_exposure.entities.push(e.canonical_name)
          break
        }
        if (code.includes('dev_or_staging') || code.includes('stale_frontend') || code.includes('vendor_recent')) {
          buckets.subdomain_takeover.count++
          buckets.subdomain_takeover.entities.push(e.canonical_name)
          break
        }
        if (code.includes('dmarc') || code.includes('spf')) {
          buckets.email_phishing.count++
          buckets.email_phishing.entities.push(e.canonical_name)
          break
        }
        if (code.includes('lookalike')) {
          buckets.lookalike.count++
          buckets.lookalike.entities.push(e.canonical_name)
          break
        }
      }
    }
    return Object.entries(buckets).filter(([, v]) => v.count > 0)
  }, [entities])

  // Section header helper — consistent visual rhythm.
  const SectionHeader = ({ n, title, count }: { n: number; title: string; count?: number }) => (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5, mt: 0.5 }}>
      <Box sx={{
        width: 26, height: 26, borderRadius: 0.75,
        bgcolor: 'primary.main', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        ...footprintText.indicator,
      }}>{n}</Box>
      <Typography sx={{ ...footprintText.panelTitle, fontSize: 18, flex: 1 }}>{title}</Typography>
      {count !== undefined && (
        <Chip size="small" label={count} sx={{ ...footprintText.badge, height: 22 }} />
      )}
    </Stack>
  )

  return (
    <Box sx={{ overflowY: 'auto', height: '100%', px: 3, py: 2 }}>
      <Stack spacing={3} sx={{ maxWidth: 880, mx: 'auto' }}>
        {/* SECTION 1 — Target Profile + Narrative */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <SectionHeader n={1} title={t('footprint.brief.s1.title')} />
          {seedEntity && (
            <Box sx={{ mb: 1.5 }}>
              <Typography sx={{ ...footprintText.monoStrong, fontSize: 22 }}>
                {seedEntity.canonical_name}
              </Typography>
              <Stack direction="row" spacing={1.5} sx={{ mt: 0.75 }}>
                <Typography sx={{ ...footprintText.panelSubtitle }}>
                  {entities.length} {t('footprint.brief.entities')}
                </Typography>
                <Typography sx={{ ...footprintText.panelSubtitle }}>·</Typography>
                <Typography sx={{ ...footprintText.panelSubtitle }}>
                  {Object.keys(counts).length} {t('footprint.brief.types')}
                </Typography>
              </Stack>
            </Box>
          )}
          {/* Narrative inline, full-width */}
          <BriefNarrativeInline orgId={orgId} refreshKey={latestRunEntitiesCreated} />
        </Paper>

        {/* SECTION 2 — External Attack Surface */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <SectionHeader n={2} title={t('footprint.brief.s2.title')} count={subdomains.length} />
          <Typography sx={{ ...footprintText.panelSubtitle, mb: 1.5 }}>
            {t('footprint.brief.s2.sub')}
          </Typography>
          {subdomains.length === 0 ? (
            <Typography sx={{ ...footprintText.panelSubtitle }}>
              {t('footprint.brief.s2.empty')}
            </Typography>
          ) : (
            <Stack spacing={0.5}>
              {subdomains.slice(0, 10).map(s => {
                const cls = actionability(s)
                const tier: ActionabilityTier | 'none' = cls?.tier ?? 'none'
                return (
                  <Stack
                    key={s.id}
                    direction="row" alignItems="center" spacing={1}
                    onClick={() => onSelect(s.id)}
                    sx={{
                      p: 0.75, borderRadius: 0.75, cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Box sx={{
                      width: 8, height: 8, borderRadius: '50%',
                      bgcolor: ACTIONABILITY_VISUAL[tier].ring, flexShrink: 0,
                    }} />
                    <Typography sx={{
                      ...footprintText.mono,
                      fontSize: 14,
                      flex: 1, minWidth: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {s.canonical_name}
                    </Typography>
                    <Typography sx={{ ...footprintText.smallMuted }}>
                      {t('footprint.brief.depth', { depth: s.depth })}
                    </Typography>
                  </Stack>
                )
              })}
              {subdomains.length > 10 && (
                <Typography sx={{ ...footprintText.panelSubtitle, mt: 0.5 }}>
                  {t('footprint.brief.more', { count: subdomains.length - 10 })}
                </Typography>
              )}
            </Stack>
          )}
        </Paper>

        {/* SECTION 3 — Technology Fingerprint */}
        {techs.length > 0 && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <SectionHeader n={3} title={t('footprint.brief.s3.title')} count={techs.length} />
            <Typography sx={{ ...footprintText.panelSubtitle, mb: 1.5 }}>
              {t('footprint.brief.s3.sub')}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {techs.map(t => (
                <Chip key={t.id} size="medium"
                  icon={t.type === 'vendor' ? <Briefcase size={14} /> : <Cpu size={14} />}
                  label={t.canonical_name}
                  sx={{
                    ...footprintText.mono,
                    bgcolor: t.type === 'vendor' ? '#fef3c7' : '#fffbeb',
                    color: '#92400e',
                    border: `1px solid #fbbf24`,
                  }}
                />
              ))}
            </Stack>
          </Paper>
        )}

        {/* SECTION 4 — Credential Exposure */}
        {(emails.length > 0 || docs.length > 0) && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <SectionHeader n={4} title={t('footprint.brief.s4.title')} count={emails.length + docs.length} />
            <Typography sx={{ ...footprintText.panelSubtitle, mb: 1.5 }}>
              {t('footprint.brief.s4.sub')}
            </Typography>
            <Stack spacing={1}>
              {emails.slice(0, 5).map(e => (
                <Stack key={e.id} direction="row" alignItems="center" spacing={1}>
                  <Mail size={14} color="#7c3aed" />
                  <Typography sx={{ ...footprintText.mono, fontSize: 14 }}>
                    {e.canonical_name}
                  </Typography>
                </Stack>
              ))}
              {docs.slice(0, 3).map(d => (
                <Stack key={d.id} direction="row" alignItems="center" spacing={1}>
                  <FileText size={14} color="#94a3b8" />
                  <Typography sx={{ ...footprintText.panelSubtitle, flex: 1, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.canonical_name}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Paper>
        )}

        {/* SECTION 5 — Initial Access Paths (Top Attack Paths) */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <SectionHeader n={5} title={t('footprint.brief.s5.title')} />
          <Typography sx={{ ...footprintText.panelSubtitle, mb: 1.5 }}>
            {t('footprint.brief.s5.sub')}
          </Typography>
          <BriefAttackPathsInline orgId={orgId} refreshKey={latestRunEntitiesCreated} onSelect={onSelect} />
        </Paper>

        {/* SECTION 6 — Recommended Red Team Scenarios */}
        {scenarios.length > 0 && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <SectionHeader n={6} title={t('footprint.brief.s6.title')} />
            <Typography sx={{ ...footprintText.panelSubtitle, mb: 1.5 }}>
              {t('footprint.brief.s6.sub')}
            </Typography>
            <Stack spacing={1.5}>
              {scenarios.map(([key, val]) => (
                <Box key={key} sx={{ p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                    <Typography sx={{ ...footprintText.panelButton, fontSize: 14 }}>{val.label}</Typography>
                    <Chip size="small" label={val.count} sx={{ ...footprintText.badge, height: 20 }} />
                  </Stack>
                  <Typography sx={{
                    ...footprintText.mono,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {val.entities.slice(0, 3).join(' · ')}
                    {val.entities.length > 3 && ' …'}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Paper>
        )}

        {/* SECTION 7 — Discovery Map (compact summary) */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <SectionHeader n={7} title={t('footprint.brief.s7.title')} />
          <Typography sx={{ ...footprintText.panelSubtitle, mb: 1.5 }}>
            {t('footprint.brief.s7.sub')}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <Chip
                key={type}
                size="small"
                label={`${TYPE_META[type as FootprintEntity['type']]?.label ?? type} · ${count}`}
                sx={{ ...footprintText.badge }}
              />
            ))}
          </Stack>
          {handles.length > 0 && (
            <Typography sx={{ ...footprintText.panelSubtitle, mt: 1.5 }}>
              {t('footprint.brief.s7.handles')} {handles.map(h => h.canonical_name).join(' · ')}
            </Typography>
          )}
        </Paper>

        {/* SECTION 8 — Evidence Pack */}
        <Paper variant="outlined" sx={{ p: 2, borderColor: 'primary.main', borderWidth: 1.5 }}>
          <SectionHeader n={8} title={t('footprint.brief.s8.title')} />
          <Typography sx={{ ...footprintText.panelSubtitle, mb: 1.5 }}>
            {t('footprint.brief.s8.sub')}
          </Typography>
          <Button
            variant="contained"
            size="large"
            startIcon={<FileText size={18} />}
            onClick={async () => {
              try { await openFootprintEvidencePack(orgId, 'red_team_actionable', 20) }
              catch (e) { console.error(e) }
            }}
          >
            {t('footprint.brief.s8.cta')}
          </Button>
        </Paper>
      </Stack>
    </Box>
  )
}

// Inline narrative renderer for ReconBriefView SECTION 1.
function BriefNarrativeInline({ orgId, refreshKey }: { orgId: string; refreshKey: number }) {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: qk.footprint.narrative(orgId, refreshKey),
    queryFn: () => getFootprintNarrative(orgId),
    staleTime: 30 * 60_000,
  })
  if (isLoading) return <LinearProgress />
  return (
    <Box sx={{
      p: 1.5, borderRadius: 1,
      bgcolor: 'action.hover',
      borderLeft: '3px solid', borderColor: 'primary.main',
    }}>
      {data?.narrative ? (
        <MarkdownNarrative text={data.narrative} />
      ) : (
        <Typography sx={{ ...footprintText.panelSubtitle }}>
          {t('footprint.brief.s1.empty')}
        </Typography>
      )}
      <Box sx={{ mt: 1, textAlign: 'right' }}>
        <Tooltip title={t('footprint.brief.s1.regenerate')}>
	          <IconButton
	            size="small"
	            onClick={() => refetch()}
	            disabled={isFetching}
	            aria-label={t('footprint.brief.s1.regenerate')}
	          >
	            <RefreshCw size={12} />
	          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  )
}

// Inline Top Attack Paths renderer for SECTION 5 — same data as
// sidebar TopAttackPathsPanel but rendered larger in the Brief.
function BriefAttackPathsInline({ orgId, refreshKey, onSelect }: { orgId: string; refreshKey: number; onSelect: (id: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: qk.footprint.actionable(orgId, 'red_team_actionable', refreshKey),
    queryFn: () => getFootprintActionable(orgId, 'red_team_actionable', 5),
    staleTime: 30_000,
  })
  const findings: ActionableFinding[] = data?.findings ?? []
  if (isLoading) return <LinearProgress />
  if (findings.length === 0) {
    return (
      <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
        <Typography sx={{ ...footprintText.panelSubtitle, mb: 0.75 }}>
          {t('footprint.brief.s5.empty')}
        </Typography>
        <Typography sx={{ ...footprintText.smallMuted }}>
          → {t('footprint.brief.s5.hint')}
        </Typography>
      </Box>
    )
  }
  return (
    <Stack spacing={1}>
      {findings.map((f, i) => (
        <Paper
          key={f.entity_id}
          variant="outlined"
          onClick={() => onSelect(f.entity_id)}
          sx={{
            p: 1.5, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 1.5,
            borderLeft: '3px solid #dc2626',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <Box sx={{
            ...footprintText.metricValue,
            color: '#dc2626',
            minWidth: 30, textAlign: 'center',
          }}>{i + 1}</Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{
              ...footprintText.monoStrong,
              fontSize: 15,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{f.canonical_name}</Typography>
            <Typography sx={{ ...footprintText.panelSubtitle, mt: 0.25 }}>
              {f.reason_codes.slice(0, 2).join(' · ')}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography sx={{ ...footprintText.metricValueSmall, fontVariantNumeric: 'tabular-nums' }}>{f.relationship_score}</Typography>
            <Typography sx={{ ...footprintText.smallMuted }}>{t('footprint.brief.relationshipShort')}</Typography>
          </Box>
        </Paper>
      ))}
    </Stack>
  )
}
