/**
 * GroupedDomainList -- renders domains grouped by root domain.
 *
 * Root domains are expandable headers; subdomains are nested rows.
 * Replaces the flat DomainTable in DomainsView when grouping is active.
 */

import { useState, useMemo } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import IconButton from '@mui/material/IconButton'
import CircularProgress from '@mui/material/CircularProgress'
import { ChevronDown, ChevronRight, ShieldCheck, Trash2, Radar } from 'lucide-react'
import { t } from '@lib/i18n';
import { ENV_COLORS, PROJECT_TYPES, SCOPE_LABELS, type DomainRow, timeAgo } from './types'
import { ContextStrip } from '@atoms/ContextStrip'
import { GatedIconButton } from '@atoms/GatedButton'
import { JellyCard } from '@atoms/JellyCard'

interface Props {
  rows: DomainRow[]
  onSelect: (domain: string) => void
  onDelete?: (domain: string) => void
  /** Start a scan for a footprint/kernel-origin row (one carrying a
   *  resourceId). Renders a gated "Scan this" button when provided. */
  onScan?: (row: DomainRow) => void
  /** resource_id of the row whose scan request is in flight (spinner). */
  scanningResourceId?: string | null
  /** Authoritative discovery store seeded from SSE + /discoveries/active. */
  scanningResourceIds?: ReadonlySet<string>
}

interface DomainGroup {
  /** User-defined group name (from the root project's name field) */
  name: string
  /** The root project ID (for group-level operations) */
  groupId: string | null
  /** All domains in this group -- flat, equal peers */
  members: DomainRow[]
}

/**
 * Group domains by parent_id. All domains in a group are EQUAL peers --
 * there's no hierarchy or indentation. The group header uses the root
 * project's user-defined name.
 *
 * Exported so DomainsView (and any future consumer that needs the
 * "groups · domains" count chip / breakdown) reuses the exact same
 * keying rules — in particular the `byId.has(pid)` guard that turns
 * dangling parent refs into their own group instead of a phantom
 * merge bucket. Diverging copies silently disagree with the rendered
 * list.
 */
export function groupRows(rows: DomainRow[]): DomainGroup[] {
  const byId = new Map<string, DomainRow>()
  for (const row of rows) {
    if (row.project?.id) byId.set(row.project.id, row)
  }

  const groups = new Map<string, DomainGroup>()

  for (const row of rows) {
    const pid = row.project?.parent_id
    let groupKey: string

    if (pid && byId.has(pid)) {
      // Member of an existing group
      groupKey = pid
    } else if (row.project?.id) {
      // Root project -- creates/joins its own group
      groupKey = row.project.id
    } else {
      // No project -- standalone group by domain name
      groupKey = `_orphan_${row.domain}`
    }

    if (!groups.has(groupKey)) {
      // Determine group name: use root project's name
      const rootRow = byId.get(groupKey)
      const name = rootRow?.project?.display_name || rootRow?.project?.name || row.project?.name || row.domain
      groups.set(groupKey, { name, groupId: groupKey.startsWith('_orphan_') ? null : groupKey, members: [] })
    }
    groups.get(groupKey)!.members.push(row)
  }

  return Array.from(groups.values()).sort((a, b) => {
    const ai = a.members.reduce((s, r) => s + r.issues.length, 0)
    const bi = b.members.reduce((s, r) => s + r.issues.length, 0)
    if (ai !== bi) return bi - ai
    return a.name.localeCompare(b.name)
  })
}

function hasDomainSignals(row: DomainRow): boolean {
  if (row.open_prs_touching && row.open_prs_touching.length > 0) return true
  if (row.pentest_verdict) return true
  return false
}

function rowScopeBucket(row: DomainRow): string {
  if (row.scopeBucket) return row.scopeBucket
  if (row.verifierStatus === 'inconclusive') return 'candidate'
  return 'core_owned'
}

const SCOPE_TONE: Record<string, { fg: string; bg: string; border: string }> = {
  core_owned: { fg: '#38bdf8', bg: 'rgba(56,189,248,0.10)', border: 'rgba(56,189,248,0.36)' },
  owned_asset: { fg: '#22c55e', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.36)' },
  vendor_operated: { fg: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.36)' },
  external_context: { fg: '#a78bfa', bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.36)' },
  candidate: { fg: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.36)' },
}

export function GroupedDomainList({
  rows,
  onSelect,
  onDelete,
  onScan,
  scanningResourceId,
  scanningResourceIds,
}: Props) {
  const groups = useMemo(() => groupRows(rows), [rows])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  function toggle(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (groups.length === 0) return null

  return (
    <>
      <JellyCard delay={0} noHover>
      <Paper elevation={0} sx={{ borderRadius: 2, overflow: 'hidden', minWidth: 0 }}>
        <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 720, tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, fontSize: 12, width: '40%', pl: 3 }}>{t('dast.domainName')}</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: 12, width: '22%' }}>{t('issues.type')}</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: 12, width: '14%' }}>{t('nav.issues')}</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: 12, width: '18%' }}>{t('pentest.lastScan')}</TableCell>
              <TableCell sx={{ width: '6%' }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {groups.map(group => {
              const isOpen = !collapsed.has(group.name)
              const totalIssues = group.members.reduce((s, r) => s + r.issues.length, 0)
              const count = group.members.length

              return (
                <GroupSection
                  key={group.groupId ?? group.name}
                  group={group}
                  isOpen={isOpen}
                  totalIssues={totalIssues}
                  count={count}
                  onToggle={() => toggle(group.name)}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  onScan={onScan}
                  scanningResourceId={scanningResourceId}
                  scanningResourceIds={scanningResourceIds}
                />
              )
            })}
          </TableBody>
        </Table>
        </TableContainer>
      </Paper>
      </JellyCard>
    </>
  )
}

