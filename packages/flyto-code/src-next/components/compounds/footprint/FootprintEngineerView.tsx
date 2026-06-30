/**
 * FootprintEngineerView — engineer-mode EASM surface.
 *
 * Preserves the existing FootprintGraphView verbatim (default tab) and
 * layers the Footprint investigation features as sibling tabs:
 *   - Graph        — existing OSINT graph (unchanged)
 *   - Attack chains— ranked candidate paths + ownership gate (NEW)
 *   - Attribution  — unified "why is this mine?" surface view (NEW)
 *
 * The graph tab keeps its own header/scroll; the new tabs are scroll
 * containers with modest padding.
 */
import { useState } from 'react'
import Box from '@mui/material/Box'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'

import { t } from '@lib/i18n';
import { FootprintGraphView } from './FootprintGraphView'
import { CandidatePathsPanel } from './CandidatePathsPanel'
import { BreakthroughCandidatesPanel } from './BreakthroughCandidatesPanel'
import { SurfaceAttributionPanel } from './SurfaceAttributionPanel'

interface Props {
  orgId: string
}

export function FootprintEngineerView({ orgId }: Props) {
  const [tab, setTab] = useState(0)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2, flex: '0 0 auto' }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 46,
            '& .MuiTab-root': {
              textTransform: 'none',
              minHeight: 46,
              fontSize: '0.9rem',
              fontWeight: 500,
            },
          }}
        >
          <Tab label={t('footprint.tabs.graph')} />
          <Tab label={t('footprint.tabs.attackChains')} />
          <Tab label={t('footprint.tabs.breakthroughs')} />
          <Tab label={t('footprint.tabs.attribution')} />
        </Tabs>
      </Box>

      {/* Graph keeps its own header + scroll, so render it full-bleed. */}
      <Box sx={{ flex: 1, minHeight: 0, display: tab === 0 ? 'block' : 'none' }}>
        <FootprintGraphView orgId={orgId} />
      </Box>

      {tab === 1 && (
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2 }}>
          <CandidatePathsPanel orgId={orgId} />
        </Box>
      )}

      {tab === 2 && (
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2 }}>
          <BreakthroughCandidatesPanel orgId={orgId} />
        </Box>
      )}

      {tab === 3 && (
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2 }}>
          <SurfaceAttributionPanel orgId={orgId} />
        </Box>
      )}
    </Box>
  )
}
