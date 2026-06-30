/**
 * useCapabilities — single source of truth for "what can this user do
 * in this org" on the frontend. Hydrates from the backend's
 * /me/capabilities endpoint and is the basis for:
 *
 *   - sidebar nav filtering (don't render Pulse if `pulse` page hidden)
 *   - route guards (redirect away from a page the user can't see)
 *   - per-action button enable/disable (e.g. hide "Delete Org" unless
 *     `org:delete` is in permissions)
 *
 * Never check entitlement / role on the frontend by hand. Always go
 * through `cap.canSeePage('domains')` / `cap.canDoAction('pentest:run')`.
 * That keeps the gate logic in one place and keeps the contract honest:
 * the backend is the policy authority, the frontend is the renderer.
 */

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  getMyCapabilities,
  type ActionAccess,
  type BillingBehavior,
  type Capabilities,
  type EditionProviders,
  type PageAccess,
  type Paywall,
  type SurfaceAccess,
} from '@lib/engine'
import { qk } from '@lib/queryKeys'

const HIDDEN_PAGE: PageAccess = { state: 'hidden' }
const HIDDEN_SURFACE: SurfaceAccess = { state: 'hidden', billing_behavior: 'blocked' }
const paidBillingBehaviors = new Set<BillingBehavior>(['addon_required', 'metered', 'credit_required'])

function isPaidBillingBehavior(behavior?: BillingBehavior): boolean {
  return !!behavior && paidBillingBehaviors.has(behavior)
}

function previewPageAccess(access: PageAccess): PageAccess {
  if (access.state !== 'locked_preview') return access
  return { ...access, state: 'enabled', reason: access.reason ?? 'Billing is disabled during preview.' }
}

function previewSurfaceAccess(access: SurfaceAccess): SurfaceAccess {
  if (access.state === 'hidden' || !isPaidBillingBehavior(access.billing_behavior)) return access
  return {
    ...access,
    state: 'enabled',
    billing_behavior: 'included',
    reason: access.reason ?? 'Billing is disabled during preview.',
  }
}

function previewRequiredAction(action: string): string | undefined {
  switch (action) {
    case 'report.build':
    case 'report.export':
    case 'report:export':
    case 'ai.report':
    case 'evidence.export':
      return 'report:export'
    case 'redteam.run':
    case 'pentest:run':
    case 'ai.redteam.plan':
      return 'pentest:run'
    case 'darkweb.monitor':
    case 'darkweb:monitor':
      return 'darkweb:monitor'
    case 'ai.chat':
    case 'ai.fix':
    case 'ai.agent_tool.call':
    case 'ai.workflow_mcp.call':
      return 'autofix:open_pr'
    default:
      return undefined
  }
}

function previewActionAccess(
  action: string,
  access: ActionAccess | undefined,
  permissions: Set<string>,
): ActionAccess | undefined {
  if (!access || access.state === 'blocked') return access
  if (access.state === 'payment_required') {
    const requiredAction = access.required_action ?? previewRequiredAction(action)
    if (requiredAction && !permissions.has(requiredAction)) {
      return {
        ...access,
        state: 'blocked',
        billing_behavior: 'blocked',
        required_action: requiredAction,
        reason: 'The current role is not allowed to use this preview action.',
      }
    }
    return {
      ...access,
      state: 'allowed',
      billing_behavior: 'included',
      reason: access.reason ?? 'Billing is disabled during preview.',
    }
  }
  if (isPaidBillingBehavior(access.billing_behavior)) {
    return {
      ...access,
      state: 'allowed',
      billing_behavior: 'included',
      reason: access.reason ?? 'Billing is disabled during preview.',
    }
  }
  return access
}

export interface CapabilityHelpers extends Partial<Capabilities> {
  /** True once the backend has responded successfully. Use this to
   *  defer rendering optional UI until we know what's permitted. */
  ready: boolean
  /** Raw query state — useful when the consumer wants to show a
   *  spinner / error toast instead of an empty render. */
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => void

  /** Is the given UI page id permitted? Page ids match the keys in
   *  `internal/permission/capabilities.yaml.pages`. */
  canSeePage: (page: string) => boolean
  /** Can the page route be opened? Locked-preview pages are openable,
   *  but their primary actions stay disabled by action gates. */
  canOpenPage: (page: string) => boolean
  /** Commercial page state from the backend. */
  pageState: (page: string) => PageAccess
  /** SaaS product surface state from the backend. */
  surfaceState: (surface: string) => SurfaceAccess
  /** Is the sellable product surface enabled for this org? */
  canUseSurface: (surface: string) => boolean
  /** Does the backend say this product surface is hidden in the active edition? */
  isSurfaceHidden: (surface: string) => boolean
  /** Is the given action permitted for this role+org? Actions use
   *  the `<resource>:<action>` convention (e.g. `pentest:run`). */
  canDoAction: (action: string) => boolean
  /** Is the action actually executable after RBAC + commercial gates? */
  canUseAction: (action: string) => boolean
  /** Does the active edition declare this action unsupported? */
  isActionUnsupported: (action: string) => boolean
  /** Commercial action state from the backend, if the action is paywalled. */
  actionAccess: (action: string) => ActionAccess | undefined
  /** Paywall copy keyed by page/action paywall_key. */
  paywallFor: (key?: string) => Paywall | undefined
  /** Check the active edition without hardcoding plan/provider logic in views. */
  isEdition: (edition: string) => boolean
  /** Read the provider selected by the backend edition profile. */
  providerFor: (provider: keyof EditionProviders) => string | undefined
  /** Is the org entitled to the given feature flag? Useful for
   *  marketing copy ("upgrade to unlock X") without separately
   *  checking visible_pages. */
  hasFeature: (feature: string) => boolean
}

