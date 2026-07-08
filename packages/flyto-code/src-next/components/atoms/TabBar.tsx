import { Tabs, Tab, Box } from '@mui/material'
import type { ReactNode } from 'react'
import type { SxProps, Theme } from '@mui/material'
import { flytoRadii, flytoTypography } from '@/styles/visualSystem'

// TabBar — standardises the MUI <Tabs> defaults every detail view was
// re-declaring (textTransform:'none', fontWeight:600, scrollable +
// auto scroll buttons), plus an optional per-tab count badge so the
// "icon + label + count" pattern isn't re-implemented per view.
//
// Controlled: parent owns `value` + `onChange`. Values are plain strings.
// `accentColor` overrides the selected-tab + indicator colour for views
// with a surface-specific accent (e.g. the external posture tech-teal);
// omit it to inherit the theme primary.

export interface TabItem {
  value: string
  label: ReactNode
  icon?: ReactNode
  /** Optional count rendered as a subtle pill after the label. */
  count?: number
}

export interface TabBarProps {
  items: TabItem[]
  value: string
  onChange: (value: string) => void
  /** Override selected-tab + indicator colour. Defaults to theme primary. */
  accentColor?: string
  /** Hide the bottom divider rule (some shells own their own border). */
  noDivider?: boolean
  sx?: SxProps<Theme>
}

export function TabBar({ items, value, onChange, accentColor, noDivider, sx }: TabBarProps) {
  return (
    <Tabs
      value={value}
      onChange={(_e, v) => onChange(v as string)}
      variant="scrollable"
      scrollButtons="auto"
      sx={{
        minHeight: 40,
        ...(noDivider ? null : { borderBottom: '1px solid', borderColor: 'divider' }),
        '& .MuiTab-root': {
          ...flytoTypography.tab,
          minWidth: 'auto',
          maxWidth: 220,
          minHeight: 40,
          px: { xs: 1, sm: 1.25 },
          py: 0,
        },
        '& .MuiTab-iconWrapper': {
          mr: 0.5,
        },
        '& .MuiTabs-scrollButtons': {
          width: 32,
          flexShrink: 0,
        },
        ...(accentColor
          ? {
              '& .Mui-selected': { color: `${accentColor} !important` },
              '& .MuiTabs-indicator': { backgroundColor: accentColor },
            }
          : null),
        ...sx,
      }}
    >
      {items.map((it) => (
        <Tab
          key={it.value}
          value={it.value}
          iconPosition="start"
          icon={it.icon as React.ReactElement | undefined}
          label={
            it.count != null ? (
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                {it.label}
                <Box
                  component="span"
                  sx={{
                    ...flytoTypography.tabCount,
                    px: 0.625,
                    py: 0.25,
                    borderRadius: flytoRadii.pill,
                    bgcolor: 'action.selected',
                    color: 'text.secondary',
                  }}
                >
                  {it.count}
                </Box>
              </Box>
            ) : (
              it.label
            )
          }
        />
      ))}
    </Tabs>
  )
}
