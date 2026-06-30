import { Box, Pagination as MuiPagination, Typography } from '@mui/material'
import { t } from '@lib/i18n'

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  className?: string
}

export function Pagination({ page, totalPages, total, pageSize, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <Box className={`flex items-center justify-between ${className ?? ''}`}>
      <Typography variant="caption" color="text.secondary">
        {t('issues.showing')} {start}-{end} / {total}
      </Typography>
      <MuiPagination
        count={totalPages}
        page={page}
        onChange={(_, value) => onPageChange(value)}
        size="small"
        shape="rounded"
        siblingCount={2}
        sx={{
          '& .MuiPaginationItem-root': {
            color: 'text.secondary',
            fontSize: 12,
            minWidth: 28,
            height: 28,
          },
          '& .Mui-selected': {
            bgcolor: 'action.selected',
          },
        }}
      />
    </Box>
  )
}
