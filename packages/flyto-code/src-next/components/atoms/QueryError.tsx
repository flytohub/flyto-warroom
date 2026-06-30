/**
 * QueryError — uniform error UI for failed react-query loads.
 *
 * Before: every page rendered `'Failed to load data'` for isError,
 * regardless of whether the cause was an expired token, a 500 from
 * the engine, or a network blip. Operators couldn't tell "I need to
 * re-auth" from "the engine is down" from "my wifi flapped".
 *
 * After: this atom parses the thrown Error and surfaces a category-
 * specific message + a Retry button that re-runs the underlying
 * useQuery. Three categories:
 *
 *   - **auth** (401/"not authenticated") → "Session expired" +
 *     "Sign in again" CTA that links to /login.
 *   - **blocked** (403) → actionable permission / plan / DNS / consent detail.
 *   - **notFound** (404) → "We could not find that data" — usually
 *     means the org id doesn't exist or the resource was deleted.
 *   - **server** (5xx) → "Engine error" with the upstream message.
 *   - **network** (TypeError "Failed to fetch", timeout) → "Network
 *     unavailable" + offline hint.
 *   - **unknown** → falls back to the error message itself.
 *
 * Usage:
 *
 *   const { data, isError, error, refetch } = useQuery({ ... })
 *   if (isError) return <QueryError error={error} onRetry={refetch} />
 *
 * Pair with `compact` for inline use inside cards or tabs where a
 * full-page error would crowd siblings.
 */

import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import { AlertTriangle, KeyRound, ServerCrash, WifiOff, Search } from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import { describeEngineError } from '@lib/engine/errors'
import { colors, softBg } from '@/styles/designTokens'

type Category = 'auth' | 'blocked' | 'notFound' | 'server' | 'network' | 'unknown'

function classify(err: unknown): { category: Category; raw: string; title?: string; description?: string } {
  const display = describeEngineError(err)
  if (typeof display.status === 'number') {
    if (display.status === 401) {
      return { category: 'auth', raw: display.message }
    }
    if (display.status === 403) {
      return {
        category: 'blocked',
        raw: display.message,
        title: display.title,
        description: display.description,
      }
    }
    if (display.status === 404) {
      return { category: 'notFound', raw: display.message }
    }
    if (display.status >= 500) {
      return { category: 'server', raw: display.message }
    }
    return { category: 'unknown', raw: display.message, title: display.title, description: display.description }
  }
  const raw = (err instanceof Error ? err.message : String(err ?? '')).trim()
  const lower = raw.toLowerCase()

  // Auth — engine wraps these as "401 ..." or "Not authenticated".
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('not authenticated')) {
    return { category: 'auth', raw }
  }
  if (lower.includes('403') || lower.includes('forbidden')) {
    return { category: 'blocked', raw }
  }
  if (lower.includes('404') || lower.includes('not found')) {
    return { category: 'notFound', raw }
  }
  // 5xx — engine error, generally fixable by retry but tell the user.
  if (/^5\d\d/.test(raw) || lower.includes('500') || lower.includes('502')
      || lower.includes('503') || lower.includes('504')
      || lower.includes('internal server error')) {
    return { category: 'server', raw }
  }
  if (lower.includes('failed to fetch') || lower.includes('network')
      || lower.includes('timeout') || lower.includes('econnrefused')
      || lower.includes('aborted')) {
    return { category: 'network', raw }
  }
  return { category: 'unknown', raw }
}

export interface QueryErrorProps {
  /** The Error caught by react-query (`error` from useQuery). */
  error: unknown
  /** Click handler for the Retry button. Pass `refetch` from useQuery. */
  onRetry?: () => void
  /** Compact (inline) variant — single-line Alert with no icon block.
   *  Use inside cards / tabs where vertical space is scarce. */
  compact?: boolean
  /** Optional override label for the resource that failed to load.
   *  Threaded into the message: "Failed to load {label}". */
  label?: string
}

