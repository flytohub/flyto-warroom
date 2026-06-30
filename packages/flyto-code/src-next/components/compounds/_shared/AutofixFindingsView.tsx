/**
 * AutofixFindingsView — AutoFix findings list. Per-rule x per-repo
 * grouped cards, filter bar, status pills, action menu, preview modal.
 */

import { useMemo, useState } from 'react'
import { useRepoFilter } from '@hooks/useRepoFilter'
import { useQuery } from '@tanstack/react-query'
import {
  Search, Filter, ChevronRight, MoreVertical, BarChart3,
  Wand2, RefreshCw, Eye, GitPullRequest, ExternalLink,
  Info, AlertTriangle,
} from 'lucide-react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Checkbox from '@mui/material/Checkbox'
import InputAdornment from '@mui/material/InputAdornment'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Tooltip from '@mui/material/Tooltip'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import {
  listAutofixFindings, type AutofixFindingRow, type AutofixPatchStatus,
} from '@lib/engine'
import { autofixStatusCopy } from '@lib/autofix/statusReason'
import { FlytoSelect } from '@atoms/FlytoSelect'
import { JellyCard } from '@atoms/JellyCard'
import { AutofixPreviewModal } from '@compounds/security/AutofixPreviewModal'
import { UniversalFindingPanel } from '@compounds/_shared/UniversalFindingPanel'

type SeverityFilter = '' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

const SEV_BG: Record<string, string> = {
  CRITICAL: 'rgba(239, 68, 68, 0.12)',
  HIGH:     'rgba(249, 115, 22, 0.12)',
  MEDIUM:   'rgba(56, 189, 248, 0.12)',
  LOW:      'rgba(34, 197, 94, 0.12)',
}
// canonical SEVERITY_TONE — was MEDIUM #38bdf8 blue, LOW #22c55e green
const SEV_FG: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#eab308',
  LOW:      '#64748b',
}
interface GroupKey {
  ruleId: string
  ruleTitle: string
  ruleCategory: string
  repoId: string
  repoName: string
}

interface Group {
  key: GroupKey
  findings: AutofixFindingRow[]
}

function groupFindings(findings: AutofixFindingRow[]): Group[] {
  const map = new Map<string, Group>()
  for (const f of findings) {
    const k = `${f.rule_id}|${f.repo_id}`
    let g = map.get(k)
    if (!g) {
      g = {
        key: {
          ruleId: f.rule_id,
          ruleTitle: f.rule_title || f.rule_id,
          ruleCategory: f.rule_category || '',
          repoId: f.repo_id,
          repoName: f.repo_name || f.repo_id,
        },
        findings: [],
      }
      map.set(k, g)
    }
    g.findings.push(f)
  }
  return Array.from(map.values()).sort((a, b) => {
    const sevRank = (g: Group) => {
      const ranks = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as Record<string, number>
      return Math.max(...g.findings.map(f => ranks[f.severity] ?? 0))
    }
    const sb = sevRank(b) - sevRank(a)
    if (sb !== 0) return sb
    return a.key.ruleId.localeCompare(b.key.ruleId)
  })
}

function statusFilterLabel(status: AutofixPatchStatus): string {
  switch (status) {
    case 'preview': return t('autofix.statusPreview')
    case 'no_preview': return t('autofix.statusNoPreview')
    case 'outdated': return t('autofix.status.findingResolved.label')
    case 'permanently_no_preview': return t('autofix.statusNeedsReview')
    case 'pr_opened': return t('autofix.statusPROpened')
    default: return status
  }
}

function severityLabel(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return t('severity.critical')
    case 'HIGH': return t('severity.high')
    case 'MEDIUM': return t('severity.medium')
    case 'LOW': return t('severity.low')
    default: return severity
  }
}

interface AutofixFindingsViewProps {
  category?: string
}

