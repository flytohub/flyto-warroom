import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import {
  Chip, Alert, Button, IconButton, Tooltip, Box,
} from '@mui/material'
import {
  Building2, Plus, Trash2, RefreshCw, AlertTriangle, ShieldCheck,
  TrendingUp, Globe2, FileText,
} from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import {
  listVendors, getVendorRiskSummary, deleteVendor, assessVendor,
  type VendorAssessment, type VendorRiskLevel, type VendorCategory,
} from '@lib/engine'
import { colors, softBg } from '@/styles/designTokens'
import { SkeletonRows } from '@atoms/Skeleton'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { JellyCard } from '@atoms/JellyCard'
import { VendorFormDialog } from './VendorFormDialog'
import { VendorQuestionnaireDialog } from './VendorQuestionnaireDialog'

// VendorRiskView — third-party vendor risk assessment.
//
// Scoring blends external_score (pulled from attack-surface, 60%)
// and questionnaire_score (operator-filled, 40%). Vendors without
// a domain or attack-surface match get questionnaire-only scoring;
// vendors without a filled questionnaire get external-only.
//
// Lives under Exposure section because vendor risk surfaces are
// part of the org's external posture — a compromised analytics
// vendor's tracker on the marketing site is exposure, not code.

export interface VendorRiskViewProps {
  orgId: string
}

const RISK_TONE: Record<VendorRiskLevel, { color: string; label: string }> = {
  critical: { color: colors.severity.critical, label: 'Critical' },
  high:     { color: colors.severity.high,     label: 'High' },
  medium:   { color: colors.severity.medium,   label: 'Medium' },
  low:      { color: colors.severity.low,      label: 'Low' },
  unknown:  { color: colors.semantic.neutral,  label: t('darkweb.notAssessed') },
}

const CRITICALITY_TONE: Record<string, { color: string; label: string }> = {
  critical: { color: colors.severity.critical, label: 'Critical' },
  high:     { color: colors.severity.high,     label: 'High' },
  medium:   { color: colors.severity.medium,   label: 'Medium' },
  low:      { color: colors.severity.low,      label: 'Low' },
}

const CATEGORY_LABEL: Record<VendorCategory, string> = {
  cdn: 'CDN',
  hosting: 'Hosting',
  analytics: 'Analytics',
  payment: 'Payment',
  saas: 'SaaS',
  other: 'Other',
}

function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return '—'
  return String(score)
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return t('vendors.neverAssessed')
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const diffMs = Date.now() - d.getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days < 1) return t('vendors.today')
  if (days < 30) return `${days}d`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}

