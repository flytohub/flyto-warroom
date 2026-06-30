import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import {
  Box, Typography, Alert, Chip, Button, TextField, MenuItem, Divider,
} from '@mui/material'
import { Bell, Plus, Radio } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import {
  listNotificationChannels, createNotificationChannel,
  listNotificationRules, createNotificationRule,
} from '@lib/engine/system/notifications'

// SystemNotificationsTab — PLATFORM/admin alert-routing control plane.
// Wires system/notifications/{channels,rules}. Distinct from the org-level
// NotificationsTab. Platform-admin gated (system:notifs:read/write).

const CHANNEL_TYPES = ['slack', 'email', 'webhook', 'pagerduty']
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info']

export function SystemNotificationsTab() {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  const [chType, setChType] = useState('slack')
  const [chName, setChName] = useState('')
  const [chTarget, setChTarget] = useState('')
  const [ruleKey, setRuleKey] = useState('')
  const [ruleSource, setRuleSource] = useState('')
  const [ruleSev, setRuleSev] = useState('high')

  const channelsQ = useQuery({
    queryKey: qk.platform.notificationChannels(),
    queryFn: listNotificationChannels,
    staleTime: 30_000,
  })
  const rulesQ = useQuery({
    queryKey: qk.platform.notificationRules(),
    queryFn: listNotificationRules,
    staleTime: 30_000,
  })

  const createChannelMut = useMutation({
    mutationFn: () => createNotificationChannel({
      channel_type: chType,
      display_name: chName.trim() || undefined,
      target_ref: chTarget.trim() || undefined,
    }),
    onSuccess: () => {
      setChName(''); setChTarget('')
      qc.invalidateQueries({ queryKey: qk.platform.notificationChannels() })
      enqueueSnackbar(t('sys.notif.channelCreated'), { variant: 'success' })
    },
    onError: (e) => enqueueSnackbar(String(e as Error), { variant: 'error' }),
  })
  const createRuleMut = useMutation({
    mutationFn: () => createNotificationRule({
      rule_key: ruleKey.trim(),
      event_source: ruleSource.trim(),
      severity: ruleSev,
      enabled: true,
    }),
    onSuccess: () => {
      setRuleKey(''); setRuleSource('')
      qc.invalidateQueries({ queryKey: qk.platform.notificationRules() })
      enqueueSnackbar(t('sys.notif.ruleCreated'), { variant: 'success' })
    },
    onError: (e) => enqueueSnackbar(String(e as Error), { variant: 'error' }),
  })

  const channels = channelsQ.data?.channels ?? []
  const rules = rulesQ.data?.rules ?? []

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2, fontSize: 13 }}>
        {t('sys.notif.intro')}
      </Alert>

      {/* Channels */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Radio size={16} style={{ color: '#a78bfa' }} />
        <Typography variant="subtitle2" fontWeight={700}>{t('sys.notif.channels')}</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <TextField select size="small" label={t('sys.notif.type')} value={chType}
          onChange={e => setChType(e.target.value)} sx={{ minWidth: 130 }}>
          {CHANNEL_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
        </TextField>
        <TextField size="small" label={t('sys.notif.name')} value={chName}
          onChange={e => setChName(e.target.value)} placeholder="sec-alerts" />
        <TextField size="small" label={t('sys.notif.target')} value={chTarget}
          onChange={e => setChTarget(e.target.value)} sx={{ flex: 1, minWidth: 180 }} placeholder="https://hooks.slack.com/…" />
        <Button size="small" variant="contained" startIcon={<Plus size={14} />}
          disabled={createChannelMut.isPending}
          onClick={() => createChannelMut.mutate()}
          sx={{ textTransform: 'none', bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
          {t('common.add')}
        </Button>
      </Box>
      {channelsQ.isLoading && <LoadingState variant="spinner" py={3} />}
      {channelsQ.isError && <QueryError error={channelsQ.error} onRetry={channelsQ.refetch} label={t('sys.notif.channels')} compact />}
      {channels.length === 0 && !channelsQ.isLoading && (
        <Typography variant="caption" color="text.secondary">{t('sys.notif.noChannels')}</Typography>
      )}
      {channels.map(c => (
        <Box key={c.id} sx={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          p: 1.5, mb: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1,
        }}>
          <Box>
            <Typography variant="body2">{c.display_name || c.channel_type}</Typography>
            <Typography variant="caption" color="text.secondary">{c.channel_type}{c.target_ref ? ` · ${c.target_ref}` : ''}</Typography>
          </Box>
          <Chip size="small" label={c.status}
            sx={{ height: 20, fontSize: 12, fontWeight: 700,
              bgcolor: c.status === 'active' ? 'rgba(34,197,94,0.18)' : 'rgba(148,163,184,0.18)',
              color: c.status === 'active' ? '#22c55e' : '#94a3b8' }} />
        </Box>
      ))}

      <Divider sx={{ my: 2 }} />

      {/* Rules */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Bell size={16} style={{ color: '#a78bfa' }} />
        <Typography variant="subtitle2" fontWeight={700}>{t('sys.notif.rules')}</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <TextField size="small" label={t('sys.notif.ruleKey')} value={ruleKey}
          onChange={e => setRuleKey(e.target.value)} placeholder="critical-finding" />
        <TextField size="small" label={t('sys.notif.source')} value={ruleSource}
          onChange={e => setRuleSource(e.target.value)} placeholder="ctem" />
        <TextField select size="small" label={t('sys.notif.severity')} value={ruleSev}
          onChange={e => setRuleSev(e.target.value)} sx={{ minWidth: 120 }}>
          {SEVERITIES.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
        <Button size="small" variant="contained" startIcon={<Plus size={14} />}
          disabled={!ruleKey.trim() || !ruleSource.trim() || createRuleMut.isPending}
          onClick={() => createRuleMut.mutate()}
          sx={{ textTransform: 'none', bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
          {t('common.add')}
        </Button>
      </Box>
      {rulesQ.isLoading && <LoadingState variant="spinner" py={3} />}
      {rulesQ.isError && <QueryError error={rulesQ.error} onRetry={rulesQ.refetch} label={t('sys.notif.rules')} compact />}
      {rules.length === 0 && !rulesQ.isLoading && (
        <Typography variant="caption" color="text.secondary">{t('sys.notif.noRules')}</Typography>
      )}
      {rules.map(r => (
        <Box key={r.id} sx={{
          display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 1.5, alignItems: 'center',
          p: 1.5, mb: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1,
        }}>
          <Box>
            <Typography variant="body2">{r.rule_key}</Typography>
            <Typography variant="caption" color="text.secondary">{r.event_source} · {r.channel_ids.length} channels</Typography>
          </Box>
          <Chip size="small" label={r.severity}
            sx={{ height: 20, fontSize: 12, bgcolor: 'rgba(124,58,237,0.15)', color: '#a78bfa' }} />
          <Chip size="small" label={r.enabled ? 'enabled' : 'disabled'}
            sx={{ height: 20, fontSize: 12, fontWeight: 700,
              bgcolor: r.enabled ? 'rgba(34,197,94,0.18)' : 'rgba(148,163,184,0.18)',
              color: r.enabled ? '#22c55e' : '#94a3b8' }} />
        </Box>
      ))}
    </Box>
  )
}