export function AutofixFindingsView({ category = '' }: AutofixFindingsViewProps = {}) {
  const { org } = useOrg()
  const orgId = org?.id

  const [search, setSearch] = useState('')
  const [severity, setSeverity] = useState<SeverityFilter>('')
  const { repoId: repoFilter, setRepo, clearRepo } = useRepoFilter()
  const [status, setStatus] = useState<'' | AutofixPatchStatus>('')
  const [showFilters, setShowFilters] = useState(false)
  const [previewFindingId, setPreviewFindingId] = useState<string | null>(null)
  const [selectedFp, setSelectedFp] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: qk.autofix.findings(orgId),
    queryFn: () => listAutofixFindings(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
    retry: false,
  })

  const allFindings = useMemo(() => {
    const raw = data?.findings ?? []
    return raw.filter(f => !(f.rule_id === 'tier2-ai' && f.patch_status === 'no_preview'))
  }, [data])

  const repoOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const f of allFindings) {
      if (!seen.has(f.repo_id)) seen.set(f.repo_id, f.repo_name || f.repo_id)
    }
    return Array.from(seen, ([id, name]) => ({ id, name }))
  }, [allFindings])

  const filtered = useMemo(() => {
    let list = allFindings
    if (category) {
      list = list.filter(f => (f.rule_category || '') === category)
    }
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(f =>
        f.title.toLowerCase().includes(q) ||
        f.file_path.toLowerCase().includes(q) ||
        f.rule_id.toLowerCase().includes(q) ||
        f.repo_name.toLowerCase().includes(q),
      )
    }
    if (severity) list = list.filter(f => f.severity === severity)
    if (repoFilter) list = list.filter(f => f.repo_id === repoFilter)
    if (status) list = list.filter(f => f.patch_status === status)
    return list
  }, [allFindings, category, search, severity, repoFilter, status])

  const groups = useMemo(() => groupFindings(filtered), [filtered])
  const totalFindings = filtered.length

  if (!orgId) return null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Filter bar */}
      <JellyCard delay={0} noHover>
      <Paper elevation={0} sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', borderRadius: 3, border: 1, borderColor: 'divider' }}>
        <TextField
          size="small"
          placeholder={t('autofix.search')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment>,
          }}
          sx={{ flex: 1, minWidth: 220 }}
        />
        <Button
          variant={showFilters ? 'contained' : 'outlined'}
          size="small"
          startIcon={<Filter size={14} />}
          onClick={() => setShowFilters(v => !v)}
          sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
        >
          {t('autofix.filter')}
        </Button>
        {(severity || repoFilter || status) && (
          <Button
            size="small"
            onClick={() => { setSeverity(''); clearRepo(); setStatus(''); }}
            sx={{ textTransform: 'none', fontSize: 13 }}
          >
            {t('autofix.clearFilters')}
          </Button>
        )}
      </Paper>
      </JellyCard>

      {/* Active filter chips — always visible (even when the advanced
          filter panel is collapsed) so an inherited repo filter from
          another view can't silently hide findings. Each chip is
          one-click removable. */}
      {(severity || repoFilter || status) && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: -1 }}>
          {repoFilter && (
            <Chip
              size="small"
              label={`${t('autofix.filterRepo')}: ${repoOptions.find(r => r.id === repoFilter)?.name ?? repoFilter}`}
              onDelete={() => clearRepo()}
              sx={{ height: 24, fontSize: 13, fontWeight: 600, bgcolor: 'rgba(167,139,250,0.12)', color: 'primary.main' }}
            />
          )}
          {severity && (
            <Chip
              size="small"
              label={`${t('autofix.filterSeverity')}: ${severityLabel(severity)}`}
              onDelete={() => setSeverity('')}
              sx={{ height: 24, fontSize: 13, fontWeight: 600 }}
            />
          )}
          {status && (
            <Chip
              size="small"
              label={`${t('autofix.filterStatus')}: ${statusFilterLabel(status)}`}
              onDelete={() => setStatus('')}
              sx={{ height: 24, fontSize: 13, fontWeight: 600 }}
            />
          )}
        </Box>
      )}

      {showFilters && (
        <JellyCard delay={0.04} noHover noEnter>
        <Paper elevation={0} sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', borderRadius: 3, border: 1, borderColor: 'divider' }}>
          <FlytoSelect
            minWidth={160}
            maxWidth={200}
            aria-label={t('autofix.filterSeverity')}
            value={severity}
            onChange={(v) => setSeverity(v as SeverityFilter)}
            options={[
              { value: '', label: t('autofix.allSeverities') },
              { value: 'CRITICAL', label: severityLabel('CRITICAL') },
              { value: 'HIGH', label: severityLabel('HIGH') },
              { value: 'MEDIUM', label: severityLabel('MEDIUM') },
              { value: 'LOW', label: severityLabel('LOW') },
            ]}
          />
          <FlytoSelect
            minWidth={180}
            maxWidth={260}
            aria-label={t('autofix.filterRepo')}
            value={repoFilter}
            onChange={(val) => { const r = repoOptions.find(x => x.id === val); setRepo(val, r?.name ?? val) }}
            options={[
              { value: '', label: t('autofix.allRepos') },
              ...repoOptions.map(r => ({ value: r.id, label: r.name })),
            ]}
            searchable={false}
          />
          <FlytoSelect
            minWidth={160}
            maxWidth={200}
            aria-label={t('autofix.filterStatus')}
            value={status}
            onChange={(v) => setStatus(v as typeof status)}
            options={[
              { value: '', label: t('autofix.allStatuses') },
              { value: 'preview', label: t('autofix.statusPreview') },
              { value: 'no_preview', label: t('autofix.statusNoPreview') },
              { value: 'outdated', label: statusFilterLabel('outdated') },
              { value: 'permanently_no_preview', label: t('autofix.statusNeedsReview') },
              { value: 'pr_opened', label: t('autofix.statusPROpened') },
            ]}
          />
        </Paper>
        </JellyCard>
      )}

      {/* Body */}
      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={24} />
        </Box>
      )}
      {isError && (
        <Alert severity="error" sx={{ borderRadius: 3 }}>
          <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
            {t('autofix.loadError')}
          </Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>
            {(error as Error)?.message ?? t('common.unknown')}
          </Typography>
        </Alert>
      )}
      {!isLoading && !isError && allFindings.length === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 10 }}>
          <Paper elevation={0} sx={{ p: 5, textAlign: 'center', maxWidth: 480, width: '100%', borderRadius: 3, border: 1, borderColor: 'divider' }}>
            <Box sx={{
              width: 72, height: 72, borderRadius: '50%', mx: 'auto', mb: 3,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: 'action.hover',
            }}>
              <Wand2 size={32} style={{ opacity: 0.3 }} />
            </Box>
            <Typography variant="h6" fontWeight={600} color="text.primary" sx={{ mb: 1 }}>
              {t('autofix.emptyTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
              {t('autofix.empty')}
            </Typography>
          </Paper>
        </Box>
      )}
      {!isLoading && !isError && allFindings.length > 0 && filtered.length === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8 }}>
          <Box sx={{
            width: 80, height: 80, borderRadius: '50%', mb: 3,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: 'action.hover',
          }}>
            <Filter size={36} style={{ opacity: 0.3 }} />
          </Box>
          <Typography variant="h6" fontWeight={600} color="text.primary" sx={{ mb: 1 }}>
            {t('autofix.noMatchTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 480, mb: 2 }}>
            {repoFilter
              ? t('autofix.noMatchRepo')
                 .replace('{repo}', repoOptions.find(r => r.id === repoFilter)?.name ?? repoFilter)
                 .replace('{count}', String(allFindings.length))
              : t('autofix.noMatch')}
          </Typography>
          {(severity || repoFilter || status) && (
            <Button
              variant="contained"
              size="small"
              onClick={() => { setSeverity(''); clearRepo(); setStatus(''); }}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {t('autofix.clearAllFilters')}
            </Button>
          )}
        </Box>
      )}

      {!isLoading && !isError && groups.length > 0 && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ px: 0.5 }}>
            {t('autofix.summaryCount')
              .replace('{count}', String(totalFindings))
              .replace('{groups}', String(groups.length))}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {groups.map((g, i) => (
              <JellyCard key={`${g.key.ruleId}|${g.key.repoId}`} delay={i * 0.04}>
                <FindingsCard
                  group={g}
                  onPreview={(id) => setPreviewFindingId(id)}
                  onFindingContext={(fp) => setSelectedFp(fp)}
                />
              </JellyCard>
            ))}
          </Box>
        </>
      )}

      {previewFindingId && orgId && (
        <AutofixPreviewModal
          orgId={orgId}
          findingId={previewFindingId}
          onClose={() => setPreviewFindingId(null)}
        />
      )}

      <UniversalFindingPanel
        fingerprint={selectedFp}
        onClose={() => setSelectedFp(null)}
      />
    </Box>
  )
}

