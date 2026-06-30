/**
 * GatedButton / GatedIconButton — action-level RBAC at the UI layer.
 *
 * The frontend twin of FeatureGate: where FeatureGate gates a *route* on
 * a page id, these gate a *control* on a `<resource>:<action>` permission
 * from the backend capability snapshot (GET /me/capabilities). Drop-in
 * replacements for MUI <Button> / <IconButton> — add one `action` prop:
 *
 *   <GatedButton action="org:delete" color="error" onClick={del}>Delete</GatedButton>
 *   <GatedIconButton action="member:remove" onClick={kick}><Trash2/></GatedIconButton>
 *
 * Behaviour when the role lacks the permission:
 *   - default: render disabled + a tooltip explaining why (discoverable,
 *     but blocked — best for admin/destructive actions the user should
 *     know exist).
 *   - hideWhenDenied: render nothing only after the capability snapshot
 *     resolves (best for actions that would be noise to a read-only user).
 *
 * This is presentation only. The backend enforces every mutation
 * per-endpoint (403 action_required) — the gate here is UX, never the
 * security boundary. While capabilities are loading or on fetch error,
 * canDoAction fails closed (see useCapabilities), so controls stay
 * disabled/hidden until the backend snapshot verifies the action.
 *
 * Org context is read from the route (:orgId), same as FeatureGate, so
 * the only required prop beyond the underlying control's is `action`.
 */
import { useParams } from 'react-router'
import Button, { type ButtonProps } from '@mui/material/Button'
import IconButton, { type IconButtonProps } from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Box from '@mui/material/Box'
import type { ReactElement } from 'react'
import { useCapabilities } from '@hooks/useCapabilities'
import { useProjectCapabilities } from '@hooks/useProjectCapabilities'
import { t } from '@lib/i18n';

/** Resolve whether the current user may perform `action` in the active
 *  org. Empty/undefined action = always allowed (no gate). Use directly
 *  for non-button controls (menu items, switches). */
export function useActionAllowed(action?: string): boolean {
  const { orgId } = useParams<{ orgId: string }>()
  const caps = useCapabilities(orgId)
  const projectCaps = useProjectCapabilities(orgId)
  if (!action) return true
  return (caps.canUseAction?.(action) ?? caps.canDoAction(action)) && projectCaps.canUseAction(action)
}

function useActionGate(action?: string): { ready: boolean; allowed: boolean; reason: string } {
  const { orgId } = useParams<{ orgId: string }>()
  const caps = useCapabilities(orgId)
  const projectCaps = useProjectCapabilities(orgId)
  if (!action) return { ready: true, allowed: true, reason: '' }
  const access = caps.actionAccess?.(action)
  const projectAccess = projectCaps.actionAccess(action)
  const orgAllowed = caps.canUseAction?.(action) ?? caps.canDoAction(action)
  const projectAllowed = projectCaps.canUseAction(action)
  const ready = caps.ready && projectCaps.ready
  return {
    ready,
    allowed: orgAllowed && projectAllowed,
    reason: ready
      ? (!orgAllowed ? access?.reason : projectAccess?.reason) || t('access.actionDenied')
      : t('access.actionChecking'),
  }
}

// Omit MUI's own `action` (a Ref<ButtonBaseActions>) so our permission
// string can own the prop name without a type collision.
export type GatedButtonProps = Omit<ButtonProps, 'action'> & {
  /** `<resource>:<action>` permission required to use this control. */
  action: string
  /** Render nothing (instead of disabled+tooltip) when denied. */
  hideWhenDenied?: boolean
}

export function GatedButton({ action, hideWhenDenied, disabled, ...rest }: GatedButtonProps) {
  const { ready, allowed, reason } = useActionGate(action)
  if (ready && !allowed && hideWhenDenied) return null
  const btn = <Button {...rest} disabled={disabled || !allowed} />
  if (allowed) return btn
  // Disabled MUI buttons swallow hover events; wrap so the tooltip shows.
  return (
    <Tooltip title={reason}>
      <Box component="span" sx={{ display: 'inline-flex' }}>{btn}</Box>
    </Tooltip>
  )
}

export type GatedIconButtonProps = Omit<IconButtonProps, 'action'> & {
  action: string
  hideWhenDenied?: boolean
}

export function GatedIconButton({ action, hideWhenDenied, disabled, title, ...rest }: GatedIconButtonProps) {
  const { ready, allowed, reason } = useActionGate(action)
  if (ready && !allowed && hideWhenDenied) return null
  const accessibleLabel = rest['aria-label'] ?? title ?? action
  const btn = <IconButton {...rest} title={title ?? String(accessibleLabel)} aria-label={String(accessibleLabel)} disabled={disabled || !allowed} />
  if (allowed) return btn
  return (
    <Tooltip title={reason}>
      <Box component="span" sx={{ display: 'inline-flex' }}>{btn}</Box>
    </Tooltip>
  )
}

/** ActionGate — wrap arbitrary children; render them only when the
 *  action is permitted (no disabled state, just show/hide). For
 *  non-button UI that has no natural disabled affordance. */
export function ActionGate({ action, children }: { action: string; children: ReactElement }) {
  const allowed = useActionAllowed(action)
  return allowed ? children : null
}
