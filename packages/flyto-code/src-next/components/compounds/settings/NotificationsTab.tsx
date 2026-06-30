import { accentCardSx } from './shared'
import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Switch from '@mui/material/Switch'
import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'
import TextField from '@mui/material/TextField'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import { Plus, Trash2, Bell, Webhook, CalendarClock, Mail, BellRing, Send } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { InlineErrorNotice } from '@atoms/InlineErrorNotice'
import {
  flytoChipSx,
  flytoContainedActionSx,
  flytoEmptyIconStyle,
  flytoGradientActionSx,
  flytoHoverIconButtonSx,
  flytoIconBoxSx,
  flytoInputSlotSx,
  flytoOutlinedActionSx,
  flytoSectionLabelSx,
  flytoSmallControlSx,
  flytoTone,
  flytoToneIconStyle,
} from '@/styles/visualSystem'
import {
  listWebhooks,
  createWebhook,
  deleteWebhook,
  getScanSchedule,
  setScanSchedule,
  listOrgNotificationChannels,
  createOrgNotificationChannel,
  testOrgNotificationChannel,
  listOrgNotificationRules,
  createOrgNotificationRule,
} from '@lib/engine'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const sectionTitleSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  mb: 1.5,
  mt: 0.5,
}

const rowSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  px: 2.5,
  py: 2.5,
  borderBottom: 1,
  borderColor: 'divider',
  transition: 'background 0.15s ease',
  '&:hover': { bgcolor: flytoTone.brand.hoverBg },
  '&:last-child': { borderBottom: 0 },
}

const switchSx = {
  '& .MuiSwitch-switchBase.Mui-checked': {
    color: flytoTone.brand.fg,
    '& + .MuiSwitch-track': {
      bgcolor: flytoTone.brand.border,
    },
  },
}