// -- Per-(rule x repo) card --

interface FindingsCardProps {
  group: Group
  onPreview: (id: string) => void
  onFindingContext?: (fingerprint: string) => void
}

const INITIAL_VISIBLE = 5

function FindingsCard({ group, onPreview, onFindingContext }: FindingsCardProps) {
  const [showAll, setShowAll] = useState(false)
  const total = group.findings.length
  const visible = showAll ? group.findings : group.findings.slice(0, INITIAL_VISIBLE)
  const hidden = total - visible.length

  const confidence = groupConfidence(group.findings)

  return (
    <Paper elevation={0} sx={{ borderRadius: 3, border: 1, borderColor: 'divider', overflow: 'hidden' }}>
      {/* Group header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, p: 2.5, bgcolor: 'action.hover' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body1" fontWeight={600} color="text.primary">{group.key.ruleTitle}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }} color="text.secondary">{group.key.ruleId}</Typography>
            <Typography variant="body2" color="text.secondary">{group.key.repoName}</Typography>
          </Box>
        </Box>
        {confidence && <ConfidencePill level={confidence} />}
      </Box>

      {/* Table */}
      <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
        <Box component="thead">
          <Box component="tr" sx={{ borderTop: 1, borderColor: 'divider' }}>
            <Box component="th" sx={{ width: 40, p: 1.5 }}><Checkbox size="small" disabled /></Box>
            <Box component="th" sx={{ textAlign: 'left', p: 1.5 }}>
              <Typography variant="body2" fontWeight={600} color="text.secondary">
                {t('autofix.colFile')}
              </Typography>
            </Box>
            <Box component="th" sx={{ width: 100, textAlign: 'left', p: 1.5 }}>
              <Typography variant="body2" fontWeight={600} color="text.secondary">
                {t('autofix.colSeverity')}
              </Typography>
            </Box>
            <Box component="th" sx={{ width: 150, textAlign: 'left', p: 1.5 }}>
              <Typography variant="body2" fontWeight={600} color="text.secondary">
                {t('autofix.colStatus')}
              </Typography>
            </Box>
            <Box component="th" sx={{ width: 48, p: 1.5 }} />
          </Box>
        </Box>
        <Box component="tbody">
          {visible.map((f) => (
            <FindingRow
              key={f.id}
              finding={f}
              onPreview={() => onPreview(f.id)}
              onFindingContext={f.fingerprint && onFindingContext ? () => onFindingContext(f.fingerprint!) : undefined}
            />
          ))}
        </Box>
      </Box>

      {hidden > 0 && !showAll && (
        <Box
          component="button"
          onClick={() => setShowAll(true)}
          sx={{
            width: '100%', py: 1.5, border: 0, borderTop: 1, borderColor: 'divider',
            bgcolor: 'transparent', cursor: 'pointer', color: 'text.secondary',
            fontSize: '0.85rem', '&:hover': { bgcolor: 'action.hover' }, transition: 'all 0.15s',
          }}
        >
          {t('autofix.showMore').replace('{n}', String(hidden))}
        </Box>
      )}
      {showAll && total > INITIAL_VISIBLE && (
        <Box
          component="button"
          onClick={() => setShowAll(false)}
          sx={{
            width: '100%', py: 1.5, border: 0, borderTop: 1, borderColor: 'divider',
            bgcolor: 'transparent', cursor: 'pointer', color: 'text.secondary',
            fontSize: '0.85rem', '&:hover': { bgcolor: 'action.hover' }, transition: 'all 0.15s',
          }}
        >
          {t('autofix.showLess')}
        </Box>
      )}
    </Paper>
  )
}

