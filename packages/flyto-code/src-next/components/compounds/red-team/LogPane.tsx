import { useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { TerminalSquare } from 'lucide-react'
import { t } from '@lib/i18n';
import type { LogLine } from './shared'
import { RedTeamEmptyState } from './RedTeamEmptyState'
import styles from './RedTeamView.module.css'

export function LogPane({
  log, empty, loading, cmdHost, round,
}: {
  log: LogLine[]
  empty: boolean
  loading: boolean
  cmdHost?: string | null
  round?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [log.length])

  return (
    <Paper
      variant="outlined"
      className={`${styles.scanlines} ${styles.crt} ${styles.glassPanel}`}
      sx={{
        flex: 1, borderRadius: 'var(--flyto-radius-lg)',
        borderColor: 'divider', borderLeft: '2px solid var(--rt-ok)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 180,
        position: 'relative',
        ['--rt-accent' as string]: 'var(--rt-ok)',
      }}
    >
      <Box className={`${styles.aboveDecoration} ${styles.panelHeader}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <TerminalSquare size={16} color="var(--rt-ok)" />
        <Typography variant="body2" sx={{ fontWeight: 700, letterSpacing: 0.5, color: 'text.secondary', textTransform: 'uppercase', fontFamily: 'var(--flyto-font-mono)' }}>
          {t('warroom.redTeamLog')}
        </Typography>
        <Chip label={log.length} size="small" sx={{ height: 20, fontSize: 13, bgcolor: 'action.hover', color: 'text.secondary' }} />
      </Box>
      <Box
        ref={ref}
        className={styles.aboveDecoration}
        sx={{ flex: 1, overflow: 'auto', px: 2, py: 1.5, fontFamily: 'var(--flyto-font-mono)', fontSize: 12, lineHeight: 1.9 }}
      >
        {/* Command-echo header — cosmetic but data-true. */}
        {!empty && cmdHost && (
          <Box sx={{ display: 'flex', gap: 1, color: 'var(--rt-ready)', whiteSpace: 'nowrap', mb: 0.5 }}>
            <Box component="span" sx={{ color: 'var(--rt-ok)', flexShrink: 0 }}>{'>'}</Box>
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t('warroom.rt.cmdEcho')
                .replace('{host}', cmdHost)
                .replace('{round}', String(round ?? 0))}
              <Box component="span" className={styles.cursor} sx={{ color: 'var(--rt-ok)' }} />
            </Box>
          </Box>
        )}
        {empty && (
          <>
            <RedTeamEmptyState
              icon={TerminalSquare}
              accent="var(--rt-recon)"
              dense
              size={40}
              title={t('warroom.rt.logEmptyTitle')}
              body={t('warroom.rt.logEmptyBody')}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'var(--flyto-font-mono)' }}>
              $ {t('warroom.redTeamLogAwait')}
              <Box component="span" className={styles.cursor} sx={{ color: 'text.secondary' }} />
            </Typography>
          </>
        )}
        {!empty && log.length === 0 && (
          <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'var(--flyto-font-mono)' }}>
            $ {loading ? t('warroom.redTeamLogDispatching') : t('warroom.redTeamLogNoEvents')}
            <Box component="span" className={styles.cursor} sx={{ color: 'text.secondary' }} />
          </Typography>
        )}
        {log.map((l, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1, color: l.color, whiteSpace: 'nowrap' }}>
            <Box component="span" sx={{ color: 'text.secondary', flexShrink: 0 }}>{l.time}</Box>
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.text}</Box>
          </Box>
        ))}
      </Box>
    </Paper>
  )
}
