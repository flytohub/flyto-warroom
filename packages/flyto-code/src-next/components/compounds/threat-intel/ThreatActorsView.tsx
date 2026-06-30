/**
 * ThreatActorsView — Cyble-parity card grid backed by MITRE ATT&CK
 * Groups (~135 entries). Free-text search + country/region filter.
 * Each card: name + aliases + country/region + technique count +
 * malware count + Last Seen.
 */
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Box, Typography, Paper, Chip, Skeleton, TextField, InputAdornment,
  IconButton, Select, MenuItem,
} from '@mui/material'
import { Search, X, Globe, Target, Bug, ChevronLeft, ChevronRight, ExternalLink, Skull } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { listThreatActors, parseJsonArray, type ThreatActorFilter } from '@lib/engine'
import { colors, softBg } from '@/styles/designTokens'
import { JellyCard } from '@atoms/JellyCard'
import { QueryError } from '@atoms/QueryError'
import { ThreatIntelRefreshButton } from './ThreatIntelRefreshButton'
import { ThreatIntelFeedStatus } from './ThreatIntelFeedStatus'
import { ThreatIntelEmptyState } from './ThreatIntelEmptyState'

const PAGE_SIZE = 60

// Threat actors are all hostile — a single danger-red signature reads
// "adversary dossier" at a glance. Stat tones stay distinct per metric.
const ACTOR_TONE = colors.semantic.danger

/** Small stat tile inside the threat-actor card — a toned mini-metric
 *  (soft-bg pill, monospace count, label) so each number reads as a
 *  data point, not a labelless icon. */
function StatTile({ icon, value, label, tone }: {
  icon: React.ReactNode
  value: number
  label: string
  tone: string
}) {
  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column', gap: 0.4,
      px: 1, py: 0.85, borderRadius: 1.5,
      bgcolor: softBg(tone, 0.07), border: '1px solid', borderColor: softBg(tone, 0.18),
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: tone }}>
        {icon}
        <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 16, fontWeight: 800, lineHeight: 1 }}>
          {value}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </Typography>
    </Box>
  )
}