function groupConfidence(findings: AutofixFindingRow[]): 'high' | 'medium' | 'low' | null {
  const levels = findings.map(f => f.confidence?.level).filter(Boolean) as Array<'high' | 'medium' | 'low'>
  if (levels.length === 0) return null
  if (levels.includes('low')) return 'low'
  if (levels.includes('medium')) return 'medium'
  return 'high'
}

function ConfidencePill({ level }: { level: 'high' | 'medium' | 'low' }) {
  const isHigh = level === 'high'
  const isLow = level === 'low'
  const color = isHigh ? '#22c55e' : isLow ? '#ef4444' : '#eab308'
  return (
    <Chip
      icon={<BarChart3 size={12} />}
      label={isHigh
        ? t('autofix.confidenceHigh')
        : isLow
          ? t('autofix.confidenceLow')
          : t('autofix.confidenceMedium')}
      size="small"
      variant="outlined"
      sx={{
        fontWeight: 600, fontSize: 12,
        color,
        borderColor: color,
        '& .MuiChip-icon': { color },
      }}
    />
  )
}

// extractSeverityNote pulls the "Severity downgraded: reason" marker
// our cve-bump rule appends to finding.description when the dev-only
// + local-only-exploit policy demoted the OSV severity. We render
// this inline next to the severity chip so the operator can see why
// the chip says Low when GHSA says Medium — and override if they
// disagree. Returns the reason string or null when there's nothing
// to annotate.
function extractSeverityNote(description: string | undefined): string | null {
  if (!description) return null
  // Marker shape comes from internal/autofix/rules/cve_bump.go
  // (the trailing `_Severity downgraded: ..._.` block).
  const m = description.match(/_Severity downgraded:\s*([^_]+?)\._?/i)
  if (!m) return null
  return m[1].trim()
}

