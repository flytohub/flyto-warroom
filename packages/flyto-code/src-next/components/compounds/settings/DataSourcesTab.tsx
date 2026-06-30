/**
 * DataSourcesTab — Settings ▸ Integrations ▸ Data Sources.
 *
 * One home, one flow. The operator clicks "Add external source" and the
 * AddSourceWizard walks them through: pick a category → a certified provider
 * (Bitsight / Cyble / Tenable / Okta / …) or a custom API → test-call & map.
 * Below sits the live Evidence Fusion control plane — every wired source with
 * its real per-source health + mapping-drift detail.
 *
 * The two earlier parallel "Add custom source" / "Add fusion source" entry
 * points (and the raw integration-id form) are gone — they confused the page
 * and one of them was a frontend-only placeholder.
 */
import { useState } from 'react'
import Box from '@mui/material/Box'
import { useOrg } from '@hooks/useOrg'
import { AddSourceWizard } from '@compounds/integrations/AddSourceWizard'
import { FusionSourcesSection } from './FusionSourcesSection'
import { ModuleRoutingSection } from './ModuleRoutingSection'

export function DataSourcesTab() {
  const { org } = useOrg()
  const [building, setBuilding] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Single entry point: the Evidence Fusion control plane owns the
          "Add external source" button and the live list of wired sources. */}
      <FusionSourcesSection key={refreshKey} onAdd={() => setBuilding(true)} />

      {/* Org-wide source routing — which sources feed each gated capability. */}
      <ModuleRoutingSection key={`routing-${refreshKey}`} />

      {org?.id && (
        <AddSourceWizard
          open={building}
          orgId={org.id}
          onClose={() => setBuilding(false)}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </Box>
  )
}
