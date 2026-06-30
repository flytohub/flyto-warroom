import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Box,
} from '@mui/material'
import { t, tOr } from '@lib/i18n';
import {
  createVendor, updateVendor,
  type VendorAssessment, type VendorCategory, type VendorCriticality,
} from '@lib/engine'

// VendorFormDialog — create or edit a vendor assessment record.
// The questionnaire responses are filled in a separate dialog
// (VendorQuestionnaireDialog) to keep this form short and focused
// on the identification + classification fields.

export interface VendorFormDialogProps {
  open: boolean
  orgId: string
  vendor: VendorAssessment | null
  onClose: () => void
  onSaved: () => void
}

const CATEGORY_OPTIONS: { value: VendorCategory; label: string }[] = [
  { value: 'cdn',       label: 'CDN' },
  { value: 'hosting',   label: 'Hosting' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'payment',   label: 'Payment' },
  { value: 'saas',      label: 'SaaS' },
  { value: 'other',     label: 'Other' },
]

const CRITICALITY_OPTIONS: { value: VendorCriticality; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high',     label: 'High' },
  { value: 'medium',   label: 'Medium' },
  { value: 'low',      label: 'Low' },
]

export function VendorFormDialog({
  open, orgId, vendor, onClose, onSaved,
}: VendorFormDialogProps) {
  const { enqueueSnackbar } = useSnackbar()
  const editing = !!vendor

  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [category, setCategory] = useState<VendorCategory>('other')
  const [criticality, setCriticality] = useState<VendorCriticality>('medium')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (open) {
      setName(vendor?.vendor_name ?? '')
      setDomain(vendor?.vendor_domain ?? '')
      setCategory((vendor?.category as VendorCategory) ?? 'other')
      setCriticality((vendor?.criticality as VendorCriticality) ?? 'medium')
      setNotes(vendor?.notes ?? '')
    }
  }, [open, vendor])

  const createMut = useMutation({
    mutationFn: () => createVendor(orgId, {
      vendor_name: name.trim(),
      vendor_domain: domain.trim() || undefined,
      category,
      criticality,
      notes: notes.trim() || undefined,
    }),
    onSuccess: () => {
      enqueueSnackbar(t('vendors.createSuccess'), { variant: 'success' })
      onSaved()
      onClose()
    },
    onError: (e: Error) => {
      enqueueSnackbar(e.message || t('vendors.createFailed'), { variant: 'error' })
    },
  })

  const updateMut = useMutation({
    mutationFn: () => updateVendor(vendor!.id, {
      vendor_name: name.trim(),
      vendor_domain: domain.trim(),
      category,
      criticality,
      notes,
    }),
    onSuccess: () => {
      enqueueSnackbar(t('vendors.updateSuccess'), { variant: 'success' })
      onSaved()
      onClose()
    },
    onError: (e: Error) => {
      enqueueSnackbar(e.message || t('vendors.updateFailed'), { variant: 'error' })
    },
  })

  const submitting = createMut.isPending || updateMut.isPending
  const canSubmit = name.trim().length > 0 && !submitting

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {editing
          ? t('vendors.editTitle')
          : t('vendors.createTitle')}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label={t('vendors.fieldName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
            size="small"
            autoFocus
            inputProps={{ maxLength: 200 }}
            helperText={t('vendors.fieldNameHelp')}
          />
          <TextField
            label={t('vendors.fieldDomain')}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            fullWidth
            size="small"
            placeholder="vendor.example.com"
            helperText={t('vendors.fieldDomainHelp')}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              select
              label={t('vendors.fieldCategory')}
              value={category}
              onChange={(e) => setCategory(e.target.value as VendorCategory)}
              fullWidth
              size="small"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{tOr(`vendors.category.${opt.value}`, opt.label)}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label={t('vendors.fieldCriticality')}
              value={criticality}
              onChange={(e) => setCriticality(e.target.value as VendorCriticality)}
              fullWidth
              size="small"
            >
              {CRITICALITY_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{tOr(`common.${opt.value}`, opt.label)}</MenuItem>
              ))}
            </TextField>
          </Box>
          <TextField
            label={t('vendors.fieldNotes')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
            multiline
            rows={3}
            size="small"
            placeholder={t('vendors.fieldNotesPlaceholder')}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="contained"
          disabled={!canSubmit}
          onClick={() => (editing ? updateMut.mutate() : createMut.mutate())}
        >
          {editing
            ? t('common.save')
            : t('vendors.createButton')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
