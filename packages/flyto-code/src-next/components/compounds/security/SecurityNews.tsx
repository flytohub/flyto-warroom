/**
 * SecurityNews — aggregated CVE / breach / threat-intel feed.
 *
 * Backend (`GET /api/v1/code/news`) fans out to BleepingComputer /
 * The Hacker News / Krebs / abuse.ch URLhaus / SecurityWeek /
 * Dark Reading / etc., merges + dedupes + caches ~30 min. Each
 * NewsItem has a `thumbnail` URL when the source feed provides one.
 *
 * Design (2026-05-19 rewrite #2) — Apple-News / Google-News style:
 *   - 80px square thumbnail on the left when available; coloured-by-
 *     source initial-block placeholder otherwise.
 *   - Transparent row background. Border only between rows, no
 *     fill — operator complained "為什麼一定要藍底" after the v1
 *     rewrite still read as tinted.
 *   - Two-region scroll: header pinned at top, list scrolls inside
 *     its own region. ("主體不動 內部滾動" — operator emphasised
 *     this in feedback_workspace_scroll_pattern memory.)
 *   - Items grouped by date bucket so 50 rows have visual rhythm.
 */

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Typography, Skeleton, Alert } from '@mui/material'
import { ArrowUpRight, Clock } from 'lucide-react'
import { t as i18nT, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { getSecurityNews, type NewsItem, type NewsResponse } from '@lib/engine'
import { QueryError } from '@atoms/QueryError'

// ── Source palette ────────────────────────────────────────────
// Subtle, distinct hues — restrained enough that 20 rows from
// the same source don't dominate, distinct enough to glance-sort
// by source colour.
const SOURCE_TONE: Record<string, string> = {
  'The Hacker News':       '#7c3aed', // violet
  'BleepingComputer':      '#0891b2', // cyan
  'Krebs on Security':     '#dc2626', // red
  'abuse.ch URLhaus':      '#ea580c', // orange
  'SecurityWeek':          '#0d9488', // teal
  'Dark Reading':          '#7e22ce', // purple
  'Threatpost':            '#be123c', // rose
  'CISA':                  '#1d4ed8', // blue
  'NVD':                   '#475569', // slate
}
function sourceTone(source: string): string {
  return SOURCE_TONE[source] ?? '#64748b'
}
function sourceInitial(source: string): string {
  // First letter of each word, max 2 chars. "The Hacker News" → "TH".
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

async function getSecurityNewsOrEmpty(): Promise<NewsResponse> {
  try {
    return await getSecurityNews()
  } catch {
    return { items: [], cached_at: '' }
  }
}

function timeAgo(iso: string): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return i18nT('common.justNow')
  if (mins < 60) return `${mins}m ${i18nT('common.ago')}`
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 24) return `${hours}h ${i18nT('common.ago')}`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ${i18nT('common.ago')}`
  const months = Math.floor(days / 30)
  return `${months}mo ${i18nT('common.ago')}`
}

function dateBucket(iso: string): 'today' | 'yesterday' | 'thisWeek' | 'older' {
  if (!iso) return 'older'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'older'
  const now = new Date()
  const d = new Date(t)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (sameDay(now, d)) return 'today'
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (sameDay(yesterday, d)) return 'yesterday'
  const diff = now.getTime() - t
  if (diff < 7 * 86_400_000) return 'thisWeek'
  return 'older'
}

const BUCKET_LABEL: Record<ReturnType<typeof dateBucket>, string> = {
  today: 'news.bucketToday',
  yesterday: 'news.bucketYesterday',
  thisWeek: 'news.bucketThisWeek',
  older: 'news.bucketOlder',
}
const BUCKET_FALLBACK: Record<ReturnType<typeof dateBucket>, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  older: 'Earlier',
}

export interface SecurityNewsProps {
  /** Cap the list. Default 8 (dashboard card); pass higher (e.g. 50)
   *  for the standalone page. */
  limit?: number
  /** Compact (single-line per item, no grouping). Used inside dashboard
   *  cards where vertical space is scarce. */
  compact?: boolean
}

export function SecurityNews({ limit = 8, compact = false }: SecurityNewsProps = {}) {
  const newsQ = useQuery({
    queryKey: qk.security.news(),
    queryFn: getSecurityNewsOrEmpty,
    staleTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  })

  if (newsQ.isLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
            <Skeleton variant="rounded" width={compact ? 48 : 80} height={compact ? 48 : 80} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" height={20} sx={{ mb: 0.5 }} />
              <Skeleton variant="text" height={16} width="40%" />
            </Box>
          </Box>
        ))}
      </Box>
    )
  }

  if (newsQ.isError) {
    return (
      <QueryError
        error={newsQ.error}
        onRetry={newsQ.refetch}
        compact
        label={i18nT('news.label')}
      />
    )
  }

  const items = (newsQ.data?.items ?? []).slice(0, limit)

  if (items.length === 0) {
    return (
      <Alert severity="info" variant="outlined">
        {i18nT('news.empty')}
      </Alert>
    )
  }

  if (compact) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((item, idx) => (
          <NewsRow key={`${item.link}-${idx}`} item={item} compact />
        ))}
      </Box>
    )
  }

  const groups = groupBy(items, (i) => dateBucket(i.published ?? ''))
  const order: Array<ReturnType<typeof dateBucket>> = ['today', 'yesterday', 'thisWeek', 'older']

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {order.map((bucket) => {
        const bucketItems = groups[bucket]
        if (!bucketItems || bucketItems.length === 0) return null
        return (
          <Box key={bucket} sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography
              className="text-sm font-semibold uppercase"
              color="text.secondary"
              sx={{ letterSpacing: '0.06em', mb: 1.5 }}
            >
              {tOr(BUCKET_LABEL[bucket], BUCKET_FALLBACK[bucket])}
              <Box component="span" sx={{ ml: 1, color: 'text.secondary', fontWeight: 500 }}>
                · {bucketItems.length}
              </Box>
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              {bucketItems.map((item, idx) => (
                <NewsRow key={`${item.link}-${idx}`} item={item} compact={false} />
              ))}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

function NewsRow({ item, compact }: { item: NewsItem; compact: boolean }) {
  const tone = sourceTone(item.source)
  const [imgFailed, setImgFailed] = useState(false)
  const hasImage = !!item.thumbnail && !imgFailed
  const thumbSize = compact ? 48 : 80

  return (
    <Box
      component="a"
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 2,
        py: compact ? 1 : 2,
        px: 1,
        borderBottom: '1px solid',
        borderColor: 'divider',
        textDecoration: 'none',
        color: 'inherit',
        // Row stays transparent — only the hover overlay tints it. (Explicit
        // so it can never inherit a source-tone fill; operator complaint: every
        // row looked like a coloured card.)
        backgroundColor: 'transparent',
        transition: 'background-color 0.12s',
        // Hover uses the existing action.hover token (theme-aware,
        // neutral grey in light mode, neutral white-overlay in dark)
        // so it never reads as a tinted "blue" or "teal" panel —
        // exact operator complaint from 2026-05-19 screenshot review.
        '&:hover': {
          bgcolor: 'action.hover',
          '& .news-arrow': { opacity: 1, transform: 'translate(2px, -2px)' },
        },
      }}
    >
      {/* Thumbnail — image when feed provides one, source-coloured
          initial block as a graceful fallback. Square aspect ratio
          so the row height is predictable regardless of source. */}
      <Box
        sx={{
          width: thumbSize,
          height: thumbSize,
          borderRadius: 1.5,
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Placeholder background — uses the source tone at low
          // opacity. Only visible when the feed has no thumbnail or
          // the image 404'd; never bleeds onto the row itself.
          bgcolor: hasImage ? 'transparent' : `${tone}1a`,
          color: tone,
          fontSize: compact ? 14 : 22,
          fontWeight: 700,
          letterSpacing: '0.04em',
        }}
      >
        {hasImage ? (
          <Box
            component="img"
            src={item.thumbnail}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          sourceInitial(item.source)
        )}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            color: 'text.primary',
            fontSize: compact ? 13 : 15,
            fontWeight: 600,
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: compact ? 1 : 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {item.title}
        </Typography>
        {!compact && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              mt: 0.75,
              fontSize: 12,
              color: 'text.secondary',
            }}
          >
            <Typography
              component="span"
              sx={{ fontSize: 12, fontWeight: 600, color: tone }}
            >
              {item.source}
            </Typography>
            {item.published && (
              <>
                <Box component="span" sx={{ color: 'text.secondary' }}>·</Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Clock size={11} />
                  <Typography component="span" sx={{ fontSize: 12 }}>
                    {timeAgo(item.published)}
                  </Typography>
                </Box>
              </>
            )}
          </Box>
        )}
      </Box>

      <Box
        className="news-arrow"
        sx={{
          opacity: 0,
          transition: 'opacity 0.15s, transform 0.15s',
          color: 'text.secondary',
          flexShrink: 0,
          alignSelf: 'center',
          pr: 0.5,
        }}
      >
        <ArrowUpRight size={16} />
      </Box>
    </Box>
  )
}

function groupBy<T, K extends string>(items: T[], keyFn: (item: T) => K): Partial<Record<K, T[]>> {
  const out: Partial<Record<K, T[]>> = {}
  for (const item of items) {
    const k = keyFn(item)
    const arr = out[k] ?? []
    arr.push(item)
    out[k] = arr
  }
  return out
}

/**
 * SecurityNewsView — page-level wrapper for the SecurityNews widget.
 *
 * Layout — two-region scroll per the workspace pattern:
 *
 *   ┌────────────────────────────────────┐
 *   │ Title + subtitle (fixed)          │  flexShrink:0
 *   ├────────────────────────────────────┤
 *   │ News list (scrolls)               │  flex:1 overflowY:auto
 *   │ ...                                │
 *   └────────────────────────────────────┘
 *
 * Outer Box uses `overflow:hidden` and the inner list owns scroll —
 * that way the header stays pinned while the operator scrolls through
 * 50 items. Avoids the previous "header scrolls away with content"
 * behaviour that operators flagged as breaking the war-room frame.
 *
 * No `bgcolor` set anywhere — inherits the workspace neutral so the
 * page never reads as "tinted blue/teal".
 */
export function SecurityNewsView() {
  const newsQ = useQuery({
    queryKey: qk.security.news(),
    queryFn: getSecurityNewsOrEmpty,
    staleTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  })
  const itemCount = useMemo(() => (newsQ.data?.items ?? []).length, [newsQ.data])

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Fixed header */}
      <Box
        sx={{
          flexShrink: 0,
          px: { xs: 2, md: 4 },
          pt: { xs: 2, md: 3 },
          pb: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box className="flex items-baseline gap-3">
          <Typography className="text-3xl leading-none font-semibold tracking-tight">
            {i18nT('news.pageTitle')}
          </Typography>
          {itemCount > 0 && (
            <Typography
              component="span"
              className="text-base font-medium"
              color="text.secondary"
            >
              {itemCount} {i18nT('news.itemsLabel')}
            </Typography>
          )}
        </Box>
        <Typography
          className="ml-0.5 mt-1 text-base font-medium"
          color="text.secondary"
        >
          {i18nT('news.pageSubtitle')}
        </Typography>
      </Box>

      {/* Scrollable list region */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          px: { xs: 2, md: 4 },
          py: 3,
        }}
      >
        <SecurityNews limit={50} />
      </Box>
    </Box>
  )
}
