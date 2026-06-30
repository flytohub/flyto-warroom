/**
 * UnifiedAssetDrawer — one-domain × 5-dimension cross-feature view.
 *
 * Lives in flyto-engine /unified-asset endpoint. Renders Footprint
 * × CTEM × Pentest × Code × AutoFix in one panel so the operator
 * can SEE the cross-dimensional join the product is named for.
 *
 * Open by:
 *   <UnifiedAssetDrawer domain="flyto2.com" onClose={...} />
 *
 * Pure presentation; no data state of its own. Caller owns the
 * trigger (typically a click handler on a domain row).
 */
import { Drawer, Box, Typography, Chip, Stack, LinearProgress, Divider, IconButton, Alert } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { X, Globe, Bug, Target, Code as CodeIcon, Wrench, ExternalLink, ArrowRight } from 'lucide-react'
import { getUnifiedAsset } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';

interface Props {
  domain: string | null
  onClose: () => void
}

export function UnifiedAssetDrawer({ domain, onClose }: Props) {
  const { org } = useOrg()
  const open = !!domain && !!org?.id

  const { data, isLoading, error } = useQuery({
    queryKey: qk.exposure.unifiedAsset(org?.id, domain),
    queryFn: () => getUnifiedAsset(org!.id, domain!),
    enabled: open,
    staleTime: 30_000,
  })

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', md: 520 } } }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {t('unifiedAsset.title')}
          </Typography>
          <Typography sx={{ fontSize: 18, fontWeight: 700, fontFamily: 'ui-monospace, Menlo, monospace' }}>
            {domain}
          </Typography>
        </Box>
        <IconButton
          onClick={onClose}
          size="small"
          aria-label={t('common.close')}
          title={t('common.close')}
        >
          <X size={18} />
        </IconButton>
      </Box>

      {isLoading && <LinearProgress />}

      {error && (
        <Box sx={{ p: 2 }}>
          <Alert severity="error" sx={{ fontSize: 13 }}>
            {error instanceof Error ? error.message : String(error)}
          </Alert>
        </Box>
      )}

      {data && (
        <Box sx={{ p: 2, overflowY: 'auto' }}>
          {/* Cross-dim depth — the headline number */}
          <Box sx={{ mb: 3, p: 2, borderRadius: 1.5, bgcolor: 'action.hover', border: 1, borderColor: 'divider' }}>
            <Stack direction="row" alignItems="center" spacing={2}>
              <Box sx={{
                width: 48, height: 48, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: depthColor(data.summary.cross_dim_depth) + '22',
                color: depthColor(data.summary.cross_dim_depth),
                fontSize: 22, fontWeight: 800,
              }}>
                {data.summary.cross_dim_depth}/5
              </Box>
              <Box>
                <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                  {t('unifiedAsset.depthLabel')}
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                  {(data.summary.active_dimensions ?? []).join(' · ')}
                </Typography>
              </Box>
            </Stack>
            {(data.summary.lineage ?? []).length > 0 && (
              <Box sx={{ mt: 2, fontSize: 12, color: 'text.secondary' }}>
                {(data.summary.lineage ?? []).map((line, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                    <ArrowRight size={11} style={{ marginRight: 6, flexShrink: 0 }} />
                    {line}
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          <DimensionBlock
            icon={<Globe size={16} />} color="#38bdf8"
            label={t('unifiedAsset.footprint')}
            empty={data.footprint.total_entities === 0}
          >
            <Stat label={t('unifiedAsset.stat.entities')} value={data.footprint.total_entities} />
            <Stat label={t('unifiedAsset.stat.subdomains')} value={(data.footprint.subdomains ?? []).length} />
            <Stat label={t('unifiedAsset.stat.lookalikes')} value={(data.footprint.lookalikes ?? []).length} />
            <Stat label={t('unifiedAsset.stat.actionable')} value={data.footprint.actionable_count}
                  hint={data.footprint.actionable_count > 0 ? t('unifiedAsset.stat.highTierHint') : undefined}/>
          </DimensionBlock>

          <DimensionBlock
            icon={<Bug size={16} />} color="#f87171"
            label={t('unifiedAsset.ctem')}
            empty={data.ctem.open_issues === 0}
          >
            <Stat label={t('unifiedAsset.stat.openIssues')} value={data.ctem.open_issues} />
            {Object.entries(data.ctem.severities ?? {}).map(([sev, n]) => (
              <Stat key={sev} label={sev} value={n} />
            ))}
            {(data.ctem.categories ?? []).length > 0 && (
              <Box sx={{ gridColumn: '1 / -1', mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {(data.ctem.categories ?? []).slice(0, 8).map(c => (
                  <Chip key={c} size="small" label={c} sx={{ fontSize: 12, height: 20 }} />
                ))}
              </Box>
            )}
          </DimensionBlock>

          <DimensionBlock
            icon={<Target size={16} />} color="#fb923c"
            label={t('unifiedAsset.pentest')}
            empty={!data.pentest.has_project}
          >
            {data.pentest.has_project ? (
              <>
                <Stat label={t('unifiedAsset.stat.criticality')} value={data.pentest.criticality ?? '—'} />
                <Stat label={t('unifiedAsset.stat.hasFindings')} value={data.pentest.has_findings ? t('common.yes') : t('common.no')} />
                <Stat label={t('unifiedAsset.stat.lastScan')} value={data.pentest.last_scan_at?.slice(0, 10) ?? '—'} />
              </>
            ) : <EmptyHint />}
          </DimensionBlock>

          <DimensionBlock
            icon={<CodeIcon size={16} />} color="#a78bfa"
            label={t('unifiedAsset.code')}
            empty={data.code.linked_repo_count === 0}
          >
            <Stat label={t('unifiedAsset.stat.linkedRepos')} value={data.code.linked_repo_count} />
            <Stat label={t('unifiedAsset.stat.openAlerts')} value={data.code.open_alerts} />
            {(data.code.linked_repo_names ?? []).length > 0 && (
              <Box sx={{ gridColumn: '1 / -1', mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {(data.code.linked_repo_names ?? []).slice(0, 6).map(r => (
                  <Chip key={r} size="small" label={r} icon={<ExternalLink size={11}/>} sx={{ fontSize: 12, height: 20, '.MuiChip-icon': { fontSize: 12 } }} />
                ))}
              </Box>
            )}
          </DimensionBlock>

          <DimensionBlock
            icon={<Wrench size={16} />} color="#22d3ee"
            label={t('unifiedAsset.autofix')}
            empty={data.autofix.eligible_findings === 0}
          >
            <Stat label={t('unifiedAsset.stat.eligibleFindings')} value={data.autofix.eligible_findings} />
            <Stat label={t('unifiedAsset.stat.readyPatches')} value={data.autofix.ready_patches} />
            <Stat label={t('unifiedAsset.stat.openPrs')} value={data.autofix.open_prs} />
          </DimensionBlock>
        </Box>
      )}
    </Drawer>
  )
}

function depthColor(d: number): string {
  if (d >= 4) return '#22c55e'
  if (d >= 3) return '#eab308'
  if (d >= 2) return '#f97316'
  return '#94a3b8'
}

function DimensionBlock({ icon, color, label, empty, children }: {
  icon: React.ReactNode; color: string; label: string; empty: boolean; children: React.ReactNode
}) {
  return (
    <>
      <Box sx={{ mt: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Box sx={{
            width: 28, height: 28, borderRadius: 1, color,
            bgcolor: color + '22',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {icon}
          </Box>
          <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{label}</Typography>
          {empty && (
            <Chip size="small" label={t('unifiedAsset.noData')}
                  sx={{ fontSize: 12, height: 18, ml: 1, color: 'text.secondary' }} />
          )}
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, opacity: empty ? 0.4 : 1 }}>
          {children}
        </Box>
      </Box>
      <Divider sx={{ mt: 2 }} />
    </>
  )
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Box sx={{ p: 1, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{value}</Typography>
      {hint && (
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{hint}</Typography>
      )}
    </Box>
  )
}

function EmptyHint() {
  return (
    <Box sx={{ gridColumn: '1 / -1', fontSize: 12, color: 'text.secondary', py: 1, textAlign: 'center' }}>
      {t('unifiedAsset.noProjectHint')}
    </Box>
  )
}
