import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Chip, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { listFeedStatus, type FeedStatus } from '@lib/engine'

const SOURCE_LABELS: Record<string, string> = {
  mitre_attack: 'MITRE ATT&CK',
  mitre: 'MITRE ATT&CK',
  'ransomware.live': 'ransomware.live',
  ransomware: 'ransomware.live',
  curated: 'Curated',
}

const SOURCE_ALIASES: Record<string, string[]> = {
  mitre_attack: ['mitre_attack', 'mitre'],
  'ransomware.live': ['ransomware.live', 'ransomware'],
}

interface ThreatIntelFeedStatusProps {
  sources?: string[]
  sx?: SxProps<Theme>
}

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source
}

function sourceMatches(feedSource: string, expected: string): boolean {
  return feedSource === expected || (SOURCE_ALIASES[expected] ?? []).includes(feedSource)
}

function compactNum(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function ageLabel(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  const minutes = Math.max(0, Math.round((Date.now() - t) / 60_000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function rowsFor(feed: FeedStatus): number {
  return Math.max(feed.rows_ingested ?? 0, feed.total_rows ?? 0)
}

function chipMeta(feed: FeedStatus) {
  const rows = rowsFor(feed)
  if (feed.last_error) {
    return {
      icon: AlertTriangle,
      tone: '#ef4444',
      state: t('threatIntel.feedError'),
    }
  }
  if (!feed.last_ok_at) {
    return {
      icon: AlertTriangle,
      tone: '#f59e0b',
      state: t('threatIntel.feedNeverOk'),
    }
  }
  if (rows === 0) {
    return {
      icon: Clock,
      tone: '#f59e0b',
      state: `${t('threatIntel.feedLastOk')} ${ageLabel(feed.last_ok_at)}`,
    }
  }
  return {
    icon: CheckCircle2,
    tone: '#22c55e',
    state: ageLabel(feed.last_ok_at),
  }
}

function tooltip(feed: FeedStatus): string {
  const lines = [
    `${sourceLabel(feed.source)} feed`,
    `Rows ingested: ${(feed.rows_ingested ?? 0).toLocaleString()}`,
    `Total rows: ${(feed.total_rows ?? 0).toLocaleString()}`,
  ]
  if (feed.last_run_at) lines.push(`Last run: ${new Date(feed.last_run_at).toLocaleString()}`)
  if (feed.last_ok_at) lines.push(`Last OK: ${new Date(feed.last_ok_at).toLocaleString()}`)
  if (feed.last_error) lines.push(`Last error: ${feed.last_error}`)
  return lines.join('\n')
}

export function ThreatIntelFeedStatus({ sources = [], sx }: ThreatIntelFeedStatusProps) {
  const { org } = useOrg()
  const orgId = org?.id

  const { data, isLoading, isError } = useQuery({
    queryKey: qk.threatIntel.feedStatus(orgId),
    queryFn: () => listFeedStatus(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const feeds = data?.feeds ?? []
  const selectedFeeds = useMemo(() => {
    if (sources.length === 0) return feeds
    return feeds.filter(feed => sources.some(source => sourceMatches(feed.source, source)))
  }, [feeds, sources])

  const missingSources = sources.filter(source => (
    !feeds.some(feed => sourceMatches(feed.source, source))
  ))

  return (
    <Box sx={[{
      display: 'flex',
      alignItems: 'center',
      gap: 0.75,
      flexWrap: 'wrap',
      minHeight: 24,
    }, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}>
      <Typography sx={{
        fontSize: 12,
        color: 'text.secondary',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        {t('threatIntel.feedStatus')}
      </Typography>

      {isLoading && (
        <Chip
          size="small"
          label={t('threatIntel.feedLoading')}
          sx={{ height: 22, fontSize: 12 }}
          variant="outlined"
        />
      )}

      {isError && (
        <Chip
          size="small"
          icon={<AlertTriangle size={12} />}
          label={t('threatIntel.feedUnavailable')}
          sx={{ height: 22, fontSize: 12, color: '#f59e0b', borderColor: '#f59e0b' }}
          variant="outlined"
          title={t('threatIntel.feedUnavailableTip')}
        />
      )}

      {!isLoading && !isError && selectedFeeds.map(feed => {
        const meta = chipMeta(feed)
        const Icon = meta.icon
        return (
          <Chip
            key={feed.source}
            size="small"
            icon={<Icon size={12} style={{ color: meta.tone }} />}
            label={`${sourceLabel(feed.source)} · ${compactNum(rowsFor(feed))} rows · ${meta.state}`}
            sx={{
              height: 22,
              maxWidth: 320,
              fontSize: 12,
              color: meta.tone,
              borderColor: meta.tone,
              bgcolor: 'transparent',
              '& .MuiChip-label': {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
            }}
            variant="outlined"
            title={tooltip(feed)}
          />
        )
      })}

      {!isLoading && !isError && missingSources.map(source => (
        <Chip
          key={source}
          size="small"
          icon={<AlertTriangle size={12} />}
          label={`${sourceLabel(source)} · ${t('threatIntel.feedNoRecord')}`}
          sx={{ height: 22, fontSize: 12, color: '#f59e0b', borderColor: '#f59e0b', bgcolor: 'transparent' }}
          variant="outlined"
          title={t('threatIntel.feedNoRecordTip')}
        />
      ))}

      {!isLoading && !isError && sources.length === 0 && feeds.length === 0 && (
        <Chip
          size="small"
          icon={<AlertTriangle size={12} />}
          label={t('threatIntel.feedNoRecords')}
          sx={{ height: 22, fontSize: 12, color: '#f59e0b', borderColor: '#f59e0b', bgcolor: 'transparent' }}
          variant="outlined"
          title={t('threatIntel.feedNoRecordsTip')}
        />
      )}
    </Box>
  )
}