export function useCapabilities(orgId: string | undefined): CapabilityHelpers {
  const q = useQuery({
    queryKey: qk.platform.capabilities(orgId),
    queryFn: () => getMyCapabilities(orgId!),
    enabled: !!orgId,
    // Capabilities change only when an admin edits plan/role; once a
    // minute is more than enough freshness and avoids hammering the
    // engine on every navigation.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  return useMemo<CapabilityHelpers>(() => {
    const c = q.data
    const ready = !!c && !q.isError
    const pageSet = new Set(c?.visible_pages ?? [])
    const permSet = new Set(c?.permissions ?? [])
    const featureSet = new Set(c?.features ?? [])
    const hiddenSurfaceSet = new Set(c?.hidden_surfaces ?? [])
    const unsupportedActionSet = new Set(c?.unsupported_actions ?? [])
    const pageStates = c?.page_states ?? {}
    const surfaces = c?.surfaces ?? {}
    const commercialActions = c?.actions ?? {}
    const paywalls = c?.paywalls ?? {}
    const billingPreview = c?.billing_mode === 'preview'
    const pageAccess = (page: string): PageAccess => {
      const access = pageStates[page] ?? (pageSet.has(page) ? { state: 'enabled' as const } : HIDDEN_PAGE)
      return billingPreview ? previewPageAccess(access) : access
    }
    const surfaceAccess = (surface: string): SurfaceAccess => {
      const access = surfaces[surface] ?? HIDDEN_SURFACE
      return billingPreview ? previewSurfaceAccess(access) : access
    }
    const actionAccess = (action: string): ActionAccess | undefined => {
      const access = commercialActions[action]
      return billingPreview ? previewActionAccess(action, access, permSet) : access
    }
    // Fail closed until the backend capability snapshot is known. The
    // backend remains the security boundary, but the frontend must not
    // flash or enable UI for a page/action that may be outside the
    // current org's product or role contract.
    return {
      ...c,
      ready,
      isLoading: q.isLoading || (q.isFetching && !c),
      isError: q.isError,
      error: q.error,
      refetch: () => { void q.refetch() },
      pageState: (page: string) => {
        if (!ready) return HIDDEN_PAGE
        return pageAccess(page)
      },
      surfaceState: (surface: string) => {
        if (!ready) return HIDDEN_SURFACE
        return surfaceAccess(surface)
      },
      canUseSurface: (surface: string) => {
        if (!ready) return false
        return surfaceAccess(surface).state === 'enabled'
      },
      isSurfaceHidden: (surface: string) => {
        if (!ready) return true
        return hiddenSurfaceSet.has(surface) || surfaceAccess(surface).state === 'hidden'
      },
      canSeePage: (page: string) => {
        if (!ready) return false
        return pageAccess(page).state === 'enabled'
      },
      canOpenPage: (page: string) => {
        if (!ready) return false
        const state = pageAccess(page).state
        return state === 'enabled' || state === 'locked_preview'
      },
      canDoAction: (action: string) => (ready ? permSet.has(action) : false),
      actionAccess: (action: string) => (ready ? actionAccess(action) : undefined),
      canUseAction: (action: string) => {
        if (!ready) return false
        if (unsupportedActionSet.has(action)) return false
        const commercial = actionAccess(action)
        if (commercial) return commercial.state === 'allowed'
        return permSet.has(action)
      },
      isActionUnsupported: (action: string) => {
        if (!ready) return true
        return unsupportedActionSet.has(action) || actionAccess(action)?.state === 'blocked'
      },
      paywallFor: (key?: string) => (ready && key && !billingPreview ? paywalls[key] : undefined),
      isEdition: (edition: string) => (ready ? c?.edition === edition : false),
      providerFor: (provider: keyof EditionProviders) => (ready ? c?.providers?.[provider] : undefined),
      hasFeature: (feature: string) => (ready ? featureSet.has(feature) : false),
    }
  }, [q.data, q.isError, q.isFetching, q.isLoading, q.refetch])
}