function dateLabel(iso?: string | null): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function ThreatActorsView() {
  const { org } = useOrg()
  const orgId = org?.id
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [country, setCountry] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    const id = setTimeout(() => setSearchTerm(searchInput.trim()), 300)
    return () => clearTimeout(id)
  }, [searchInput])
  useEffect(() => { setPage(0) }, [searchTerm, country])

  const filter: ThreatActorFilter = {
    q: searchTerm || undefined,
    country: country || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.threatIntel.threatActors(orgId, searchTerm, country, page),
    queryFn: () => listThreatActors(orgId!, filter),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })

  const actors = data?.actors ?? []
  const total = data?.total ?? 0

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{
        flexShrink: 0, px: { xs: 2, md: 4 }, pt: { xs: 2, md: 3 }, pb: 2,
        borderBottom: '1px solid', borderColor: 'divider',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography component="h1" className="text-3xl leading-none font-semibold tracking-tight">
              {t('threatIntel.actorLibrary')}
            </Typography>
            <Typography className="ml-0.5 mt-1 text-base font-medium" color="text.secondary">
              {t('threatIntel.actorLibraryLede')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, flexShrink: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ pt: 0.5 }}>
              {t('threatIntel.totalCount')}: <strong>{total.toLocaleString()}</strong>
            </Typography>
            <ThreatIntelRefreshButton source="mitre" />
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 2.5 }}>
          <TextField
            size="small"
            placeholder={t('threatIntel.actorSearch')}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            sx={{ flex: 1, maxWidth: 420 }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment>,
              endAdornment: searchInput ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setSearchInput('')}
                    aria-label={t('common.clear')}
                    title={t('common.clear')}
                  >
                    <X size={14} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
          <Select
            size="small"
            value={country}
            onChange={e => setCountry(e.target.value)}
            displayEmpty
            sx={{ minWidth: 160, fontSize: 13 }}
          >
            <MenuItem value="">{t('threatIntel.allCountries')}</MenuItem>
            {['China', 'Russia', 'Iran', 'North Korea', 'United States'].map(c => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </Select>
        </Box>
        <ThreatIntelFeedStatus sources={['mitre_attack']} sx={{ mt: 1.25 }} />
      </Box>

      {/* Card grid */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 2, md: 4 }, py: 2 }}>
        {isError && <QueryError error={error} onRetry={refetch} label={t('threatIntel.actorLoadError')} compact />}
        {isLoading && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 2 }}>
            {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} variant="rectangular" height={180} />)}
          </Box>
        )}
        {!isLoading && !isError && actors.length === 0 && (
          <ThreatIntelEmptyState
            icon={<Skull size={28} />}
            tone={ACTOR_TONE}
            title={t('threatIntel.actorEmptyTitle')}
            description={t('threatIntel.actorEmpty')}
            refreshSource="mitre"
          />
        )}
        {!isLoading && !isError && actors.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 2 }}>
            {actors.map((a, i) => {
              const aliases = parseJsonArray(a.aliases)
              const techCount = parseJsonArray(a.techniques).length
              const malwareCount = parseJsonArray(a.malware_used).length
              const targetCountries = parseJsonArray(a.target_countries).length
              return (
                <JellyCard key={a.id} delay={Math.min(i * 0.015, 0.3)} noHover>
                <Paper elevation={0} sx={{
                  position: 'relative', overflow: 'hidden', borderRadius: 2.5,
                  border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper',
                  backgroundImage: `linear-gradient(140deg, ${softBg(ACTOR_TONE, 0.05)} 0%, transparent 55%)`,
                  p: 2, minHeight: 208,
                  display: 'flex', flexDirection: 'column', minWidth: 0,
                  transition: 'border-color 160ms, box-shadow 160ms, transform 160ms',
                  '&:hover': {
                    borderColor: softBg(ACTOR_TONE, 0.5),
                    boxShadow: `0 10px 30px ${softBg(ACTOR_TONE, 0.15)}`,
                    transform: 'translateY(-2px)',
                  },
                }}>
                  {/* Top glow rail — the dossier's "hostile" signature. */}
                  <Box sx={{
                    position: 'absolute', left: 0, top: 0, right: 0, height: 3,
                    background: `linear-gradient(90deg, ${ACTOR_TONE}, transparent 70%)`,
                  }} />

                  {/* Header: skull glyph + name + external ID / origin. */}
                  <Box sx={{ display: 'flex', gap: 1.25, mb: 1.25, minWidth: 0 }}>
                    <Box sx={{
                      width: 38, height: 38, borderRadius: 1.5, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      bgcolor: softBg(ACTOR_TONE, 0.14), color: ACTOR_TONE,
                      boxShadow: `inset 0 0 0 1px ${softBg(ACTOR_TONE, 0.3)}`,
                    }}>
                      <Skull size={20} />
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography
                        title={a.name}
                        sx={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}
                      >
                        {a.name}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mt: 0.25 }}>
                        {a.external_id && (
                          <Chip
                            size="small"
                            label={a.external_id}
                            title={a.external_id}
                            sx={{
                              fontSize: 12, height: 18, fontFamily: 'ui-monospace, monospace',
                              maxWidth: 150, color: ACTOR_TONE,
                              bgcolor: softBg(ACTOR_TONE, 0.1), border: `1px solid ${softBg(ACTOR_TONE, 0.28)}`,
                              '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', px: 0.75 },
                            }}
                          />
                        )}
                        {(a.country || a.region) && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                            <Globe size={12} style={{ opacity: 0.6 }} />
                            <Typography sx={{ fontSize: 12 }}>
                              {[a.country, a.region].filter(Boolean).join(' · ')}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Box>
                  </Box>
                  {aliases.length > 0 && (
                    <Typography
                      title={`aka ${aliases.join(', ')}`}
                      sx={{
                        fontSize: 12, color: 'text.secondary', fontStyle: 'italic',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', mb: 1.5,
                      }}
                    >
                      aka {aliases.slice(0, 3).join(', ')}{aliases.length > 3 ? ` (+${aliases.length - 3})` : ''}
                    </Typography>
                  )}
                  {/* Stat row — toned mini-metric tiles. */}
                  <Box sx={{
                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 1, mb: 'auto',
                  }}>
                    <StatTile
                      icon={<Globe size={13} />}
                      value={targetCountries}
                      label={t('threatIntel.statTargets')}
                      tone={colors.tech}
                    />
                    <StatTile
                      icon={<Target size={13} />}
                      value={techCount}
                      label={t('threatIntel.statTechniques')}
                      tone={colors.brand}
                    />
                    <StatTile
                      icon={<Bug size={13} />}
                      value={malwareCount}
                      label={t('threatIntel.statMalware')}
                      tone={colors.semantic.warning}
                    />
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1, mt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Box sx={{
                        width: 6, height: 6, borderRadius: '50%', bgcolor: colors.semantic.success,
                        boxShadow: `0 0 6px ${colors.semantic.success}`,
                      }} />
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
                        {t('threatIntel.col.lastSeen')}: {dateLabel(a.last_seen_at)}
                      </Typography>
                    </Box>
                    {a.source_url && (
                      <IconButton
                        size="small"
                        component="a"
                        href={a.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('threatIntel.openSource')}
                        title={t('threatIntel.openSource')}
                        sx={{ p: 0.25 }}
                      >
                        <ExternalLink size={12} />
                      </IconButton>
                    )}
                  </Box>
                </Paper>
                </JellyCard>
              )
            })}
          </Box>
        )}

      </Box>
      {/* Pagination — sticky bottom outside the scroll container so
          operators don't have to scroll to the last card to switch
          pages (operator 2026-05-23: "分頁選項不是固定在最下面嗎"). */}
      {!isLoading && !isError && actors.length > 0 && (
        <Box sx={{
          flexShrink: 0,
          borderTop: '1px solid', borderColor: 'divider',
          px: { xs: 2, md: 4 }, py: 1.25,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1.5,
          bgcolor: 'background.paper',
        }}>
          <Typography variant="caption" color="text.secondary">
            {t('threatIntel.page')} {page + 1}{' · '}{actors.length} {t('threatIntel.shown')}
          </Typography>
          <IconButton
            size="small"
            disabled={page === 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
            aria-label={t('common.previousPage')}
            title={t('common.previousPage')}
          >
            <ChevronLeft size={16} />
          </IconButton>
          <IconButton
            size="small"
            disabled={actors.length < PAGE_SIZE}
            onClick={() => setPage(p => p + 1)}
            aria-label={t('common.nextPage')}
            title={t('common.nextPage')}
          >
            <ChevronRight size={16} />
          </IconButton>
        </Box>
      )}
    </Box>
  )
}
