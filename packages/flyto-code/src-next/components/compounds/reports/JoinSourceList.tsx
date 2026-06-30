/**
 * JoinSourceList — Step 1: data source list for JOIN designer.
 */

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { Lock, Plus } from 'lucide-react'
import { t } from '@lib/i18n';
import { clickableA11y } from '@lib/a11y'
import { useOrg } from '@hooks/useOrg'
import { useCapabilities } from '@hooks/useCapabilities'
import { DATA_SOURCES, canUseDataSource } from './datasources'
import type { JoinNode } from './joinLogic'

interface Props {
  nodes: JoinNode[]
  onAddSource: (sourceId: string) => void
}

export function JoinSourceList({ nodes, onAddSource }: Props) {
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
          const allowed = canUseDataSource(ds, caps)
          return (
            <Box key={ds.id}
              onClick={allowed ? () => onAddSource(ds.id) : undefined}
              {...(allowed ? clickableA11y(() => onAddSource(ds.id), { label: ds.name }) : { 'aria-disabled': true })}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.4, borderRadius: 1,
                cursor: allowed ? 'pointer' : 'not-allowed',
                opacity: allowed ? 1 : 0.52,
                '&:hover': allowed ? { bgcolor: 'rgba(34,197,94,0.08)' } : undefined,
              }}
            >
              {allowed ? <Plus size={14} style={{ color: '#22c55e' }} /> : <Lock size={14} style={{ color: 'var(--mui-palette-text-secondary)' }} />}
              <ds.icon size={14} style={{ color: 'var(--mui-palette-text-secondary)' }} />
              <Typography variant="caption" sx={{ fontSize: 13, color: 'text.primary' }}>{ds.name}</Typography>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
