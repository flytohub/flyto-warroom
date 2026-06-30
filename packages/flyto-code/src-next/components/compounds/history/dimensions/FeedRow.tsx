import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { Clock, ArrowUp, ArrowDown, ShieldAlert, AlertOctagon, Globe, ArrowUpRight } from 'lucide-react'
import type { FeedItem, FeedReason } from '@lib/engine'
import { KIND_COLOR, KIND_ICON, SEV_BG, formatTimestamp } from './shared'
import { variantForKind, sectionIdFor, type HistoryVariant } from '../useHistoryFilters'
import { t } from '@lib/i18n';


// FeedRow — single row in the detailed timeline. Renders the kind
// chip, optional severity chip, score delta arrow (score kind only),
// SLA-breach treatment (red rail dot + sub-line stating the SLA hours),
// title, summary, score-reason captions, and timestamp + pillar tag.
//
// Optional callbacks (added 2026-05-17 with the 4-page split):
//   currentVariant            — which view is hosting this row
//   onSetDomain(domain)       — clicking the domain chip narrows filter
//   onNavigateToOtherPillar(sectionId) — score reason that belongs
//      to the OTHER pillar shows a small "→ jump there" button

interface FeedRowProps {
  item: FeedItem
  currentVariant?: HistoryVariant
  onSetDomain?: (domain: string) => void
  onNavigateToOtherPillar?: (sectionId: string) => void
}

