/**
 * exposure/shared — re-export shim.
 *
 * The external-surface read model moved to the neutral
 * `_shared/externalPosture` layer so that non-exposure surfaces
 * (domains, dashboard) no longer reach into an exposure-internal file.
 * Exposure-internal callers keep importing from `./shared` unchanged.
 */
export {
  type ActionItem,
  type SLAViolation,
  type RiskSummary,
  type VendorRisk,
  type SupplyChainRisk,
  type ExternalPosture,
  getExternalPosture,
  type ExternalFinding,
  type KernelAsset,
  type KernelExternalPosture,
  getExternalPostureKernel,
  type OpenExternalIssue,
  getOpenExternalIssues,
  SEVERITY_ORDER,
  SEV_COLORS,
  extractHostFromAssetValue,
} from '@compounds/_shared/externalPosture'