export function QueryError({ error, onRetry, compact = false, label }: QueryErrorProps) {
  const { category, raw, title, description } = classify(error)

  const baseCopy = getCopy(category, label, { title, description })
  const copy = compact && category === 'unknown' && label
    ? { ...baseCopy, title: label }
    : baseCopy
  const goToLogin = () => {
    window.location.assign('/login')
  }

  if (compact) {
    return (
      <Alert
        severity={copy.severity}
        variant="outlined"
        action={
          <Stack direction="row" spacing={1}>
            {category === 'auth' && (
              <Button color="inherit" size="small" onClick={goToLogin}>
                {t('queryError.signIn')}
              </Button>
            )}
            {onRetry && (
              <Button color="inherit" size="small" onClick={onRetry}>
                {t('queryError.retry')}
              </Button>
            )}
          </Stack>
        }
        sx={{ alignItems: 'center' }}
      >
        <strong>{copy.title}</strong> — {copy.description}
        {category === 'unknown' && raw && (
          <Box component="span" sx={{ ml: 1, fontFamily: 'monospace', fontSize: 12, opacity: 0.7 }}>
            ({raw})
          </Box>
        )}
      </Alert>
    )
  }

  const Icon = copy.icon
  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', textAlign: 'center', py: 8, px: 3, gap: 2,
    }}>
      <Box sx={{
        width: 56, height: 56, borderRadius: 2,
        bgcolor: copy.iconBg,
        color: copy.iconColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        mb: 1,
      }}>
        <Icon size={28} />
      </Box>
      <Typography variant="h6" fontWeight={700} className="tracking-tight">
        {copy.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 480 }}>
        {copy.description}
      </Typography>
      {/* Reveal the raw upstream message — operators (and oncall) need
          this to grep logs. Hidden under a small monospace block so it
          doesn't dominate the visual hierarchy. */}
      {raw && raw !== copy.description && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            fontFamily: 'monospace',
            mt: 0.5,
            maxWidth: 520,
            wordBreak: 'break-word',
          }}
        >
          {raw}
        </Typography>
      )}
      <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
        {category === 'auth' && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<KeyRound size={16} />}
            onClick={goToLogin}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, px: 3 }}
          >
            {t('queryError.signIn')}
          </Button>
        )}
        {onRetry && (
          <Button
            variant={category === 'auth' ? 'outlined' : 'contained'}
            color="primary"
            onClick={onRetry}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, px: 3 }}
          >
            {t('queryError.retry')}
          </Button>
        )}
      </Stack>
    </Box>
  )
}

function getCopy(category: Category, label?: string, overrides?: { title?: string; description?: string }) {
  const what = label ?? t('queryError.theData')
  switch (category) {
    case 'auth':
      return {
        severity: 'warning' as const,
        icon: KeyRound,
        iconBg: softBg(colors.severity.medium),
        iconColor: colors.severity.medium,
        title: t('queryError.authTitle'),
        description: t('queryError.authDesc'),
      }
    case 'notFound':
      return {
        severity: 'info' as const,
        icon: Search,
        iconBg: softBg(colors.semantic.neutral),
        iconColor: colors.semantic.neutral,
        title: t('queryError.notFoundTitle'),
        description: tOr('queryError.notFoundDesc',
          `We could not find ${what}. It may have been deleted or moved.`).replace('{what}', what),
      }
    case 'blocked':
      return {
        severity: 'warning' as const,
        icon: AlertTriangle,
        iconBg: softBg(colors.severity.medium),
        iconColor: colors.severity.medium,
        title: overrides?.title ?? t('queryError.blockedTitle'),
        description: overrides?.description ?? t('queryError.blockedDesc'),
      }
    case 'server':
      return {
        severity: 'error' as const,
        icon: ServerCrash,
        iconBg: softBg(colors.semantic.danger),
        iconColor: colors.semantic.danger,
        title: t('queryError.serverTitle'),
        description: t('queryError.serverDesc'),
      }
    case 'network':
      return {
        severity: 'warning' as const,
        icon: WifiOff,
        iconBg: softBg(colors.severity.medium),
        iconColor: colors.severity.medium,
        title: t('queryError.networkTitle'),
        description: t('queryError.networkDesc'),
      }
    case 'unknown':
    default:
      return {
        severity: 'error' as const,
        icon: AlertTriangle,
        iconBg: softBg(colors.semantic.danger),
        iconColor: colors.semantic.danger,
        title: t('queryError.unknownTitle'),
        description: tOr('queryError.unknownDesc',
          `Could not load ${what}. The original error is shown below — Retry usually works.`).replace('{what}', what),
      }
  }
}
