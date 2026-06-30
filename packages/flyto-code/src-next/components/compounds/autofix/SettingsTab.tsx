import { useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import { Settings as SettingsIcon } from 'lucide-react'
import { t } from '@lib/i18n';
import { request } from '@lib/engine'
import { type RuleRow } from './_shared'

async function updateRuleConfig(orgId: string, ruleId: string, body: Partial<{ enabled: boolean; auto_merge: boolean; daily_quota: number }>) {
  return request<RuleRow>('PUT', `/api/v1/code/orgs/${orgId}/autofix/rules/${ruleId}`, body)
}

const CAT_COLORS: Record<string, string> = {
  dependencies: '#8b5cf6',
  sast: '#ef4444',
  iac: '#06b6d4',
  pentest: '#f97316',
  containers: '#22c55e',
}

export function SettingsTab({ rules, orgId, onChanged }: { rules: RuleRow[]; orgId: string | undefined; onChanged: () => void }) {
  if (!orgId) return null
  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <SettingsIcon size={16} />
        <Typography variant="subtitle1" fontWeight={600} color="text.primary">
          {t('autofix.warroom.settingsTitle')}
        </Typography>
      </Box>
      <Typography variant="body2" color="text.primary" sx={{ mb: 3, maxWidth: 600, lineHeight: 1.7, opacity: 0.7 }}>
        {t('autofix.warroom.settingsHint')}
      </Typography>

      {/* Rules list */}
      <Paper elevation={1} className="rounded-xl" sx={{ overflow: 'hidden' }}>
        {/* Header row */}
        <Box sx={{
          display: 'grid', gridTemplateColumns: '1fr 120px 90px 100px 90px',
          gap: 2, px: 3, py: 1.5,
          borderBottom: 1, borderColor: 'divider',
        }}>
          <Typography variant="body2" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('common.rule')}</Typography>
          <Typography variant="body2" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('common.category')}</Typography>
          <Typography variant="body2" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>{t('common.enabled')}</Typography>
          <Typography variant="body2" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>{t('common.autoMerge')}</Typography>
          <Typography variant="body2" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>{t('common.quota')}</Typography>
        </Box>

        {/* Rule rows */}
        {rules.map(r => (
          <SettingsRow key={r.id} rule={r} orgId={orgId} onChanged={onChanged} />
        ))}

        {rules.length === 0 && (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {t('autofix.warroom.noRules')}
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  )
}

function SettingsRow({ rule, orgId, onChanged }: { rule: RuleRow; orgId: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const catColor = CAT_COLORS[rule.category] ?? '#6b7280'

  const update = async (patch: Partial<{ enabled: boolean; auto_merge: boolean; daily_quota: number }>) => {
    setBusy(true)
    try {
      await updateRuleConfig(orgId, rule.id, patch)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box sx={{
      display: 'grid', gridTemplateColumns: '1fr 120px 90px 100px 90px',
      gap: 2, px: 3, py: 1.5, alignItems: 'center',
      borderBottom: 1, borderColor: 'divider',
      opacity: rule.enabled ? 1 : 0.7,
      '&:last-child': { borderBottom: 0 },
      '&:hover': { bgcolor: 'action.hover' },
      transition: 'all 0.15s',
    }}>
      {/* Rule name + description */}
      <Box>
        <Typography variant="body2" fontWeight={700} color="text.primary" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
          {rule.id}
        </Typography>
        <Typography variant="body2" color="text.primary" sx={{ opacity: 0.7, fontSize: 13 }}>
          {rule.title}
        </Typography>
      </Box>

      {/* Category */}
      <Chip
        label={rule.category}
        size="small"
        sx={{
          fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
          bgcolor: `${catColor}15`, color: catColor, border: `1px solid ${catColor}30`,
        }}
      />

      {/* Enabled */}
      <Box sx={{ textAlign: 'center' }}>
        <Switch
          size="small"
          checked={rule.enabled}
          disabled={busy}
          onChange={e => update({ enabled: e.target.checked })}
        />
      </Box>

      {/* Auto-merge */}
      <Box sx={{ textAlign: 'center' }}>
        <Tooltip title={!rule.enabled ? t('autofix.warroom.autoMergeDisabled') : ''}>
          <span>
            <Switch
              size="small"
              checked={rule.auto_merge}
              disabled={busy || !rule.enabled}
              onChange={e => update({ auto_merge: e.target.checked })}
            />
          </span>
        </Tooltip>
      </Box>

      {/* Daily quota */}
      <Box sx={{ textAlign: 'right' }}>
        <TextField
          type="number"
          size="small"
          value={rule.daily_quota}
          disabled={busy}
          inputProps={{ min: 0, max: 1000, style: { textAlign: 'right', fontSize: 13 } }}
          onChange={e => {
            const v = parseInt(e.target.value, 10)
            if (!Number.isNaN(v)) update({ daily_quota: v })
          }}
          sx={{ width: 70, '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
        />
      </Box>
    </Box>
  )
}
