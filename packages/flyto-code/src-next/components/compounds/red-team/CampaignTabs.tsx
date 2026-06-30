import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import { Plus, X } from 'lucide-react'
import { t } from '@lib/i18n';
import type { PentestScan, PentestProject } from '@lib/engine'
import { type Campaign, campaignStatus, formatElapsed } from './shared'

const MODE_COLORS: Record<string, { dot: string; border: string; bg: string }> = {
  breach: { dot: '#ef4444', border: 'rgba(239,68,68,0.4)', bg: 'rgba(239,68,68,0.08)' },
  live:   { dot: '#22c55e', border: 'rgba(34,197,94,0.4)', bg: 'rgba(34,197,94,0.08)' },
  ready:  { dot: '#a78bfa', border: 'rgba(167,139,250,0.4)', bg: 'rgba(167,139,250,0.06)' },
}

export function CampaignTabs({
  campaigns, activeId, campaignById, now, activeExecution, onSwitch, onClose, onNew,
}: {
  campaigns: Campaign[]
  activeId: string | null
  campaignById: Record<string, { campaign: Campaign; scans: PentestScan[]; project?: PentestProject }>
  now: number
  activeExecution?: boolean
  onSwitch: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}) {
  if (campaigns.length === 0) {
    return null
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 3, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, overflow: 'auto', '&::-webkit-scrollbar': { display: 'none' } }}>
        {campaigns.map(c => {
          const data = campaignById[c.projectId]
          if (!data?.project) return null
          const mode = campaignStatus(data.scans)
          const isActive = activeId === c.projectId
          const elapsed = mode === 'live' || (isActive && activeExecution)
            ? formatElapsed(now - c.startedAt)
            : '--:--'
          const label = data.project.display_name || data.project.target_url
          const mc = MODE_COLORS[mode] || MODE_COLORS.ready
          return (
            <Box
              key={c.projectId}
              onClick={() => onSwitch(c.projectId)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSwitch(c.projectId) }}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                px: 1.5, py: 0.75, borderRadius: '8px', cursor: 'pointer',
                border: '1px solid',
                borderColor: isActive ? mc.border : 'rgba(148, 163, 184, 0.25)',
                bgcolor: isActive ? mc.bg : 'transparent',
                transition: 'all 0.15s',
                '&:hover': { bgcolor: mc.bg },
                flexShrink: 0,
              }}
            >
              <Box sx={{
                width: 6, height: 6, borderRadius: '50%', bgcolor: mc.dot, flexShrink: 0,
                animation: mode === 'live' ? 'pulse 1.5s infinite' : 'none',
                '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
              }} />
              <Typography
                variant="caption"
                sx={{
                  color: isActive ? 'text.primary' : 'text.secondary',
                  fontWeight: isActive ? 600 : 400,
                  maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontSize: 13,
                }}
                title={data.project.target_url}
              >
                {label}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12, fontFamily: 'monospace' }}>
                {elapsed}
              </Typography>
              <IconButton
                size="small"
                onClick={e => { e.stopPropagation(); onClose(c.projectId) }}
                aria-label={t('warroom.redTeamCloseCampaign')}
                sx={{
                  p: 0.25, color: 'text.secondary',
                  '&:hover': { color: '#ef4444' },
                }}
              >
                <X size={12} />
              </IconButton>
            </Box>
          )
        })}
      </Box>
      <IconButton
        size="small"
        onClick={onNew}
        aria-label={t('warroom.redTeamNewCampaign')}
        sx={{
          p: 0.5, borderRadius: '8px',
          border: '1px dashed #334155',
          color: 'text.secondary',
          '&:hover': { borderColor: '#ef4444', color: '#ef4444' },
        }}
      >
        <Plus size={14} />
      </IconButton>
    </Box>
  )
}
