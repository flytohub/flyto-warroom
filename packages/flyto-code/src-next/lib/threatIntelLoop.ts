import type { QueryClient } from '@tanstack/react-query'
import { qk } from './queryKeys'

type Invalidator = Pick<QueryClient, 'invalidateQueries'>

export function invalidateThreatIntelQueries(qc: Invalidator, orgId?: string): void {
  const roots = [
    qk.threatIntel.threatActorsAll(),
    qk.threatIntel.malwareFamiliesAll(),
    qk.threatIntel.ransomwareAll(),
    qk.threatIntel.iocLookupAll(),
    qk.threatIntel.sensorMapAll(),
    qk.threatIntel.sensorObservationsAll(),
    qk.threatIntel.feedStatusAll(),
    qk.threatIntel.iocFeedStatusAll(),
    qk.threatIntel.iocManagerStatsAll(),
    qk.threatIntel.threatActorsManagerAll(),
    qk.threatIntel.malwareManagerAll(),
    qk.threatIntel.ransomwareManagerAll(),
  ]

  for (const queryKey of roots) {
    qc.invalidateQueries({ queryKey, exact: false })
  }

  if (orgId) {
    qc.invalidateQueries({ queryKey: qk.footprint.threatSeed(orgId) })
  }
}
