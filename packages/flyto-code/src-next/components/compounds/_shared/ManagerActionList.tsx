import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { severityColor } from './chartTheme'
import type { Severity } from '@lib/tokens/severity'

export interface ManagerActionItem {
  id: string
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  value?: ReactNode
  severity?: Severity
}

export interface ManagerActionListProps {
  title: ReactNode
  subtitle?: ReactNode
  items: ManagerActionItem[]
  emptyText?: ReactNode
  actionLabel?: ReactNode
}

export function ManagerActionList({
  title,
  subtitle,
  items,
  emptyText = 'Nothing needs attention',
  actionLabel = 'Review',
}: ManagerActionListProps) {
  const theme = useTheme()

  return (
    <Card
      sx={{
        p: 2,
        borderRadius: 1,
        border: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
        boxShadow: 'none',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, mb: 1.5 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {items.length > 0 && (
          <Chip size="small" label={items.length} sx={{ fontWeight: 700, borderRadius: 1 }} />
        )}
      </Box>

      {items.length === 0 ? (
        <Box sx={{ minHeight: 132, display: 'grid', placeItems: 'center', color: 'text.secondary' }}>
          <Stack alignItems="center" spacing={1}>
            <CheckCircle2 size={18} />
            <Typography variant="body2">{emptyText}</Typography>
          </Stack>
        </Box>
      ) : (
        <Stack divider={<Divider flexItem />} sx={{ mx: -0.5 }}>
          {items.map((item) => {
            const tone = item.severity ? severityColor(item.severity) : theme.palette.text.secondary
            return (
              <Box
                key={item.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' },
                  gap: { xs: 1, sm: 2 },
                  alignItems: 'center',
                  px: 0.5,
                  py: 1.25,
                }}
              >
                <Box sx={{ minWidth: 0, display: 'flex', gap: 1.25 }}>
                  <Box
                    sx={{
                      mt: 0.45,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: tone,
                      boxShadow: `0 0 0 3px ${alpha(tone, 0.16)}`,
                      flex: '0 0 auto',
                    }}
                  />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                      {item.title}
                    </Typography>
                    {item.subtitle && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }} noWrap>
                        {item.subtitle}
                      </Typography>
                    )}
                    {item.meta && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                        {item.meta}
                      </Typography>
                    )}
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: { xs: 'space-between', sm: 'flex-end' }, alignItems: 'center', gap: 1.25 }}>
                  {item.value && (
                    <Typography variant="body2" sx={{ fontWeight: 800, color: tone, whiteSpace: 'nowrap' }}>
                      {item.value}
                    </Typography>
                  )}
                  <Chip
                    size="small"
                    label={
                      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        {actionLabel}
                        <ArrowRight size={12} />
                      </Box>
                    }
                    variant="outlined"
                    sx={{ borderRadius: 1, fontWeight: 700 }}
                  />
                </Box>
              </Box>
            )
          })}
        </Stack>
      )}
    </Card>
  )
}
