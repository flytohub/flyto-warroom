/**
 * JoinSourceList — Step 1: data source list for JOIN designer.
 */

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { Circle, Lock, Plus } from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import { clickableA11y } from '@lib/a11y'
import { useOrg } from '@hooks/useOrg'
import { useCapabilities } from '@hooks/useCapabilities'
import { DATA_SOURCES, REPORT_SOURCE_STATUS_COLOR, reportSourceRuntimeState } from './datasources'
import type { JoinNode } from './joinLogic'
import type { BackendReportSource } from '@lib/engine'

interface Props {
  nodes: JoinNode[]
  onAddSource: (sourceId: string) => void
  backendSourceById?: Record<string, BackendReportSource>
}

export function JoinSourceList({ nodes, onAddSource, backendSourceById }: Props) {
  const { org } = useOrg()
  const caps = useCapabilities(org?.id)
  const available = DATA_SOURCES.filter(ds => !nodes.some(n => n.sourceId === ds.id))

  return (
    <Box sx={{ height: 180, flexShrink: 0, display: 'flex', flexDirection: 'column', borderBottom: '2px solid', borderBottomColor: 'divider' }}>
      <Typography variant="caption" fontWeight={700} sx={{ fontSize: 13, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.05em', px: 2, pt: 1 }}>
        {t('reports.step1')}
      </Typography>
      <Box sx={{ flex: 1, overflow: 'auto', px: 1.5, py: 0.5 }}>
        {available.map(ds => {
          const state = reportSourceRuntimeState(ds, caps, backendSourceById?.[ds.id])
          const color = REPORT_SOURCE_STATUS_COLOR[state.status]
          const label = tOr(ds.nameKey ?? '', ds.name)
          const showState = state.status !== 'unknown' || state.disabled || Boolean(backendSourceById)
          return (
            <Box key={ds.id}
              onClick={!state.disabled ? () => onAddSource(ds.id) : undefined}
              {...(!state.disabled ? clickableA11y(() => onAddSource(ds.id), { label }) : { 'aria-disabled': true })}
              title={state.detail ? `${t(state.detailKey)}: ${state.detail}` : t(state.detailKey)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.4, borderRadius: 1,
                cursor: !state.disabled ? 'pointer' : 'not-allowed',
                opacity: !state.disabled ? 1 : 0.52,
                '&:hover': !state.disabled ? { bgcolor: 'rgba(34,197,94,0.08)' } : undefined,
              }}
            >
              {!state.disabled ? <Plus size={14} style={{ color: 'var(--mui-palette-success-main)' }} /> : <Lock size={14} style={{ color: 'var(--mui-palette-text-secondary)' }} />}
              <ds.icon size={14} style={{ color: 'var(--mui-palette-text-secondary)' }} />
              <Typography variant="caption" sx={{ fontSize: 13, color: 'text.primary', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {label}
              </Typography>
              {showState && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color, flexShrink: 0 }}>
                  <Circle size={7} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                  <Typography variant="caption" color="inherit">
                    {t(state.labelKey)}
                  </Typography>
                </span>
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
