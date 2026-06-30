import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, ToggleButton, ToggleButtonGroup, Box, Alert,
} from '@mui/material'
import { ClipboardList } from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import {
  updateVendor, assessVendor,
  parseQuestionnaire, parseResponses,
  type VendorAssessment,
} from '@lib/engine'
import { colors, softBg } from '@/styles/designTokens'

// VendorQuestionnaireDialog — fills the yes/no questionnaire for a
// vendor and triggers a re-assessment. The engine owns the template;
// responses are sent as a JSON blob keyed by question id.

export interface VendorQuestionnaireDialogProps {
  open: boolean
  vendor: VendorAssessment
  onClose: () => void
  onSaved: () => void
}

export function VendorQuestionnaireDialog({
  open, vendor, onClose, onSaved,
}: VendorQuestionnaireDialogProps) {
  const { enqueueSnackbar } = useSnackbar()
  const questionnaire = useMemo(() => parseQuestionnaire(vendor.questionnaire), [vendor.questionnaire])
  const [responses, setResponses] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setResponses(parseResponses(vendor.responses))
    }
  }, [open, vendor.responses])

  const saveAndAssessMut = useMutation({
    mutationFn: async () => {
      await updateVendor(vendor.id, { responses: JSON.stringify(responses) })
      return assessVendor(vendor.id)
    },
    onSuccess: (updated) => {
      enqueueSnackbar(
        tOr('vendors.assessSuccessLevel', `Assessment complete — risk level: ${updated.risk_level}`),
        { variant: 'success' },
      )
      onSaved()
      onClose()
    },
    onError: (e: Error) => {
      enqueueSnackbar(e.message || t('vendors.assessFailed'), { variant: 'error' })
    },
  })

  const totalQuestions = useMemo(() => {
    if (!questionnaire) return 0
    return questionnaire.sections.reduce((acc, s) => acc + s.questions.length, 0)
  }, [questionnaire])

  const answered = Object.keys(responses).filter((k) => responses[k] === 'yes' || responses[k] === 'no').length

  if (!questionnaire) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>{t('vendors.questionnaireTitle')}</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            {t('vendors.questionnaireParseFailed')}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ClipboardList size={20} style={{ color: colors.tech }} />
          {t('vendors.questionnaireTitle')}
          <Box sx={{ ml: 'auto', fontSize: 13, color: 'text.secondary' }}>
            {vendor.vendor_name}
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }} variant="outlined">
          {t('vendors.questionnaireHelp')}
        </Alert>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, fontSize: 13 }}>
          <Box sx={{ color: 'text.secondary' }}>
            {t('vendors.progress')}
          </Box>
          <Box sx={{ fontFamily: 'monospace' }}>
            {answered} / {totalQuestions}
          </Box>
        </Box>
        {questionnaire.sections.map((section) => (
          <Box key={section.title} sx={{ mb: 3 }}>
            <Box sx={{
              fontSize: 13,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: 'text.secondary',
              mb: 1,
              pb: 0.75,
              borderBottom: `1px solid ${softBg(colors.semantic.neutral, 0.15)}`,
            }}>
              {section.title}
            </Box>
            {section.questions.map((q) => (
              <Box
                key={q.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 2,
                  alignItems: 'center',
                  py: 1,
                  borderBottom: `1px solid ${softBg(colors.semantic.neutral, 0.06)}`,
                }}
              >
                <Box sx={{ fontSize: 14 }}>
                  {q.text}
                  <Box component="span" sx={{ ml: 1, fontSize: 13, color: 'text.secondary' }}>
                    (weight {q.weight})
                  </Box>
                </Box>
                <ToggleButtonGroup
                  size="small"
                  value={responses[q.id] ?? null}
                  exclusive
                  onChange={(_, val) => {
                    if (val === null) {
                      const next = { ...responses }
                      delete next[q.id]
                      setResponses(next)
                    } else {
                      setResponses({ ...responses, [q.id]: val })
                    }
                  }}
                >
                  <ToggleButton value="yes" sx={{ minWidth: 60 }}>
                    {t('common.yes')}
                  </ToggleButton>
                  <ToggleButton value="no" sx={{ minWidth: 60 }}>
                    {t('common.no')}
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
            ))}
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saveAndAssessMut.isPending}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="contained"
          disabled={saveAndAssessMut.isPending}
          onClick={() => saveAndAssessMut.mutate()}
        >
          {saveAndAssessMut.isPending
            ? t('vendors.assessing')
            : t('vendors.saveAndAssess')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