// -- Single finding row --

function FindingRow({ finding, onPreview, onFindingContext }: {
  finding: AutofixFindingRow
  onPreview: () => void
  onFindingContext?: () => void
}) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const severityNote = extractSeverityNote(finding.description)
  return (
    <Box component="tr" sx={{ borderTop: 1, borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' }, transition: 'background 0.15s' }}>
      <Box component="td" sx={{ p: 1.5 }}><Checkbox size="small" /></Box>
      <Box component="td" sx={{ p: 1.5 }}>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 13 }} color="text.primary" noWrap>
          {finding.file_path || finding.title}
        </Typography>
        <Typography variant="body2" color="text.secondary">{finding.title}</Typography>
        {finding.line_number > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ display: 'block' }}>
            {t('autofix.line').replace('{n}', String(finding.line_number))}
          </Typography>
        )}
      </Box>
      <Box component="td" sx={{ p: 1.5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
          <Chip
            label={severityLabel(finding.severity)}
            size="small"
            sx={{
              fontWeight: 700, fontSize: 12,
              bgcolor: SEV_BG[finding.severity] || SEV_BG.MEDIUM,
              color: SEV_FG[finding.severity] || SEV_FG.MEDIUM,
            }}
          />
          {severityNote && (
            <Tooltip
              title={severityNote}
              placement="bottom-start"
              arrow
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'help' }}>
                <Info size={11} style={{ color: 'var(--color-text-tertiary)' }} />
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: 13, color: 'text.secondary', fontStyle: 'italic',
                    textDecoration: 'underline dotted',
                    textUnderlineOffset: 3,
                    lineHeight: 1.2,
                  }}
                >
                  {t('autofix.severityAdjusted')}
                </Typography>
              </Box>
            </Tooltip>
          )}
        </Box>
      </Box>
      <Box component="td" sx={{ p: 1.5 }}>
        <StatusPill finding={finding} onPreview={onPreview} />
      </Box>
      <Box component="td" sx={{ p: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {onFindingContext && (
            <IconButton
              size="small"
              onClick={onFindingContext}
              aria-label={t('autofix.viewContext')}
              title={t('autofix.viewContext')}
            >
              <Info size={16} />
            </IconButton>
          )}
          <IconButton
            size="small"
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            aria-label={t('common.actions')}
            title={t('common.actions')}
          >
            <MoreVertical size={16} />
          </IconButton>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            {(finding.patch_status === 'preview' || finding.patch_status === 'pr_opened') && (
              <MenuItem onClick={() => { onPreview(); setMenuAnchor(null) }}>
                <ListItemIcon><Eye size={16} /></ListItemIcon>
                <ListItemText>{t('autofix.actionViewPreview')}</ListItemText>
              </MenuItem>
            )}
            <MenuItem onClick={() => { onPreview(); setMenuAnchor(null) }}>
              <ListItemIcon><RefreshCw size={16} /></ListItemIcon>
              <ListItemText>
                {finding.patch_status === 'no_preview'
                  ? t('autofix.actionCreatePreview')
                  : t('autofix.actionRegenerate')}
              </ListItemText>
            </MenuItem>
          </Menu>
        </Box>
      </Box>
    </Box>
  )
}