export function FeedRow({
  item,
  currentVariant,
  onSetDomain,
  onNavigateToOtherPillar,
}: FeedRowProps) {
  const isSLA = item.kind === 'sla_breach'
  const color = isSLA ? '#ef4444' : KIND_COLOR[item.kind] ?? '#94a3b8'
  const Icon = isSLA ? AlertOctagon : (KIND_ICON[item.kind] ?? Clock)
  const delta = typeof item.payload?.delta === 'number' ? (item.payload.delta as number) : 0
  const reasons = (item.payload?.reasons ?? []) as FeedReason[]
  const slaHours = typeof item.payload?.sla_hours === 'number' ? (item.payload.sla_hours as number) : 0
  const originalSeverity = item.payload?.original_severity as string | undefined

  return (
    <Box sx={{ position: 'relative', mb: 2.5, pb: 0.5 }}>
      <Box
        sx={{
          position: 'absolute',
          left: -26, top: 2,
          width: 22, height: 22, borderRadius: '50%',
          bgcolor: 'var(--mantine-color-dark-7, #0f172a)',
          border: `2px solid ${color}`,
          display: 'grid', placeItems: 'center',
          color,
          // SLA breaches pulse subtly so they stand out at a glance in
          // a long timeline. Other kinds stay static.
          ...(isSLA && { boxShadow: `0 0 0 0 ${color}66`, animation: 'sla-pulse 2.4s ease-out infinite' }),
        }}
        aria-hidden
      >
        <Icon size={11} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2" fontWeight={600} sx={isSLA ? { color: '#ef4444' } : undefined}>
          {item.title}
        </Typography>
        <Chip
          label={item.kind === 'sla_breach' ? 'SLA' : item.kind}
          size="small"
          sx={{
            height: 18, fontSize: 12, fontWeight: 600,
            bgcolor: color + '20', color, textTransform: 'uppercase',
          }}
        />
        {item.severity && !isSLA && (
          <Chip
            label={item.severity}
            size="small"
            sx={{
              height: 18, fontSize: 12, fontWeight: 600,
              bgcolor: SEV_BG[item.severity] || '#94a3b820',
              color: SEV_BG[item.severity]?.replace('20', '') || '#94a3b8',
            }}
          />
        )}
        {isSLA && originalSeverity && (
          <Chip
            label={`${originalSeverity} · ${slaHours}h SLA`}
            size="small"
            sx={{
              height: 18, fontSize: 12, fontWeight: 600,
              bgcolor: '#ef444420', color: '#ef4444',
            }}
          />
        )}
        {item.kind === 'score' && delta !== 0 && (
          <Chip
            icon={delta > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
            label={`${delta > 0 ? '+' : ''}${delta}`}
            size="small"
            sx={{
              height: 18, fontSize: 12,
              bgcolor: delta > 0 ? '#22c55e22' : '#ef444422',
              color: delta > 0 ? '#22c55e' : '#ef4444',
            }}
          />
        )}
        {item.domain && (
          <Chip
            icon={<Globe size={10} />}
            label={item.domain}
            size="small"
            variant="outlined"
            // Clicking the domain chip narrows the filter on the
            // parent view to that domain — fastest path to "show me
            // this asset's history".
            onClick={onSetDomain ? () => onSetDomain(item.domain!) : undefined}
            sx={{
              height: 18, fontSize: 12,
              borderColor: 'rgba(148,163,184,0.3)',
              color: 'var(--color-text-secondary)',
              cursor: onSetDomain ? 'pointer' : 'default',
              '&:hover': onSetDomain ? {
                borderColor: 'var(--exp-accent)',
                color: 'var(--exp-accent)',
              } : undefined,
            }}
          />
        )}
      </Box>
      {item.summary && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
          {item.summary}
        </Typography>
      )}
      {/* Score reason captions — top-3 nearby alert/asset events.
          Renders only when the engine attached `payload.reasons`.
          Reasons belonging to the OTHER pillar surface a cross-link
          button so the auditor can jump straight to that pillar's
          timeline rather than re-typing filters. */}
      {reasons.length > 0 && (
        <Box sx={{ mt: 0.5, pl: 1, borderLeft: '2px solid rgba(167,139,250,0.3)' }}>
          {reasons.map((r, i) => {
            const reasonVariant = variantForKind(r.kind)
            const isCrossPillar = reasonVariant && currentVariant && reasonVariant !== currentVariant
            return (
              <Box
                key={i}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.5,
                  fontSize: 12.5, lineHeight: 1.4,
                  color: 'var(--color-text-tertiary)',
                }}
              >
                <Typography variant="caption" sx={{ fontSize: 'inherit', lineHeight: 'inherit', flex: '0 1 auto', minWidth: 0 }}>
	                  ↳ {r.kind === 'sla_breach' ? t('hardcoded.sla.c33348f4') : ''}
                  {r.title}
                  {r.severity && r.kind !== 'sla_breach' ? ` (${r.severity})` : ''}
                </Typography>
                {isCrossPillar && reasonVariant && onNavigateToOtherPillar && (
                  <button
                    type="button"
                    onClick={() => onNavigateToOtherPillar(sectionIdFor(reasonVariant, 'timeline'))}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 2,
                      padding: '0 4px',
                      background: 'transparent',
                      border: '1px solid rgba(167,139,250,0.3)',
                      borderRadius: 4,
                      color: 'var(--exp-accent)',
                      fontSize: 12.5,
                      cursor: 'pointer',
                      lineHeight: 1.4,
                    }}
	                    title={`${t('common.jumpTo')} ${reasonVariant === 'audit' ? t('hardcoded.audit.timeline.code.activity.258e8291') : t('history.codeActivityTitle')}`}
                  >
                    {reasonVariant === 'audit' ? 'audit' : 'code'}
                    <ArrowUpRight size={9} />
                  </button>
                )}
              </Box>
            )
          })}
        </Box>
      )}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}
      >
        <Clock size={10} /> {formatTimestamp(item.recorded_at)}
        {item.pillar && (
          <>
            {' · '}
            <ShieldAlert size={10} /> {item.pillar.toUpperCase()}
          </>
        )}
      </Typography>
    </Box>
  )
}

// Inject the SLA pulse keyframes once at module scope. Cheap, runs
// in module init, no React lifecycle dependency.
if (typeof document !== 'undefined' && !document.getElementById('sla-pulse-keyframes')) {
  const style = document.createElement('style')
  style.id = 'sla-pulse-keyframes'
  style.textContent = `
    @keyframes sla-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.45); }
      70%  { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
      100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
    }
  `
  document.head.appendChild(style)
}
