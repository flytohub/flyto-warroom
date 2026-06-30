/**
 * RolesAccessTab — Settings -> Roles & Access (the permissions view).
 *
 * Surfaces the backend's resolved capability snapshot
 * (GET /me/capabilities) so a user/admin can SEE: their role, plan, tier
 * and project type; exactly which actions they can perform (resolved
 * permissions, grouped by resource); which features are on; capacity
 * caps; and a reference of what each role can do. The frontend already
 * gates nav/routes on capabilities — this makes the model visible.
 *
 * Read-only: it shows what the backend resolved. Editing roles lives in
 * the Members tab.
 */
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { ShieldCheck, Check, Minus, Crown } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { useCapabilities } from '@hooks/useCapabilities'
import { t, tOr } from '@lib/i18n';
import { LoadingState } from '@atoms/LoadingState'

const BRAND = '#7c3aed'

const ROLE_REF: Array<{ id: string; label: string; fallback: string }> = [
  { id: 'owner', label: 'rolesAccess.roleDesc.owner', fallback: 'Full control — billing, transfer & delete the org, plus every admin power.' },
  { id: 'admin', label: 'rolesAccess.roleDesc.admin', fallback: 'Manage members, settings, scans, pentests, autofix, budgets & sensitive evidence.' },
  { id: 'member', label: 'rolesAccess.roleDesc.member', fallback: 'Trigger scans, change issue status, request pentests, assess vendors.' },
  { id: 'viewer', label: 'rolesAccess.roleDesc.viewer', fallback: 'Read-only — view reports, scores, findings and the audit log.' },
  { id: 'guest', label: 'rolesAccess.roleDesc.guest', fallback: 'Minimal read access to public resources.' },
]

function titleCase(s: string): string {
  return s.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function cap(n: number | undefined): string {
  if (n === undefined) return '—'
  return n < 0 ? t('rolesAccess.unlimited') : String(n)
}

export function RolesAccessTab() {
  const { org } = useOrg()
  const caps = useCapabilities(org?.id)

  if (caps.isLoading) {
    return <LoadingState variant="spinner" py={8} />
  }

  // Group resolved permissions by their `<resource>:<action>` prefix.
  const groups = new Map<string, string[]>()
  for (const p of caps.permissions ?? []) {
    const [res, action] = p.includes(':') ? [p.slice(0, p.indexOf(':')), p.slice(p.indexOf(':') + 1)] : ['other', p]
    if (!groups.has(res)) groups.set(res, [])
    groups.get(res)!.push(action)
  }
  const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  const myRole = caps.role ?? org?.role ?? 'member'

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Your access */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <ShieldCheck size={16} style={{ color: BRAND }} />
          <Typography variant="subtitle2" fontWeight={700}>{t('rolesAccess.yourAccess')}</Typography>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Chip size="small" icon={<Crown size={13} />} label={`${t('rolesAccess.role')}: ${titleCase(myRole)}`} sx={{ bgcolor: `${BRAND}18`, color: BRAND, fontWeight: 700 }} />
          {caps.plan && <Chip size="small" variant="outlined" label={`${t('rolesAccess.plan')}: ${titleCase(caps.plan)}`} />}
          {caps.tier && <Chip size="small" variant="outlined" label={`${t('rolesAccess.tier')}: ${titleCase(caps.tier)}`} />}
        </Box>
        <Box sx={{ display: 'flex', gap: 3, mt: 2, flexWrap: 'wrap' }}>
          <Stat label={t('rolesAccess.seats')} value={cap(caps.seat_cap)} />
          <Stat label={t('rolesAccess.repos')} value={cap(caps.repo_cap)} />
          <Stat label={t('rolesAccess.domains')} value={cap(caps.domain_cap)} />
        </Box>
      </Paper>

      {/* What you can do — resolved permissions, grouped */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2.5 }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>{t('rolesAccess.canDo')}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
          {t('rolesAccess.canDoHint')}
        </Typography>
        {sortedGroups.length === 0 ? (
          <Typography variant="body2" color="text.secondary">{t('rolesAccess.readOnly')}</Typography>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
            {sortedGroups.map(([res, actions]) => (
              <Box key={res}>
                <Typography variant="caption" fontWeight={700} sx={{ color: BRAND, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{titleCase(res)}</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                  {actions.sort().map((a) => (
                    <Chip key={a} size="small" label={a.replace(/_/g, ' ')} sx={{ height: 22, fontSize: 12, bgcolor: 'action.hover' }} />
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Paper>

      {/* Roles reference — the matrix at a glance */}
      <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
        <Box sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle2" fontWeight={700}>{t('rolesAccess.rolesRef')}</Typography>
        </Box>
        {ROLE_REF.map((r, i) => {
          const isMine = r.id === myRole
          return (
            <Box key={r.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 2.5, py: 1.5, borderTop: i === 0 ? 0 : 1, borderColor: 'divider', bgcolor: isMine ? `${BRAND}0d` : 'transparent' }}>
              <Box sx={{ minWidth: 120, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                {isMine ? <Check size={14} style={{ color: BRAND }} /> : <Minus size={14} style={{ opacity: 0.3 }} />}
                <Typography variant="body2" fontWeight={isMine ? 700 : 600} sx={{ color: isMine ? BRAND : 'text.primary' }}>{titleCase(r.id)}</Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1, lineHeight: 1.45 }}>{tOr(r.label, r.fallback)}</Typography>
            </Box>
          )
        })}
        <Box sx={{ px: 2.5, py: 1, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary">
            {t('rolesAccess.changeHint')}
          </Typography>
        </Box>
      </Paper>
    </Box>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{label}</Typography>
      <Typography variant="h6" fontWeight={700}>{value}</Typography>
    </Box>
  )
}