function StatusPill({ finding, onPreview }: { finding: AutofixFindingRow; onPreview: () => void }) {
  const copy = autofixStatusCopy(finding)
  if (finding.patch_status === 'pr_opened' && finding.pr_url) {
    return (
      <Chip
        component="a"
        href={finding.pr_url}
        target="_blank"
        rel="noopener noreferrer"
        clickable
        icon={<GitPullRequest size={13} />}
        deleteIcon={<ExternalLink size={11} />}
        onDelete={() => {}}
        label={t('autofix.statusPRPill').replace('{n}', String(finding.pr_number ?? ''))}
        size="small"
        sx={{
          fontWeight: 600, fontSize: 13,
          bgcolor: 'rgba(167,139,250,0.12)', color: '#a78bfa',
          '& .MuiChip-icon': { color: '#a78bfa' },
          '& .MuiChip-deleteIcon': { color: '#a78bfa' },
          '&:hover': { bgcolor: 'rgba(167,139,250,0.2)' },
        }}
      />
    )
  }
  if (finding.patch_status === 'preview') {
    return (
      <Chip
        clickable
        icon={<Eye size={13} />}
        deleteIcon={<ChevronRight size={13} />}
        onDelete={onPreview}
        onClick={onPreview}
        label={t('autofix.statusViewFix')}
        size="small"
        sx={{
          fontWeight: 600, fontSize: 13,
          bgcolor: 'rgba(56,189,248,0.12)', color: '#38bdf8',
          '& .MuiChip-icon': { color: '#38bdf8' },
          '& .MuiChip-deleteIcon': { color: '#38bdf8' },
          '&:hover': { bgcolor: 'rgba(56,189,248,0.2)' },
        }}
      />
    )
  }
  if (finding.patch_status === 'outdated') {
    return (
      <Chip
        clickable
        icon={<RefreshCw size={13} />}
        onClick={onPreview}
        label={copy.label}
        size="small"
        sx={{
          fontWeight: 600, fontSize: 13,
          bgcolor: 'rgba(234,179,8,0.12)', color: '#eab308',
          '& .MuiChip-icon': { color: '#eab308' },
          '&:hover': { bgcolor: 'rgba(234,179,8,0.2)' },
        }}
      />
    )
  }
  if (finding.patch_status === 'permanently_no_preview') {
    return (
      <Chip
        clickable
        icon={<AlertTriangle size={13} />}
        onClick={onPreview}
        label={copy.label}
        size="small"
        sx={{
          fontWeight: 600, fontSize: 13,
          bgcolor: 'rgba(239,68,68,0.12)', color: '#ef4444',
          '& .MuiChip-icon': { color: '#ef4444' },
          '&:hover': { bgcolor: 'rgba(239,68,68,0.2)' },
        }}
      />
    )
  }
  return (
    <Chip
      clickable
      icon={<Wand2 size={13} />}
      deleteIcon={<ChevronRight size={13} />}
      onDelete={onPreview}
      onClick={onPreview}
      label={copy.label}
      size="small"
      sx={{
        fontWeight: 600, fontSize: 13,
        bgcolor: 'rgba(167,139,250,0.12)', color: '#a78bfa',
        '& .MuiChip-icon': { color: '#a78bfa' },
        '& .MuiChip-deleteIcon': { color: '#a78bfa' },
        '&:hover': { bgcolor: 'rgba(167,139,250,0.2)' },
      }}
    />
  )
}
