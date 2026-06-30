/**
 * RansomwareView — ransomware.live mirror, victim posts from ~80
 * tracked leak sites. Table view: Victim / Group / Country / Sector
 * / Published. Free-text search + group/country filter.
 */
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Box, Typography, Paper, Chip, Skeleton, TextField, InputAdornment,
  IconButton, Select, MenuItem,
} from '@mui/material'
import { Search, X, ChevronLeft, ChevronRight, ExternalLink, Skull } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { listRansomware, type RansomwareFilter } from '@lib/engine'
import { colors, softBg } from '@/styles/designTokens'
import { QueryError } from '@atoms/QueryError'
import { ThreatIntelRefreshButton } from './ThreatIntelRefreshButton'
import { ThreatIntelFeedStatus } from './ThreatIntelFeedStatus'
import { ThreatIntelEmptyState } from './ThreatIntelEmptyState'

const PAGE_SIZE = 100

// Ransomware = pure danger. The whole monitor carries a crimson
// signature so it reads as the alarm surface it is.
const RANSOM_TONE = colors.semantic.danger

function dateLabel(iso?: string | null): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  return Number.isNaN(t) ? iso : new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function RansomwareView() {
  const { org } = useOrg()
  const orgId = org?.id
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [group, setGroup] = useState('')
  const [country, setCountry] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    const id = setTimeout(() => setSearchTerm(searchInput.trim()), 300)
    return () => clearTimeout(id)
  }, [searchInput])
  useEffect(() => { setPage(0) }, [searchTerm, group, country])

  const filter: RansomwareFilter = {
    q: searchTerm || undefined,
    group: group || undefined,
    country: country || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.threatIntel.ransomware(orgId, searchTerm, group, country, page),
    queryFn: () => listRansomware(orgId!, filter),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const incidents = data?.incidents ?? []
  const total = data?.total ?? 0

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ flexShrink: 0, px: { xs: 2, md: 4 }, pt: { xs: 2, md: 3 }, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography component="h1" className="text-3xl leading-none font-semibold tracking-tight">
              {t('threatIntel.ransomware')}
            </Typography>
            <Typography className="ml-0.5 mt-1 text-base font-medium" color="text.secondary">
              {t('threatIntel.ransomwareLede')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, flexShrink: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ pt: 0.5 }}>
              {t('threatIntel.totalCount')}: <strong>{total.toLocaleString()}</strong>
            </Typography>
            <ThreatIntelRefreshButton source="ransomware" />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 2.5, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder={t('threatIntel.ransomSearch')}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            sx={{ flex: 1, minWidth: 280, maxWidth: 420 }}
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
          <Select size="small" value={group} onChange={e => setGroup(e.target.value)} displayEmpty sx={{ minWidth: 160, fontSize: 13 }}>
            <MenuItem value="">{t('threatIntel.allGroups')}</MenuItem>
            {['lockbit3', 'blackbasta', 'akira', '8base', 'cl0p', 'play', 'medusa', 'ransomhub'].map(g => (
              <MenuItem key={g} value={g}>{g}</MenuItem>
            ))}
          </Select>
          <Select size="small" value={country} onChange={e => setCountry(e.target.value)} displayEmpty sx={{ minWidth: 160, fontSize: 13 }}>
            <MenuItem value="">{t('threatIntel.allCountries')}</MenuItem>
            {['US', 'GB', 'DE', 'FR', 'JP', 'TW', 'KR'].map(c => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </Select>
        </Box>
        <ThreatIntelFeedStatus sources={['ransomware.live']} sx={{ mt: 1.25 }} />
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 2, md: 4 }, py: 2 }}>
        {isError && <QueryError error={error} onRetry={refetch} label={t('threatIntel.ransomLoadError')} compact />}
        {isLoading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} variant="rectangular" height={48} />)}
          </Box>
        )}
        {!isLoading && !isError && incidents.length === 0 && (
          <ThreatIntelEmptyState
            icon={<Skull size={28} />}
            tone={RANSOM_TONE}
            title={t('threatIntel.ransomEmptyTitle')}
            description={t('threatIntel.ransomEmpty')}
            refreshSource="ransomware"
          />
        )}
        {!isLoading && !isError && incidents.length > 0 && (
          <Paper elevation={0} sx={{
            overflow: 'hidden', borderRadius: 2.5,
            border: '1px solid', borderColor: softBg(RANSOM_TONE, 0.25),
            bgcolor: 'background.paper',
          }}>
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: '20px 1.5fr 1fr 80px 1fr 110px 60px',
              gap: 1, alignItems: 'center',
              px: 2, py: 1.25,
              borderBottom: '1px solid', borderColor: 'divider',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 12, fontWeight: 700, color: 'text.secondary',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              background: `linear-gradient(90deg, ${softBg(RANSOM_TONE, 0.08)} 0%, transparent 60%)`,
            }}>
              <span />
              <span>{t('threatIntel.col.victim')}</span>
              <span>{t('threatIntel.col.group')}</span>
              <span>{t('threatIntel.col.country')}</span>
              <span>{t('threatIntel.col.sector')}</span>
              <span>{t('threatIntel.col.published')}</span>
              <span></span>
            </Box>
            {incidents.map(r => (
              <Box
                key={r.id}
                sx={{
                  position: 'relative',
                  display: 'grid',
                  gridTemplateColumns: '20px 1.5fr 1fr 80px 1fr 110px 60px',
                  gap: 1, alignItems: 'center',
                  px: 2, py: 1.5,
                  borderBottom: '1px solid', borderColor: 'divider',
                  fontSize: 13,
                  '&:last-child': { borderBottom: 'none' },
                  // Crimson left-edge wash on hover — the row "lights up"
                  // as a leak claim, SOC-monitor style.
                  '&:hover': {
                    bgcolor: softBg(RANSOM_TONE, 0.05),
                    boxShadow: `inset 3px 0 0 ${RANSOM_TONE}`,
                  },
                }}
              >
                <Skull size={14} style={{ color: RANSOM_TONE, opacity: 0.7 }} />
                <Box sx={{ overflow: 'hidden' }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.victim_name}
                  </Typography>
                  {r.victim_domain && (
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', fontFamily: 'ui-monospace, monospace' }}>
                      {r.victim_domain}
                    </Typography>
                  )}
                </Box>
                <Box>
                  <Chip size="small" label={r.group_name} sx={{
                    fontSize: 12, height: 20, fontWeight: 700, fontFamily: 'ui-monospace, monospace',
                    color: RANSOM_TONE, bgcolor: softBg(RANSOM_TONE, 0.12),
                    border: `1px solid ${softBg(RANSOM_TONE, 0.3)}`,
                    maxWidth: '100%',
                    '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                  }} />
                </Box>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', fontFamily: 'ui-monospace, monospace' }}>{r.victim_country || '—'}</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.victim_sector || '—'}</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', fontFamily: 'ui-monospace, monospace' }}>{dateLabel(r.published_at)}</Typography>
                {r.leak_url ? (
                  <IconButton
                    size="small"
                    component="a"
                    href={r.leak_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('threatIntel.openSource')}
                    title={t('threatIntel.openSource')}
                    sx={{ p: 0.5 }}
                  >
                    <ExternalLink size={12} />
                  </IconButton>
                ) : <span />}
              </Box>
            ))}
          </Paper>
        )}
      </Box>
      {!isLoading && !isError && incidents.length > 0 && (
        <Box sx={{
          flexShrink: 0,
          borderTop: '1px solid', borderColor: 'divider',
          px: { xs: 2, md: 4 }, py: 1.25,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1.5,
          bgcolor: 'background.paper',
        }}>
          <Typography variant="caption" color="text.secondary">
            {t('threatIntel.page')} {page + 1}{' · '}{incidents.length} {t('threatIntel.shown')}
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
            disabled={incidents.length < PAGE_SIZE}
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
