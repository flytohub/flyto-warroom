import { useState, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Autocomplete, Chip, TextField, CircularProgress } from '@mui/material'
import { t } from '@lib/i18n';
import {
  setRepoComplianceScope, setAssetComplianceScope,
  COMPLIANCE_SCOPE_OPTIONS, type ComplianceScopeTag,
} from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { colors, softBg } from '@/styles/designTokens'

// ComplianceScopePicker — multi-select chip input for compliance /
// regulatory scope tags on repos + attack-surface assets. The
// CTEM priority engine reads these as a (future) scope multiplier;
// for now they surface in the UI so security teams can see which
// findings touch regulated assets without leaving the picker.
//
// Two targets:
//   • target="repo"  → PATCH /code/orgs/{id}/repos/{repoId}/compliance-scope
//   • target="asset" → PATCH /code/orgs/{id}/assets/{assetId}/compliance-scope
//
// Custom (free-form) tags are accepted by the backend, capped at 8
// total per asset. Selection is debounced — we wait for blur or the
// user to actively close the menu, otherwise typing in the field
// would fire a mutation on every keystroke.

export interface ComplianceScopePickerProps {
  target: 'repo' | 'asset'
  orgId: string
  id: string
  /** Current value as raw JSON array text (matches the column shape). */
  value?: string
  readonly?: boolean
  /** Compact mode — show only the most loud tag + "+N" rather than
   *  expanding the chip row. Used inside table cells. */
  compact?: boolean
  onChanged?: (tags: ComplianceScopeTag[]) => void
}

function parseScope(json?: string): ComplianceScopeTag[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []
  } catch {
    return []
  }
}

function toneFor(tag: ComplianceScopeTag) {
  const known = COMPLIANCE_SCOPE_OPTIONS.find(o => o.value === tag)
  if (!known) return colors.semantic.neutral
  switch (known.tone) {
    case 'critical': return colors.severity.critical
    case 'warning':  return colors.semantic.warning
    case 'brand':    return colors.brand
  }
}

function labelFor(tag: ComplianceScopeTag): string {
  const known = COMPLIANCE_SCOPE_OPTIONS.find(o => o.value === tag)
  return known?.label ?? tag.toUpperCase()
}

export function ComplianceScopePicker({
  target, orgId, id, value, readonly, compact, onChanged,
}: ComplianceScopePickerProps) {
  const qc = useQueryClient()
  const initial = useMemo(() => parseScope(value), [value])
  const [draft, setDraft] = useState<ComplianceScopeTag[]>(initial)
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial])

  const mut = useMutation({
    mutationFn: (tags: ComplianceScopeTag[]) =>
      target === 'repo'
        ? setRepoComplianceScope(orgId, id, tags)
        : setAssetComplianceScope(orgId, id, tags),
    onSuccess: (_, tags) => {
      qc.invalidateQueries({ queryKey: target === 'repo' ? qk.repos.connected(orgId) : qk.attackSurface(orgId) })
      qc.invalidateQueries({ queryKey: qk.ctem.priorities(orgId) })
      onChanged?.(tags as ComplianceScopeTag[])
    },
  })

  // Compact read-only chip cluster — used inline in RepoListView
  // rows where space is tight. Click opens the full editor in a
  // popover; for now we keep this stateful component the editor
  // surface and render the chips inline either way.
  if (compact && readonly) {
    if (draft.length === 0) return null
    const [first, ...rest] = draft
    return (
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        <Chip
          size="small"
          label={labelFor(first)}
          sx={{
            height: 18, fontSize: 12, fontWeight: 700,
            bgcolor: softBg(toneFor(first), 0.16),
            color: toneFor(first),
          }}
        />
        {rest.length > 0 && (
          <Chip
            size="small"
            label={`+${rest.length}`}
            sx={{
              height: 18, fontSize: 12, fontWeight: 600,
              bgcolor: softBg(colors.semantic.neutral, 0.18),
              color: colors.semantic.neutral,
            }}
          />
        )}
      </span>
    )
  }

  return (
    <Autocomplete<ComplianceScopeTag, true, false, true>
      multiple
      freeSolo
      size="small"
      disabled={readonly || mut.isPending}
      value={draft}
      options={COMPLIANCE_SCOPE_OPTIONS.map(o => o.value)}
      getOptionLabel={(opt) => labelFor(opt as ComplianceScopeTag)}
      onChange={(_, newValue) => {
        const tags = (newValue as string[])
          .map(v => v.toLowerCase().trim())
          .filter(Boolean)
          .slice(0, 8) as ComplianceScopeTag[]
        setDraft(tags)
      }}
      onBlur={() => {
        // Fire on blur so the user can adjust the set freely before
        // we commit. Avoids a per-keystroke PATCH storm.
        if (dirty) mut.mutate(draft)
      }}
      renderTags={(value, getTagProps) =>
        value.map((tag, idx) => {
          const tagProps = getTagProps({ index: idx })
          const tone = toneFor(tag as ComplianceScopeTag)
          return (
            <Chip
              {...tagProps}
              key={tag}
              size="small"
              label={labelFor(tag as ComplianceScopeTag)}
              sx={{
                height: 20, fontSize: 12, fontWeight: 700,
                bgcolor: softBg(tone, 0.18),
                color: tone,
                '& .MuiChip-deleteIcon': { color: tone, opacity: 0.6, '&:hover': { opacity: 1 } },
              }}
            />
          )
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={draft.length === 0
            ? t('scope.placeholder')
            : ''}
          variant="outlined"
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {mut.isPending ? <CircularProgress size={12} sx={{ mr: 1 }} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              minHeight: 32,
              fontSize: 12,
              padding: '2px 6px !important',
            },
          }}
        />
      )}
      sx={{ minWidth: 180, maxWidth: 320 }}
    />
  )
}
