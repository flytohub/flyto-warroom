/**
 * exposure/externalModel — re-export shim.
 *
 * The pure external-surface mapping helpers moved to the neutral
 * `_shared/externalModel` layer so that non-exposure surfaces
 * (dashboard) no longer reach into an exposure-internal file.
 * Exposure-internal callers keep importing from `./externalModel`
 * unchanged.
 */
export * from '@compounds/_shared/externalModel'