function GroupSection({
  group, isOpen, totalIssues, count, onToggle, onSelect, onDelete, onScan, scanningResourceId, scanningResourceIds,
}: {
  group: DomainGroup
  isOpen: boolean
  totalIssues: number
  count: number
  onToggle: () => void
  onSelect: (domain: string) => void
  onDelete?: (domain: string) => void
  onScan?: (row: DomainRow) => void
  scanningResourceId?: string | null
  scanningResourceIds?: ReadonlySet<string>
}) {
  return (
    <>
      {/* Group header row */}
      <TableRow
        onClick={onToggle}
        sx={{
          cursor: 'pointer',
          bgcolor: (theme) => theme.palette.action.hover,
          '&:hover': { bgcolor: (theme) => theme.palette.action.selected },
        }}
      >
        <TableCell colSpan={4} sx={{ py: 1.2, pl: 3 }}>
          <Box className="flex items-center gap-2">
            {isOpen ? <ChevronDown size={14} style={{ opacity: 0.5 }} /> : <ChevronRight size={14} style={{ opacity: 0.5 }} />}
            <Typography variant="body2" fontWeight={700}>{group.name}</Typography>
            <Typography variant="body2" color="text.secondary">{count}</Typography>
          </Box>
        </TableCell>
        <TableCell align="right" sx={{ py: 1.2 }}>
          {totalIssues > 0 && (
            <Chip label={totalIssues} size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: 13, fontWeight: 700 }} />
          )}
        </TableCell>
      </TableRow>

      {/* Domain rows */}
      {isOpen && group.members.map(row => {
        const env = row.project?.environment
        const typeInfo = PROJECT_TYPES.find(p => p.id === row.project?.project_type)
        const scopeBucket = rowScopeBucket(row)
        const scopeTone = SCOPE_TONE[scopeBucket] ?? SCOPE_TONE.candidate
        const rowScanning = !!row.resourceId && (
          scanningResourceId === row.resourceId || !!scanningResourceIds?.has(row.resourceId)
        )
        return (
          <TableRow
            key={row.domain}
            hover
            onClick={() => onSelect(row.domain)}
            sx={{ cursor: 'pointer', '&:last-child td': { border: 0 } }}
          >
            <TableCell sx={{ pl: 3 }}>
              <Box>
                <Box className="flex items-center gap-2">
                  {env && (
                    <Chip
                      label={ENV_COLORS[env]?.label}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: 12,
                        color: ENV_COLORS[env]?.color,
                        borderColor: ENV_COLORS[env]?.color,
                        flexShrink: 0,
                      }}
                      variant="outlined"
                    />
                  )}
                  <Chip
                    label={SCOPE_LABELS[scopeBucket] ?? scopeBucket}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: 12,
                      color: scopeTone.fg,
                      bgcolor: scopeTone.bg,
                      borderColor: scopeTone.border,
                      flexShrink: 0,
                    }}
                    variant="outlined"
                  />
                  {row.activeGateStatus && row.activeGateStatus !== 'ready' && (
                    <Chip
                      label={row.activeGateStatus.replace(/_/g, ' ')}
                      size="small"
                      color={row.activeGateStatus === 'needs_dns_verification' ? 'warning' : 'default'}
                      variant="outlined"
                      sx={{
                        height: 18,
                        fontSize: 12,
                        flexShrink: 0,
                        maxWidth: 150,
                        '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                      }}
                    />
                  )}
                  <Typography variant="body2" noWrap>{row.domain}</Typography>
                </Box>
                {hasDomainSignals(row) && (
                  <Box onClick={(e) => e.stopPropagation()}>
                    <ContextStrip
                      signals={{
                        open_prs_touching: row.open_prs_touching,
                        pentest_verdict:   row.pentest_verdict,
                        blast_radius:      row.blast_radius,
                      }}
                    />
                  </Box>
                )}
              </Box>
            </TableCell>
            <TableCell>
              <Typography variant="caption" sx={{ color: typeInfo?.color ?? 'text.secondary', fontWeight: 600 }}>
                {row.type ? t(row.type) : '--'}
              </Typography>
            </TableCell>
            <TableCell>
              {row.issues.length > 0
                ? <Chip label={row.issues.length} size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: 13, fontWeight: 700 }} />
                : (
                  <Box className="flex items-center gap-1" sx={{ color: 'text.secondary' }}>
                    <ShieldCheck size={12} />
                    <Typography variant="caption">0</Typography>
                  </Box>
                )
              }
            </TableCell>
            <TableCell>
              <Typography variant="body2" color="text.secondary">
                {row.lastScan ? timeAgo(row.lastScan) : '--'}
              </Typography>
            </TableCell>
            <TableCell>
              <Box className="flex items-center justify-end gap-0.5">
                {onScan && row.resourceId && (
                  <GatedIconButton
                    action="scan:trigger_external"
                    hideWhenDenied
                    size="small"
                    onClick={(e) => { e.stopPropagation(); onScan(row) }}
                    disabled={rowScanning}
                    aria-label={t('domains.scanThis')}
                    title={t('domains.scanThis')}
                    sx={{ opacity: 0.5, '&:hover': { opacity: 1, color: 'primary.main' } }}
                  >
                    {rowScanning
                      ? <CircularProgress size={13} />
                      : <Radar size={13} />}
                  </GatedIconButton>
                )}
                {onDelete && (
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); onDelete(row.domain) }}
                    aria-label={t('common.delete')}
                    sx={{ opacity: 0.4, '&:hover': { opacity: 1, color: 'error.main' } }}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                )}
              </Box>
            </TableCell>
          </TableRow>
        )
      })}
    </>
  )
}
