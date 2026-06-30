/**
 * RunDialog — Footprint expansion run launcher.
 *
 * Extracted from FootprintGraphView.tsx 2026-05-23. The compound
 * was 3500 lines; this dialog handles the entire run-config UX:
 *  - org + primary domain seed
 *  - alias / brand-name / negative-keyword inputs
 *  - industry preset
 *  - threat-seed suggestion fetch + chips
 *  - submit + close
 *
 * Pure presentation + form state — owns no global queries; the
 * parent mutation handles the actual API call via onRun().
 */
import { useEffect, useState } from 'react'
import {
  Box, Stack, Typography, Chip,
  Paper, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, LinearProgress,
} from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown, ChevronRight, Play, FileText, Ban, Briefcase,
  Network as NetworkIcon, Building2, Globe, SlidersHorizontal, Tags,
} from 'lucide-react'
import { getThreatSeedSuggestions } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n';

export interface RunDialogProps {
  open: boolean
  onClose: () => void
  orgId: string
  defaultOrgName: string
  defaultDomain: string
  onRun: (profile: {
    orgName: string
    domain: string
    candidateAliases: string[]
    negativeKeywords: string[]
    brandNames: string[]
    englishName?: string
    industry?: string
  }) => void
  isRunning: boolean
}

export function RunDialog({ open, onClose, orgId, defaultOrgName, defaultDomain, onRun, isRunning }: RunDialogProps) {
  const [orgName, setOrgName] = useState(defaultOrgName)
  const [domain, setDomain] = useState(defaultDomain)
  const [advanced, setAdvanced] = useState(false)
  const [candidateAliasesText, setCandidateAliasesText] = useState('')
  const [negativeKeywordsText, setNegativeKeywordsText] = useState('')
  const [brandNamesText, setBrandNamesText] = useState('')
  const [englishName, setEnglishName] = useState('')
  const [industry, setIndustry] = useState('')

  useEffect(() => {
    if (!open) return
    setOrgName(defaultOrgName)
    setDomain(defaultDomain)
  }, [open, defaultOrgName, defaultDomain])

  const canRun = (orgName.trim() !== '' || domain.trim() !== '') && !isRunning
  const splitList = (s: string) => s.split(/[,，\n]/).map(x => x.trim()).filter(Boolean)

  // Threat-seed suggestions — Phase 1 (email_domain / telegram_leak)
  // → Phase 2 hint. The CTEM threat intel that the operator
  // already collected becomes one-click candidate aliases for
  // Footprint expansion. Only fires when Advanced is expanded.
  const threatSeedQ = useQuery({
    queryKey: qk.footprint.threatSeed(orgId),
    queryFn: () => getThreatSeedSuggestions(orgId),
    enabled: open && advanced,
    staleTime: 60_000,
  })
  const addAliasFromSuggestion = (alias: string) => {
    const existing = splitList(candidateAliasesText)
    if (existing.includes(alias)) return
    setCandidateAliasesText([...existing, alias].join(', '))
  }
  const aliasChips = splitList(candidateAliasesText)
  const brandChips = splitList(brandNamesText)
  const negChips = splitList(negativeKeywordsText)

  // Suggestion: when the seed domain looks like flyto2.com and no
  // aliases set, hint that flytohub / warroom are good starters.
  // Real value: most operators have ONE alias in mind they want to
  // add — surface that thought immediately rather than buried in
  // helper text.
  const applyPresetIndustry = (val: string) => setIndustry(val)

  // Industry presets — three options the classifier rule pack
  // supports directly. Pill row instead of free-text — operators
  // get the right value without guessing the casing.
  const industryPresets = ['finance', 'saas', 'ecommerce']

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}
    >
      {/* Header — icon + title + subtitle as one cohesive block. */}
      <DialogTitle sx={{ pb: 1.5, pt: 2.5, px: 3 }}>
        <Stack direction="row" alignItems="flex-start" spacing={1.5}>
          <Box sx={{
            width: 40, height: 40, borderRadius: 1.5,
            bgcolor: 'primary.main', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <NetworkIcon size={20} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>
              {t('footprint.run.title')}
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5, lineHeight: 1.5 }}>
              {t('footprint.run.subtitle')}
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ px: 3, pt: 1 }}>
        <Stack spacing={2.5}>
          {/* Section: Seed */}
          <Box>
            <Typography sx={{
              fontSize: 12, fontWeight: 700, color: 'text.secondary',
              textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1.25,
            }}>
              {t('footprint.run.section.seed')}
            </Typography>
            <Stack direction="row" spacing={2}>
              <TextField
                label={t('footprint.run.orgName')}
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                placeholder={t('footprint.run.placeholder.orgName')}
                fullWidth
                disabled={isRunning}
                InputProps={{
                  startAdornment: (
                    <Box sx={{ display: 'flex', mr: 1, color: 'text.secondary' }}>
                      <Building2 size={16} />
                    </Box>
                  ),
                }}
              />
              <TextField
                label={t('footprint.run.domain')}
                value={domain}
                onChange={e => setDomain(e.target.value)}
                placeholder="flyto2.com"
                fullWidth
                disabled={isRunning}
                InputProps={{
                  startAdornment: (
                    <Box sx={{ display: 'flex', mr: 1, color: 'text.secondary' }}>
                      <Globe size={16} />
                    </Box>
                  ),
                }}
              />
            </Stack>
          </Box>

          {/* Advanced toggle — full-width clickable card. Not buried. */}
          <Paper
            variant="outlined"
            onClick={() => {
              if (!isRunning) setAdvanced(v => !v)
            }}
            sx={{
              p: 1.5,
              borderRadius: 1.5,
              cursor: isRunning ? 'default' : 'pointer',
              borderColor: advanced ? 'primary.main' : 'divider',
              bgcolor: advanced ? 'action.hover' : 'background.paper',
              transition: 'all 160ms ease',
              '&:hover': isRunning ? {} : {
                borderColor: 'primary.main',
                bgcolor: 'action.hover',
              },
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Box sx={{
                width: 36, height: 36, borderRadius: 1,
                bgcolor: advanced ? 'primary.main' : 'action.hover',
                color: advanced ? '#fff' : 'text.secondary',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <SlidersHorizontal size={18} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                  {t('footprint.run.advancedTitle')}
                </Typography>
                <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.25 }}>
                  {t('footprint.run.advancedHint')}
                </Typography>
              </Box>
              <Box sx={{ color: 'text.secondary' }}>
                {advanced ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </Box>
            </Stack>
          </Paper>

          {/* Advanced fields */}
          {advanced && (
            <Stack spacing={2.5} sx={{ pl: 0.5 }}>
              {/* Candidate aliases — the most-important field, shown first */}
              <Box>
                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
                  <Tags size={14} color="#a78bfa" />
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                    {t('footprint.run.candidateAliases')}
                  </Typography>
                  <Chip
                    size="small"
                    label={t('footprint.run.recommended')}
                    sx={{ fontSize: 12, height: 18, bgcolor: 'primary.main', color: '#fff' }}
                  />
                </Stack>
                <TextField
                  value={candidateAliasesText}
                  onChange={e => setCandidateAliasesText(e.target.value)}
                  placeholder="flytohub, warroom, FLY2"
                  fullWidth
                  multiline
                  minRows={2}
                  disabled={isRunning}
                />
                <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.75, lineHeight: 1.5 }}>
                  {t('footprint.run.candidateAliases.help')}
                </Typography>
                {aliasChips.length > 0 && (
                  <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.75 }}>
                    {aliasChips.map(a => (
                      <Chip key={a} size="small" label={a}
                        sx={{ fontSize: 12, bgcolor: 'primary.main', color: '#fff' }} />
                    ))}
                  </Stack>
                )}
                {threatSeedQ.data && threatSeedQ.data.suggestions.length > 0 && (
                  <Box sx={{
                    mt: 1.5, p: 1.25, borderRadius: 1.5,
                    bgcolor: 'action.hover', border: 1, borderColor: 'divider',
                  }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 0.75, color: 'text.secondary' }}>
                      {t('footprint.run.suggested')}
                    </Typography>
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                      {threatSeedQ.data.suggestions.map(s => (
                        <Chip
                          key={s.value}
                          size="small"
                          label={s.value}
                          onClick={() => addAliasFromSuggestion(s.value)}
                          title={s.rationale}
                          sx={{
                            fontSize: 12, cursor: 'pointer',
                            '&:hover': { bgcolor: 'primary.main', color: '#fff' },
                          }}
                        />
                      ))}
                    </Stack>
                  </Box>
                )}
              </Box>

              {/* Brand names */}
              <Box>
                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
                  <Building2 size={14} color="#3b82f6" />
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                    {t('footprint.run.brandNames')}
                  </Typography>
                </Stack>
                <TextField
                  value={brandNamesText}
                  onChange={e => setBrandNamesText(e.target.value)}
                  placeholder={t('footprint.run.placeholder.brandNames')}
                  fullWidth
                  disabled={isRunning}
                />
                <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.75, lineHeight: 1.5 }}>
                  {t('footprint.run.brandNames.help')}
                </Typography>
                {brandChips.length > 0 && (
                  <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.75 }}>
                    {brandChips.map(a => (
                      <Chip key={a} size="small" label={a}
                        sx={{ fontSize: 12, bgcolor: '#3b82f6', color: '#fff' }} />
                    ))}
                  </Stack>
                )}
              </Box>

              {/* English / legal name */}
              <Box>
                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
                  <FileText size={14} color="#94a3b8" />
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                    {t('footprint.run.englishName')}
                  </Typography>
                </Stack>
                <TextField
                  value={englishName}
                  onChange={e => setEnglishName(e.target.value)}
                  placeholder={t('footprint.run.placeholder.englishName')}
                  fullWidth
                  disabled={isRunning}
                />
              </Box>

              {/* Negative keywords */}
              <Box>
                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
                  <Ban size={14} color="#ef4444" />
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                    {t('footprint.run.negativeKeywords')}
                  </Typography>
                </Stack>
                <TextField
                  value={negativeKeywordsText}
                  onChange={e => setNegativeKeywordsText(e.target.value)}
                  placeholder="travel, airline, school"
                  fullWidth
                  multiline
                  minRows={2}
                  disabled={isRunning}
                />
                <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.75, lineHeight: 1.5 }}>
                  {t('footprint.run.negativeKeywords.help')}
                </Typography>
                {negChips.length > 0 && (
                  <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.75 }}>
                    {negChips.map(a => (
                      <Chip key={a} size="small" label={a}
                        sx={{ fontSize: 12, bgcolor: '#ef4444', color: '#fff' }} />
                    ))}
                  </Stack>
                )}
              </Box>

              {/* Industry — preset pill row */}
              <Box>
                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
                  <Briefcase size={14} color="#f59e0b" />
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                    {t('footprint.run.industry')}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1}>
                  {industryPresets.map(p => (
                    <Chip
                      key={p}
                      label={p}
                      onClick={() => applyPresetIndustry(industry === p ? '' : p)}
                      sx={{
                        fontSize: 14, fontWeight: 500, cursor: 'pointer',
                        bgcolor: industry === p ? 'primary.main' : 'action.hover',
                        color: industry === p ? '#fff' : 'text.primary',
                        '&:hover': {
                          bgcolor: industry === p ? 'primary.dark' : 'action.selected',
                        },
                      }}
                    />
                  ))}
                </Stack>
                <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.75, lineHeight: 1.5 }}>
                  {t('footprint.run.industry.help')}
                </Typography>
              </Box>
            </Stack>
          )}

          {isRunning && <LinearProgress />}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5 }}>
        <Button onClick={onClose} disabled={isRunning} sx={{ fontSize: 14 }}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="contained"
          size="large"
          onClick={() => onRun({
            orgName: orgName.trim(),
            domain: domain.trim(),
            candidateAliases: splitList(candidateAliasesText),
            negativeKeywords: splitList(negativeKeywordsText),
            brandNames: splitList(brandNamesText),
            englishName: englishName.trim() || undefined,
            industry: industry.trim() || undefined,
          })}
          disabled={!canRun}
          startIcon={<Play size={18} />}
          sx={{ fontSize: 14, fontWeight: 600, px: 3 }}
        >
          {isRunning ? t('footprint.run.running') : t('footprint.run.cta')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