export function VendorRiskView({ orgId }: VendorRiskViewProps) {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<VendorAssessment | null>(null)
  const [questionnaireFor, setQuestionnaireFor] = useState<VendorAssessment | null>(null)

  const vendorsQ = useQuery({
    queryKey: qk.ctem.vendors(orgId),
    queryFn: () => listVendors(orgId),
    enabled: !!orgId,
    staleTime: 30_000,
  })

  const summaryQ = useQuery({
    queryKey: qk.ctem.vendorRiskSummary(orgId),
    queryFn: () => getVendorRiskSummary(orgId),
    enabled: !!orgId,
    staleTime: 30_000,
  })

  const invalidateVendorRisk = () => {
    qc.invalidateQueries({ queryKey: qk.ctem.vendors(orgId) })
    qc.invalidateQueries({ queryKey: qk.ctem.vendorRiskSummary(orgId) })
  }

  const assessMut = useMutation({
    mutationFn: (vendorId: string) => assessVendor(vendorId),
    onSuccess: () => {
      enqueueSnackbar(t('vendors.assessSuccess'), { variant: 'success' })
      invalidateVendorRisk()
    },
    onError: (e: Error) => {
      enqueueSnackbar(e.message || t('vendors.assessFailed'), { variant: 'error' })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (vendorId: string) => deleteVendor(vendorId),
    onSuccess: () => {
      enqueueSnackbar(t('vendors.deleteSuccess'), { variant: 'success' })
      invalidateVendorRisk()
    },
    onError: (e: Error) => {
      enqueueSnackbar(e.message || t('vendors.deleteFailed'), { variant: 'error' })
    },
  })

  const summary = summaryQ.data
  const vendors = vendorsQ.data ?? []

  const sortedVendors = useMemo(() => {
    const riskOrder: Record<VendorRiskLevel, number> = {
      critical: 0, high: 1, medium: 2, low: 3, unknown: 4,
    }
    return [...vendors].sort((a, b) => {
      const ra = riskOrder[a.risk_level] ?? 5
      const rb = riskOrder[b.risk_level] ?? 5
      if (ra !== rb) return ra - rb
      return a.vendor_name.localeCompare(b.vendor_name)
    })
  }, [vendors])

  if (vendorsQ.isLoading || summaryQ.isLoading) {
    return <Box sx={{ p: 3 }}><SkeletonRows rows={6} /></Box>
  }

  if (vendorsQ.isError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          {t('vendors.loadFailed')}
        </Alert>
      </Box>
    )
  }

  return (
    // Outer scroll/height wrapper kept as <Box sx={...}> — the
    // workspace's custom scrollbar styling targets MUI Box and the
    // user explicitly likes that scrollbar; don't swap to a bare div.
    <Box sx={{ height: '100%', overflowY: 'auto', p: 3 }}>
      {/* Thin section-accent left rail — mirrors the manager view's
          colors.semantic.info accent so toggling modes feels like the
          same page. Hue-only; surfaces stay on the theme palette. */}
      <Box sx={{ borderLeft: `3px solid ${colors.semantic.info}`, pl: 2, mb: 3 }}>
        <FlytoPageHeader
          title={t('vendors.title')}
          subtitle={t('vendors.subtitle')}
          action={
            <Button
              variant="contained"
              size="small"
              startIcon={<Plus size={14} />}
              onClick={() => setCreateOpen(true)}
              sx={{ bgcolor: colors.semantic.info, '&:hover': { bgcolor: colors.semantic.info } }}
            >
              {t('vendors.addVendor')}
            </Button>
          }
          bottomGap={0}
        />
      </Box>

      {/* Summary tiles */}
      {summary && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
          <JellyCard delay={0}><SummaryTile
            icon={<Building2 size={16} />}
            label={t('vendors.totalVendors')}
            value={String(summary.total_vendors)}
            color={colors.tech}
          /></JellyCard>
          <JellyCard delay={0.04}><SummaryTile
            icon={<ShieldCheck size={16} />}
            label={t('vendors.assessed')}
            value={`${summary.assessed} / ${summary.total_vendors}`}
            color={colors.semantic.success}
          /></JellyCard>
          <JellyCard delay={0.08}><SummaryTile
            icon={<TrendingUp size={16} />}
            label={t('vendors.avgScore')}
            value={summary.avg_score > 0 ? String(summary.avg_score) : '—'}
            color={colors.brand}
          /></JellyCard>
          <JellyCard delay={0.12}><SummaryTile
            icon={<AlertTriangle size={16} />}
            label={t('vendors.topRisks')}
            value={String(summary.top_risks?.length ?? 0)}
            color={colors.severity.critical}
          /></JellyCard>
        </Box>
      )}

      {/* Risk breakdown bar */}
      {summary && summary.total_vendors > 0 && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ fontSize: 12, color: 'text.secondary', mb: 1 }}>
            {t('vendors.byRisk')}
          </Box>
          <Box sx={{
            display: 'flex',
            height: 28,
            borderRadius: 1,
            overflow: 'hidden',
            backgroundColor: softBg(colors.semantic.neutral, 0.06),
          }}>
            {(['critical', 'high', 'medium', 'low', 'unknown'] as const).map((level) => {
              const count = summary.by_risk?.[level] ?? 0
              if (!count) return null
              const pct = (count / summary.total_vendors) * 100
              return (
                <Tooltip key={level} title={`${tOr(`vendors.riskTone.${level}`, RISK_TONE[level].label)}: ${count}`}>
                  <Box sx={{
                    width: `${pct}%`,
                    backgroundColor: RISK_TONE[level].color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                  }}>
                    {pct > 6 ? count : ''}
                  </Box>
                </Tooltip>
              )
            })}
          </Box>
        </Box>
      )}

      {/* Vendor list */}
      {vendors.length === 0 ? (
        <Box sx={{
          p: 4,
          textAlign: 'center',
          backgroundColor: softBg(colors.semantic.neutral, 0.04),
          borderRadius: 1,
          border: `1px dashed ${softBg(colors.semantic.neutral, 0.2)}`,
        }}>
          <Building2 size={28} style={{ color: colors.semantic.neutral, opacity: 0.5 }} />
          <Box sx={{ mt: 1.5, fontSize: 14, fontWeight: 500 }}>
            {t('vendors.emptyTitle')}
          </Box>
          <Box sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }}>
            {t('vendors.emptyDesc')}
          </Box>
        </Box>
      ) : (
        <Box sx={{
          borderRadius: 1,
          border: `1px solid ${softBg(colors.semantic.neutral, 0.15)}`,
          overflow: 'hidden',
        }}>
          {/* Table header */}
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: '2fr 1.5fr 100px 100px 100px 120px 80px 140px',
            gap: 1.5,
            px: 2,
            py: 1,
            backgroundColor: softBg(colors.semantic.neutral, 0.06),
            fontSize: 13,
            fontWeight: 600,
            textTransform: 'uppercase',
            color: 'text.secondary',
            letterSpacing: 0.5,
          }}>
            <Box>{t('vendors.colName')}</Box>
            <Box>{t('vendors.colDomain')}</Box>
            <Box>{t('vendors.colCategory')}</Box>
            <Box>{t('vendors.colCriticality')}</Box>
            <Box>{t('vendors.colRisk')}</Box>
            <Box>{t('vendors.colScore')}</Box>
            <Box>{t('vendors.colAge')}</Box>
            <Box sx={{ textAlign: 'right' }}>{t('vendors.colActions')}</Box>
          </Box>
          {sortedVendors.map((v) => {
            const risk = RISK_TONE[v.risk_level] ?? RISK_TONE.unknown
            const crit = CRITICALITY_TONE[v.criticality] ?? CRITICALITY_TONE.medium
            const assessLoading = assessMut.isPending && assessMut.variables === v.id
            const deleteLoading = deleteMut.isPending && deleteMut.variables === v.id
            return (
              <Box key={v.id} sx={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.5fr 100px 100px 100px 120px 80px 140px',
                gap: 1.5,
                px: 2,
                py: 1.25,
                borderTop: `1px solid ${softBg(colors.semantic.neutral, 0.08)}`,
                alignItems: 'center',
                fontSize: 13,
                '&:hover': { backgroundColor: softBg(colors.semantic.neutral, 0.04) },
              }}>
                <Box sx={{ fontWeight: 500 }}>
                  {v.vendor_name}
                  {v.notes && (
                    <Tooltip title={v.notes}>
                      <FileText
                        size={12}
                        style={{
                          color: colors.semantic.neutral,
                          opacity: 0.6,
                          marginLeft: 6,
                          verticalAlign: 'middle',
                        }}
                      />
                    </Tooltip>
                  )}
                </Box>
                <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {v.vendor_domain ? (
                    <>
                      <Globe2 size={12} />
                      {v.vendor_domain}
                    </>
                  ) : (
                    <span style={{ opacity: 0.5 }}>—</span>
                  )}
                </Box>
                <Box>
                  <Chip
                    size="small"
                    label={CATEGORY_LABEL[v.category] ?? v.category}
                    sx={{
                      backgroundColor: softBg(colors.tech, 0.12),
                      color: colors.tech,
                      fontSize: 13,
                      height: 22,
                    }}
                  />
                </Box>
                <Box>
                  <Chip
                    size="small"
                    label={tOr(`common.${v.criticality}`, crit.label)}
                    sx={{
                      backgroundColor: softBg(crit.color, 0.12),
                      color: crit.color,
                      fontSize: 13,
                      height: 22,
                    }}
                  />
                </Box>
                <Box>
                  <Chip
                    size="small"
                    label={tOr(`vendors.riskTone.${v.risk_level}`, risk.label)}
                    sx={{
                      backgroundColor: softBg(risk.color, 0.15),
                      color: risk.color,
                      fontSize: 13,
                      height: 22,
                      fontWeight: 600,
                    }}
                  />
                </Box>
                <Box sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {formatScore(v.combined_score)}
                  {v.external_score !== null && v.questionnaire_score !== null && (
                    <Box component="span" sx={{ ml: 0.5, color: 'text.secondary', fontSize: 13 }}>
                      (E{v.external_score} / Q{v.questionnaire_score})
                    </Box>
                  )}
                </Box>
                <Box sx={{ fontSize: 12, color: 'text.secondary' }}>
                  {formatTimestamp(v.last_assessed_at)}
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                  <Tooltip title={t('vendors.editQuestionnaire')}>
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => setQuestionnaireFor(v)}
                        aria-label={t('vendors.editQuestionnaire')}
                        title={t('vendors.editQuestionnaire')}
                      >
                        <FileText size={14} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title={t('vendors.reassess')}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={assessLoading}
                        onClick={() => assessMut.mutate(v.id)}
                        aria-label={t('vendors.reassess')}
                        title={t('vendors.reassess')}
                      >
                        <RefreshCw size={14} className={assessLoading ? 'flyto-spin' : ''} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title={t('vendors.edit')}>
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => setEditing(v)}
                        aria-label={t('vendors.edit')}
                        title={t('vendors.edit')}
                      >
                        <Building2 size={14} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title={t('common.delete')}>
                    <span>
                      <IconButton
                        size="small"
                        color="error"
                        disabled={deleteLoading}
                        aria-label={t('common.delete')}
                        title={t('common.delete')}
                        onClick={() => {
                          if (window.confirm(tOr('vendors.deleteConfirm', `Delete vendor "${v.vendor_name}"?`))) {
                            deleteMut.mutate(v.id)
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              </Box>
            )
          })}
        </Box>
      )}

      <VendorFormDialog
        open={createOpen || !!editing}
        orgId={orgId}
        vendor={editing}
        onClose={() => {
          setCreateOpen(false)
          setEditing(null)
        }}
        onSaved={invalidateVendorRisk}
      />

      {questionnaireFor && (
        <VendorQuestionnaireDialog
          vendor={questionnaireFor}
          open={!!questionnaireFor}
          onClose={() => setQuestionnaireFor(null)}
          onSaved={invalidateVendorRisk}
        />
      )}
    </Box>
  )
}

function SummaryTile({
  icon, label, value, color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <Box sx={{
      p: 2,
      borderRadius: 1,
      backgroundColor: softBg(color, 0.06),
      border: `1px solid ${softBg(color, 0.15)}`,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color, mb: 0.5 }}>
        {icon}
        <Box sx={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </Box>
      </Box>
      <Box sx={{ fontSize: 22, fontWeight: 600 }}>{value}</Box>
    </Box>
  )
}
