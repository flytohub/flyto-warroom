/**
 * _shared/warroom — neutral home for the war-room data shape.
 *
 * `OrgWarRoomData` is consumed by both the warroom aggregator and the
 * arch/security domain views it composes. Keeping it here (rather than
 * in warroom/WarRoomView.tsx) breaks the warroom <-> arch/security
 * import cycle: domain views import the type from this neutral layer
 * instead of reaching into the warroom surface's internals.
 */

import type { RepoHealthSummary, ConnectedRepo, APIDefinition } from '@lib/engine'

export interface OrgWarRoomData {
  healthRepos: RepoHealthSummary[]
  repos: ConnectedRepo[]
  apis: APIDefinition[]
  apiTotal: number
}