export function NotificationsTab() {
  const { org } = useOrg()
  const qc = useQueryClient()
  const [newUrl, setNewUrl] = useState('')
  const [newEvents, setNewEvents] = useState('all')
  const [webhookError, setWebhookError] = useState<string | null>(null)
  const isValidUrl = /^https:\/\/.+\..+/.test(newUrl.trim())
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [channelType, setChannelType] = useState('slack')
  const [channelName, setChannelName] = useState('')
  const [channelTarget, setChannelTarget] = useState('')
  const [ruleKey, setRuleKey] = useState('org_darkweb_credential')
  const [eventSource, setEventSource] = useState('credential')
  const [severity, setSeverity] = useState('critical')
  const [selectedChannelId, setSelectedChannelId] = useState('')
  const [routingError, setRoutingError] = useState<string | null>(null)
  const [lastDryRun, setLastDryRun] = useState<string | null>(null)

  const { data: webhooksData } = useQuery({
    queryKey: qk.platform.webhooks(org?.id),
    queryFn: () => listWebhooks(org!.id),
    enabled: !!org?.id,
  })
  const webhooks = webhooksData?.webhooks ?? []

  const { data: orgChannelsData } = useQuery({
    queryKey: qk.platform.orgNotificationChannels(org?.id),
    queryFn: () => listOrgNotificationChannels(org!.id),
    enabled: !!org?.id,
  })
  const orgChannels = orgChannelsData?.channels ?? []

  const { data: orgRulesData } = useQuery({
    queryKey: qk.platform.orgNotificationRules(org?.id),
    queryFn: () => listOrgNotificationRules(org!.id),
    enabled: !!org?.id,
  })
  const orgRules = orgRulesData?.rules ?? []

  const addOrgChannel = useMutation({
    mutationFn: () => createOrgNotificationChannel(org!.id, {
      channel_type: channelType,
      display_name: channelName.trim(),
      target_ref: channelTarget.trim(),
      status: channelType === 'system_event' ? 'active' : 'unverified',
    }),
    onSuccess: (resp) => {
      setChannelName('')
      setChannelTarget('')
      setSelectedChannelId(resp.channel.id)
      setRoutingError(null)
      qc.invalidateQueries({ queryKey: qk.platform.orgNotificationChannels(org?.id) })
    },
    onError: (err: Error) => { setRoutingError(err.message || t('common.loadError')) },
  })

  const dryRunOrgChannel = useMutation({
    // @closure local-result
    mutationFn: (channelId: string) => testOrgNotificationChannel(org!.id, channelId),
    onSuccess: (resp) => {
      setLastDryRun(`${resp.delivery.status} / ${resp.delivery.target_ref_status}`)
      setRoutingError(null)
    },
    onError: (err: Error) => { setRoutingError(err.message || t('common.loadError')) },
  })

  const addOrgRule = useMutation({
    mutationFn: () => createOrgNotificationRule(org!.id, {
      rule_key: ruleKey.trim(),
      event_source: eventSource,
      severity,
      enabled: true,
      channel_ids: selectedChannelId ? [selectedChannelId] : [],
      cooldown_seconds: 1800,
      condition_json: eventSource === 'credential' ? { category: 'darkweb_credential_leak' } : {},
    }),
    onSuccess: () => {
      setRoutingError(null)
      qc.invalidateQueries({ queryKey: qk.platform.orgNotificationRules(org?.id) })
    },
    onError: (err: Error) => { setRoutingError(err.message || t('common.loadError')) },
  })

  const addWebhook = useMutation({
    mutationFn: () => createWebhook(org!.id, newUrl, newEvents),
    onSuccess: () => { setNewUrl(''); setWebhookError(null); qc.invalidateQueries({ queryKey: qk.platform.webhooks(org?.id) }) },
    onError: (err: Error) => { setWebhookError(err.message || t('common.loadError')) },
  })

  const removeWebhook = useMutation({
    mutationFn: (id: string) => deleteWebhook(id),
    onSuccess: () => { setWebhookError(null); qc.invalidateQueries({ queryKey: qk.platform.webhooks(org?.id) }) },
    onError: (err: Error) => { setWebhookError(err.message || t('common.loadError')) },
  })

  const { data: scheduleData } = useQuery({
    queryKey: qk.platform.legacyScanSchedule(org?.id),
    queryFn: () => getScanSchedule(org!.id),
    enabled: !!org?.id,
  })

  const [schedule, setSchedule] = useState<string>('')
  const currentSchedule = schedule || scheduleData?.schedule || 'daily'

  const saveSchedule = useMutation({
    mutationFn: (s: string) => setScanSchedule(org!.id, s, s !== 'manual'),
    onSuccess: () => { setScheduleError(null); qc.invalidateQueries({ queryKey: qk.platform.legacyScanSchedule(org?.id) }) },
    onError: (err: Error) => { setScheduleError(err.message || t('common.loadError')) },
  })

  function handleScheduleChange(val: string) {
    setSchedule(val)
    saveSchedule.mutate(val)
  }

  const channelTargetPlaceholder = channelType === 'email'
    ? 'soc@example.com'
    : channelType === 'system_event'
      ? 'org.ctem.ops'
      : 'https://hooks.example.com/services/...'
  const canAddOrgChannel = !!channelName.trim() && !!channelTarget.trim() && !addOrgChannel.isPending
  const canAddOrgRule = !!ruleKey.trim() && !!selectedChannelId && !addOrgRule.isPending

  return (
    <>
      {/* Notification channels */}
      <Box sx={sectionTitleSx}>
        <Bell size={15} style={flytoToneIconStyle('brand')} />
        <Typography variant="subtitle2" sx={flytoSectionLabelSx}>
          {t('settings.notifications')}
        </Typography>
      </Box>
      <Box sx={accentCardSx(flytoTone.tech.fg)}>
        {/* Email */}
        <Box sx={rowSx}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
            <Box sx={flytoIconBoxSx('tech')}>
              <Mail size={15} style={flytoToneIconStyle('tech', 1)} />
            </Box>
            <Box>
              <Typography variant="body2" fontWeight={600} color="text.primary">
                {t('settings.emailNotif')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.25, lineHeight: 1.4 }}>
                {t('settings.emailNotifDesc')}
              </Typography>
            </Box>
          </Box>
          <Switch size="small" sx={switchSx} />
        </Box>

        {/* Scan alerts */}
        <Box sx={rowSx}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
            <Box sx={flytoIconBoxSx('danger')}>
              <BellRing size={15} style={flytoToneIconStyle('danger', 1)} />
            </Box>
            <Box>
              <Typography variant="body2" fontWeight={600} color="text.primary">
                {t('settings.scanAlerts')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.25, lineHeight: 1.4 }}>
                {t('settings.scanAlertsDesc')}
              </Typography>
            </Box>
          </Box>
          <Switch size="small" defaultChecked sx={switchSx} />
        </Box>
      </Box>

      {/* Org notification routing */}
      <Box sx={sectionTitleSx}>
        <Send size={15} style={flytoToneIconStyle('success')} />
        <Typography variant="subtitle2" sx={flytoSectionLabelSx}>
          {t('settings.notificationRouting')}
        </Typography>
      </Box>
      <Box sx={accentCardSx(flytoTone.success.fg)}>
        {orgChannels.map((ch) => (
          <Box key={ch.id} sx={rowSx}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, minWidth: 0 }}>
              <Box sx={flytoIconBoxSx('success')}>
                <Bell size={15} style={flytoToneIconStyle('success', 1)} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} color="text.primary" sx={{ wordBreak: 'break-word' }}>
                  {ch.display_name || ch.id}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, mt: 0.5 }}>
                  <Chip label={ch.channel_type} size="small" sx={flytoChipSx()} />
                  <Chip
                    label={ch.target_ref?.startsWith('sealed:') ? 'sealed destination' : (ch.target_ref || 'reference')}
                    size="small"
                    sx={flytoChipSx('success')}
                  />
                  <Chip label={ch.status} size="small" sx={flytoChipSx()} />
                </Box>
              </Box>
            </Box>
            <IconButton
              size="small"
              onClick={() => dryRunOrgChannel.mutate(ch.id)}
              disabled={dryRunOrgChannel.isPending}
              aria-label={t('settings.dryRunNotification')}
              title={t('settings.dryRunNotification')}
              sx={flytoHoverIconButtonSx('success')}
            >
              <Send size={14} />
            </IconButton>
          </Box>
        ))}

        {orgChannels.length === 0 && (
          <Box sx={{ px: 2.5, py: 3, textAlign: 'center' }}>
            <Bell size={28} style={flytoEmptyIconStyle} />
            <Typography variant="body2" color="text.secondary">
              {t('settings.noNotificationChannels')}
            </Typography>
          </Box>
        )}

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, px: 2.5, py: 2, alignItems: 'center', borderTop: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <Select value={channelType} onChange={(e) => setChannelType(e.target.value)} size="small" sx={flytoSmallControlSx}>
              <MenuItem value="slack">Slack</MenuItem>
              <MenuItem value="webhook">Webhook</MenuItem>
              <MenuItem value="email">Email</MenuItem>
              <MenuItem value="system_event">{t('hardcoded.system.event.0004af20')}</MenuItem>
            </Select>
          </FormControl>
          <TextField
            placeholder={t('settings.channelName')}
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            size="small"
            sx={{ flex: 1, minWidth: 160 }}
            slotProps={{ input: { sx: flytoInputSlotSx } }}
          />
          <TextField
            placeholder={channelTargetPlaceholder}
            value={channelTarget}
            onChange={(e) => setChannelTarget(e.target.value)}
            size="small"
            sx={{ flex: 1.4, minWidth: 220 }}
            slotProps={{ input: { sx: flytoInputSlotSx } }}
          />
          <Button
            size="small"
            variant="contained"
            startIcon={<Plus size={14} />}
            onClick={() => addOrgChannel.mutate()}
            disabled={!canAddOrgChannel}
            sx={{ ...flytoContainedActionSx('success'), px: 2 }}
          >
            {t('settings.addChannel')}
          </Button>
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, px: 2.5, py: 2, alignItems: 'center', borderTop: 1, borderColor: 'divider' }}>
          <TextField
            placeholder="org_darkweb_credential"
            value={ruleKey}
            onChange={(e) => setRuleKey(e.target.value)}
            size="small"
            sx={{ flex: 1, minWidth: 190 }}
            slotProps={{ input: { sx: flytoInputSlotSx } }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <Select value={eventSource} onChange={(e) => setEventSource(e.target.value)} size="small" sx={flytoSmallControlSx}>
              <MenuItem value="credential">credential</MenuItem>
              <MenuItem value="fusion_divergence">fusion_divergence</MenuItem>
              <MenuItem value="data_freshness">data_freshness</MenuItem>
              <MenuItem value="provider_circuit">provider_circuit</MenuItem>
              <MenuItem value="api_quota">api_quota</MenuItem>
              <MenuItem value="scan">scan</MenuItem>
              <MenuItem value="report">report</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select value={severity} onChange={(e) => setSeverity(e.target.value)} size="small" sx={flytoSmallControlSx}>
              <MenuItem value="info">info</MenuItem>
              <MenuItem value="warning">warning</MenuItem>
              <MenuItem value="critical">critical</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 210 }}>
            <Select
              value={selectedChannelId}
              onChange={(e) => setSelectedChannelId(e.target.value)}
              size="small"
              displayEmpty
              sx={flytoSmallControlSx}
            >
              <MenuItem value="">{t('settings.selectChannel')}</MenuItem>
              {orgChannels.map(ch => <MenuItem key={ch.id} value={ch.id}>{ch.display_name || ch.id}</MenuItem>)}
            </Select>
          </FormControl>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Plus size={14} />}
            onClick={() => addOrgRule.mutate()}
            disabled={!canAddOrgRule}
            sx={{ ...flytoOutlinedActionSx('success'), px: 2 }}
          >
            {t('settings.addRule')}
          </Button>
        </Box>

        {orgRules.length > 0 && (
          <Box sx={{ px: 2.5, pb: 2, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {orgRules.map(rule => (
              <Chip
                key={rule.id}
                label={`${rule.rule_key} · ${rule.severity} · ${rule.channel_ids.length}`}
                size="small"
                sx={flytoChipSx('success', 26)}
              />
            ))}
          </Box>
        )}

        {routingError ? (
          <Box sx={{ px: 2.5, pb: 2 }}>
            <InlineErrorNotice error={routingError} />
          </Box>
        ) : lastDryRun ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 2.5, pb: 2 }}>
            <Send size={14} style={{ ...flytoToneIconStyle('success', 1), flexShrink: 0 }} />
            <Typography variant="body2" color="text.secondary">
              {`${t('settings.lastDryRun')}: ${lastDryRun}`}
            </Typography>
          </Box>
        ) : null}
      </Box>

      {/* Legacy webhooks */}
      <Box sx={sectionTitleSx}>
        <Webhook size={15} style={flytoToneIconStyle('warning')} />
        <Typography variant="subtitle2" sx={flytoSectionLabelSx}>
          {t('settings.legacyWebhooks')}
        </Typography>
      </Box>
      <Box sx={accentCardSx(flytoTone.tech.fg)}>
        {/* Existing webhooks */}
        {webhooks.map((wh) => (
          <Box key={wh.id} sx={rowSx}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, minWidth: 0 }}>
              <Box sx={flytoIconBoxSx('warning')}>
                <Webhook size={15} style={flytoToneIconStyle('warning', 1)} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} color="text.primary" sx={{ wordBreak: 'break-all' }}>
                  {wh.url}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5 }}>
                  <Chip
                    label={wh.events}
                    size="small"
                    sx={flytoChipSx('warning')}
                  />
                  {wh.active !== false && (
                    <Chip
                      label={t('common.active')}
                      size="small"
                      sx={flytoChipSx('success')}
                    />
                  )}
                </Box>
              </Box>
            </Box>
            <IconButton
              size="small"
              onClick={() => removeWebhook.mutate(wh.id)}
              disabled={removeWebhook.isPending}
              aria-label={t('common.delete')}
              title={t('common.delete')}
              sx={flytoHoverIconButtonSx('danger')}
            >
              <Trash2 size={14} />
            </IconButton>
          </Box>
        ))}

        {/* Empty state */}
        {webhooks.length === 0 && (
          <Box sx={{ px: 2.5, py: 3, textAlign: 'center' }}>
            <Webhook size={28} style={flytoEmptyIconStyle} />
            <Typography variant="body2" color="text.secondary">
              {t('settings.noWebhooks')}
            </Typography>
          </Box>
        )}

        {/* Add webhook form */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            px: 2.5,
            py: 2,
            alignItems: 'center',
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'action.hover',
          }}
        >
          <TextField
            placeholder="https://example.com/webhook"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            size="small"
            error={newUrl.length > 0 && !isValidUrl}
            helperText={newUrl.length > 0 && !isValidUrl ? t('settings.webhookUrlHint') || 'Must be a valid HTTPS URL' : undefined}
            sx={{
              flex: 1,
              minWidth: 200,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: flytoTone.brand.border },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: flytoTone.brand.fg },
            }}
            slotProps={{ input: { sx: flytoInputSlotSx } }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <Select
              value={newEvents}
              onChange={(e) => setNewEvents(e.target.value)}
              size="small"
              sx={{
                ...flytoSmallControlSx,
                '& .MuiOutlinedInput-notchedOutline': { borderColor: flytoTone.brand.border },
              }}
            >
              <MenuItem value="all">{t('settings.webhookAll')}</MenuItem>
              <MenuItem value="critical_issue">{t('settings.webhookCritical')}</MenuItem>
              <MenuItem value="issue_resolved">{t('settings.webhookResolved')}</MenuItem>
              <MenuItem value="scan_complete">{t('settings.webhookScanComplete')}</MenuItem>
            </Select>
          </FormControl>
          <Button
            size="small"
            variant="contained"
            startIcon={<Plus size={14} />}
            onClick={() => addWebhook.mutate()}
            disabled={!isValidUrl || addWebhook.isPending}
            sx={{ ...flytoGradientActionSx('brand'), px: 2 }}
          >
            {t('settings.addWebhook')}
          </Button>
        </Box>

        {webhookError && (
          <Box sx={{ px: 2.5, pb: 2 }}>
            <InlineErrorNotice error={webhookError} />
          </Box>
        )}
      </Box>

      {/* Scan schedule */}
      <Box sx={sectionTitleSx}>
        <CalendarClock size={15} style={flytoToneIconStyle('brand')} />
        <Typography variant="subtitle2" sx={flytoSectionLabelSx}>
          {t('settings.scanSchedule')}
        </Typography>
      </Box>
      <Box sx={accentCardSx(flytoTone.tech.fg)}>
        <Box sx={{ ...rowSx, borderBottom: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
            <Box sx={flytoIconBoxSx('brand')}>
              <CalendarClock size={15} style={flytoToneIconStyle('brand', 1)} />
            </Box>
            <Box>
              <Typography variant="body2" fontWeight={600} color="text.primary">
                {t('settings.scanScheduleDesc')}
              </Typography>
            </Box>
          </Box>
          <ButtonGroup size="small" variant="outlined">
            {(['daily', 'weekly', 'manual'] as const).map((val) => (
              <Button
                key={val}
                variant={currentSchedule === val ? 'contained' : 'outlined'}
                onClick={() => handleScheduleChange(val)}
                disabled={saveSchedule.isPending}
                sx={{
                  ...flytoOutlinedActionSx('brand'),
                  ...(currentSchedule === val && {
                    ...flytoGradientActionSx('brand'),
                    borderColor: flytoTone.brand.fg,
                  }),
                  ...(currentSchedule !== val && {
                    color: 'text.secondary',
                    '&:hover': { borderColor: flytoTone.brand.fg, bgcolor: flytoTone.brand.hoverBg },
                  }),
                }}
              >
                {t(`settings.schedule.${val}`)}
              </Button>
            ))}
          </ButtonGroup>
        </Box>
        {scheduleError && (
          <Box sx={{ px: 2.5, pb: 2 }}>
            <InlineErrorNotice error={scheduleError} />
          </Box>
        )}
      </Box>
    </>
  )
}
