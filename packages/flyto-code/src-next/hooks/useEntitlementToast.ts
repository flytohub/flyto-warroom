import { useEffect } from 'react'
import { useSnackbar } from 'notistack'
import type { EntitlementDeniedDetail } from '@lib/engine/client'

/**
 * useEntitlementToast — global listener for `flyto:entitlement-denied`
 * events emitted by the engine client when a 403 response carries a
 * capability error code (feature_required / action_required /
 * *_cap_exceeded). Renders a snackbar with the most actionable copy
 * for each case.
 *
 * Mount this hook once at the app root (App.tsx or a top-level
 * provider) so every API failure routes through one place.
 */
export function useEntitlementToast() {
  const { enqueueSnackbar } = useSnackbar()

  useEffect(() => {
    function onDenied(ev: Event) {
      const detail = (ev as CustomEvent<EntitlementDeniedDetail>).detail
      if (!detail) return

      const { kind, feature, action, cap, current, plan } = detail
      let msg: string
      switch (kind) {
        case 'feature_required':
          msg = `Upgrade required: ${feature ?? 'this feature'} is not in your current plan.`
          break
        case 'action_required':
          msg = `Your role can't ${action ?? 'perform this action'}. Ask an admin.`
          break
        case 'seat_cap_exceeded':
          msg = `Seat limit reached (${current}/${cap} on the ${plan ?? 'current'} plan).`
          break
        case 'repo_cap_exceeded':
          msg = `Repository limit reached (${current}/${cap} on the ${plan ?? 'current'} plan).`
          break
        case 'domain_cap_exceeded':
          msg = `Domain limit reached (${current}/${cap} on the ${plan ?? 'current'} plan).`
          break
        default:
          return
      }
      enqueueSnackbar(msg, { variant: 'warning', autoHideDuration: 6000 })
    }

    window.addEventListener('flyto:entitlement-denied', onDenied)
    return () => window.removeEventListener('flyto:entitlement-denied', onDenied)
  }, [enqueueSnackbar])
}

export default useEntitlementToast
