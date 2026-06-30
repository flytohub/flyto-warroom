import { Box, Typography, Chip, Tooltip, IconButton, Checkbox } from '@mui/material'
import {
  Activity, ShieldAlert, ChevronDown, ChevronRight as ChevronRightSmall,
  History as HistoryIcon,
} from 'lucide-react'
import { t } from '@lib/i18n';
import { parseJSONArray, type Finding } from '@lib/engine'
import { GRADE_TONE, IMPORTANCE_TONE } from '@lib/tokens/severity'
import { SeverityChip } from '@atoms/SeverityChip'
import { type ColumnDef, dateLabel } from './types'
import { ExpandedAssets } from './ExpandedAssets'
import { findingStatusMeta, sourceQualityMeta } from './presentation'

// One findings-table row (+ its expanded asset rows). Extracted verbatim
// from FindingsView.tsx (behaviour-neutral split). Severity/grade/importance
// rendering still uses @lib/tokens/severity tones; swapping to the shared
// SeverityChip atom is a separate, visually-verified follow-up.

export function FindingRow({
  f, orgId, visibleColumns, gridTemplate,
  selected, onToggleSelect, expanded, onToggleExpand, onOpen,
}: {
  f: Finding
  orgId: string
  visibleColumns: ColumnDef[]
  gridTemplate: string
  selected: boolean
  onToggleSelect: () => void
  expanded: boolean
  onToggleExpand: () => void
  onOpen: () => void
}) {
  const groups = parseJSONArray(f.threat_groups)
  const tags = parseJSONArray(f.tags)
  const gradeTone = (GRADE_TONE[f.grade ?? ''] ?? GRADE_TONE['']).tone
  const impTone = (IMPORTANCE_TONE[f.asset_importance ?? ''] ?? IMPORTANCE_TONE['']).tone
  const idShort = f.external_id ? f.external_id.slice(0, 10) : f.fingerprint.slice(0, 10)
  const versionCount = f.lifecycle_summary?.state_version_count ?? f.state_version_count ?? 0
  const recordedEvents = f.lifecycle_summary?.recorded_event_count ?? 0
  const lifecycleNote = [
    versionCount > 1 ? `${versionCount} states` : '',
    recordedEvents > 0 ? `${recordedEvents} events` : '',
  ].filter(Boolean).join(' · ')
  const quality = sourceQualityMeta(f.source_quality?.coverage_status)
  const ownerLabel = f.owner_display_name || t('findings.ownerNotLinked')
  const historical = f.lifecycle_summary?.is_historical ?? Boolean(f.resolved_at)

  return (
    <>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: gridTemplate,
          gap: 0.75, alignItems: 'center',
          px: 2, py: 1.5,
          borderBottom: '1px solid', borderColor: 'divider',
          fontSize: 13,
          bgcolor: selected ? 'action.selected' : historical ? 'action.hover' : 'transparent',
          opacity: historical ? 0.86 : 1,
          '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
          '&:last-child': { borderBottom: 'none' },
        }}
      >
        {visibleColumns.map(c => {
          switch (c.id) {
            case 'select':
              return (
                <Checkbox
                  key={c.id} size="small" checked={selected}
                  onChange={onToggleSelect}
                  onClick={e => e.stopPropagation()}
                  sx={{ p: 0 }}
                />
              )
            case 'expand':
              return (
                <IconButton
                  key={c.id} size="small"
                  onClick={e => { e.stopPropagation(); onToggleExpand() }}
                  aria-label={expanded ? t('common.collapse') : t('common.expand')}
                  title={expanded ? t('common.collapse') : t('common.expand')}
                  sx={{ p: 0, width: 20, height: 20 }}
                >
                  {expanded ? <ChevronDown size={14} /> : <ChevronRightSmall size={14} />}
                </IconButton>
              )
            case 'risk':
              return (
                <Tooltip key={c.id} title={f.description} arrow placement="top">
                  <Box
                    onClick={onOpen}
                    sx={{
                      minWidth: 0,
                      cursor: 'pointer',
                      overflow: 'hidden',
                    }}
                  >
                    <Typography sx={{
                      fontSize: 13, fontWeight: 700,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {f.category || '—'}
                    </Typography>
                    <Typography sx={{
                      fontSize: 12, fontFamily: 'monospace', color: 'text.secondary',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {lifecycleNote ? `${idShort}… · ${lifecycleNote}` : `${idShort}…`}
                    </Typography>
                  </Box>
                </Tooltip>
              )
            case 'findingId':
              return (
                <Tooltip key={c.id} title={f.external_id || f.fingerprint} arrow placement="top">
                  <Typography sx={{
                    fontSize: 12, fontFamily: 'monospace', color: 'text.secondary',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {idShort}…
                  </Typography>
                </Tooltip>
              )
            case 'asset':
              return (
                <Box key={c.id} onClick={onOpen} sx={{ minWidth: 0, cursor: 'pointer' }}>
                  <Typography sx={{
                    fontSize: 12, fontFamily: 'monospace', color: 'text.primary',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {f.domain || '—'}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.35, minWidth: 0, overflow: 'hidden' }}>
                    <Tooltip title={ownerLabel} arrow placement="top">
                      <Chip
                        size="small"
                        label={ownerLabel}
                        variant={f.owner_display_name ? 'filled' : 'outlined'}
                        sx={{
                          height: 18, maxWidth: '58%', fontSize: 12,
                          '& .MuiChip-label': { px: 0.75, overflow: 'hidden', textOverflow: 'ellipsis' },
                        }}
                      />
                    </Tooltip>
                    <Chip
                      size="small"
                      label={quality.label}
                      color={quality.color}
                      variant={quality.variant}
                      sx={{
                        height: 18, maxWidth: '42%', fontSize: 12,
                        '& .MuiChip-label': { px: 0.75, overflow: 'hidden', textOverflow: 'ellipsis' },
                      }}
                    />
                  </Box>
                </Box>
              )
            case 'details':
              return (
                <Tooltip key={c.id} title={f.details_text || f.description} arrow placement="top">
                  <Typography sx={{
                    fontSize: 12, color: 'text.secondary',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {f.details_text || f.description}
                  </Typography>
                </Tooltip>
              )
            case 'firstSeen':
              return <Typography key={c.id} sx={{ fontSize: 12, color: 'text.secondary' }}>{dateLabel(f.first_seen_at)}</Typography>
            case 'lastSeen':
              return <Typography key={c.id} sx={{ fontSize: 12, color: 'text.secondary' }}>{dateLabel(f.last_seen_at)}</Typography>
            case 'severity':
              return <SeverityChip key={c.id} severity={f.severity} />
            case 'grade':
              return f.grade ? (
                <Chip
                  key={c.id} label={f.grade} size="small" variant="outlined"
                  sx={{ fontSize: 12, fontWeight: 600, borderColor: gradeTone, color: gradeTone, textTransform: 'uppercase' }}
                />
              ) : <Typography key={c.id} variant="caption" sx={{ fontSize: 12, color: 'text.secondary' }}>—</Typography>
            case 'status': {
              const status = findingStatusMeta(f)
              return (
                <Chip
                  key={c.id}
                  label={status.label}
                  size="small"
                  color={status.color}
                  variant={status.variant}
                  sx={{ fontSize: 12, fontWeight: 700, maxWidth: '100%' }}
                />
              )
            }
            case 'history':
              return (
                <Tooltip key={c.id} title={t('findings.openHistory')} arrow>
                  <IconButton
                    size="small"
                    onClick={e => { e.stopPropagation(); onOpen() }}
                    aria-label={t('findings.openHistory')}
                    sx={{ width: 28, height: 28 }}
                  >
                    <HistoryIcon size={15} />
                  </IconButton>
                </Tooltip>
              )
            case 'threat':
              return f.has_threat_insights ? (
                <Tooltip
                  key={c.id} arrow placement="top"
                  title={
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {groups.length} {t('findings.threatGroups')}
                      </Typography>
                      {groups.slice(0, 5).map(g => <Typography key={g} variant="caption" display="block" sx={{ fontSize: 12 }}>{g}</Typography>)}
                      {groups.length > 5 && <Typography variant="caption" display="block" sx={{ fontSize: 12, opacity: 0.7 }}>+{groups.length - 5} more</Typography>}
                      {f.threat_activity_label && <Typography variant="caption" display="block" sx={{ fontSize: 12, mt: 0.5, fontStyle: 'italic' }}>{f.threat_activity_label}</Typography>}
                    </Box>
                  }
                >
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: '#ef4444' }}>
                    {f.threat_activity_label === 'accelerating' ? <Activity size={14} /> : <ShieldAlert size={14} />}
                    <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{groups.length || '·'}</Typography>
                  </Box>
                </Tooltip>
              ) : <Typography key={c.id} variant="caption" sx={{ fontSize: 12, color: 'text.secondary' }}>—</Typography>
            case 'importance':
              return f.asset_importance ? (
                <Chip
                  key={c.id} label={f.asset_importance[0].toUpperCase()} size="small"
                  sx={{ fontSize: 12, fontWeight: 700, bgcolor: `${impTone}1a`, color: impTone, width: 24, height: 22 }}
                />
              ) : <Typography key={c.id} variant="caption" sx={{ fontSize: 12, color: 'text.secondary' }}>—</Typography>
            case 'country':
              return <Typography key={c.id} sx={{ fontSize: 12, color: 'text.secondary' }}>{f.country || '—'}</Typography>
            case 'tags':
              return (
                <Box key={c.id} sx={{ display: 'flex', gap: 0.5, overflow: 'hidden' }}>
                  {tags.slice(0, 2).map(t => (
                    <Chip key={t} label={t} size="small" sx={{ fontSize: 12, height: 18 }} />
                  ))}
                  {tags.length > 2 && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>+{tags.length - 2}</Typography>}
                  {tags.length === 0 && <Typography variant="caption" sx={{ fontSize: 12, color: 'text.secondary' }}>—</Typography>}
                </Box>
              )
            case 'lifetime':
              return (
                <Typography key={c.id} sx={{ fontSize: 12, color: 'text.secondary' }}>
                  {f.remaining_lifetime_days != null ? `${f.remaining_lifetime_days}d` : '—'}
                </Typography>
              )
            default:
              return <span key={c.id} />
          }
        })}
      </Box>
      {expanded && <ExpandedAssets orgId={orgId} findingId={f.id} />}
    </>
  )
}
