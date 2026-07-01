/**
 * DataTable — renders raw data rows as a full-width table.
 *
 * Screen: wide tables scroll inside the report panel and cells elide
 * pathological long values so the whole workspace never overflows.
 * PDF: ReportPreview's pdf-capture styles expand the table for export.
 */

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { alpha, styled } from '@mui/material/styles'
import { t } from '@lib/i18n';
import { TABLE } from '../designTokens'
import { normalizeSeverity, severityColor } from '@atoms/SeverityChip'

interface Props { rows: any[]; fields?: string[] }

const EmptyCaption = styled(Typography)(({ theme }) => ({
  color: theme.palette.text.secondary,
}))

const MutedScalar = styled('span')(({ theme }) => ({
  color: theme.palette.text.secondary,
}))

const BooleanScalar = styled('span')(({ theme }) => ({
  fontWeight: theme.typography.fontWeightMedium,
}))

const SeverityPill = styled('span', {
  shouldForwardProp: (prop) => prop !== 'severitycolor',
})<{ severitycolor: string }>(({ severitycolor }) => ({
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 10,
  fontWeight: 700,
  fontSize: TABLE.bodyFontSize,
  color: severitycolor,
  backgroundColor: alpha(severitycolor, 0.14),
}))

const TableScroller = styled(Box)({
  width: '100%',
  maxWidth: '100%',
  overflowX: 'auto',
  overflowY: 'hidden',
  WebkitOverflowScrolling: 'touch',
})

const ReportTable = styled('table')(({ theme }) => ({
  width: 'max-content',
  minWidth: '100%',
  maxWidth: 'none',
  borderCollapse: 'collapse',
  fontSize: TABLE.bodyFontSize,
  tableLayout: 'auto',
  '& th, & td': {
    padding: theme.spacing(1.25, 1.5),
  },
}))

const HeaderRow = styled('tr')(({ theme }) => ({
  borderBottom: `2px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
}))

const HeaderCell = styled('th')(({ theme }) => ({
  textAlign: 'left',
  color: theme.palette.text.secondary,
  fontWeight: 700,
  whiteSpace: 'nowrap',
  fontSize: TABLE.headerFontSize,
  letterSpacing: 0,
}))

const BodyRow = styled('tr')(({ theme }) => ({
  borderBottom: `1px solid ${theme.palette.divider}`,
  transition: theme.transitions.create('background-color', { duration: theme.transitions.duration.shortest }),
  '&:hover': { backgroundColor: theme.palette.action.hover },
  '&:nth-of-type(even)': { backgroundColor: alpha(theme.palette.common.white, TABLE.zebraOpacity) },
}))

const DataCell = styled('td')({
  whiteSpace: 'nowrap',
  fontSize: TABLE.bodyFontSize,
  maxWidth: 320,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

const RowLimitCaption = styled(Typography)(({ theme }) => ({
  display: 'block',
  textAlign: 'center',
  padding: theme.spacing(1, 0),
  color: theme.palette.text.secondary,
}))

function isBadScalar(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return (
    normalized === '' ||
    normalized === 'undefined' ||
    normalized === 'null' ||
    normalized === 'nan' ||
    normalized === 'invalid date' ||
    normalized === '[object object]'
  )
}

function CellValue({ value }: { value: any }) {
  if (value == null) return <MutedScalar>-</MutedScalar>
  if (typeof value === 'boolean') return <BooleanScalar>{value ? t('common.yes') : t('common.no')}</BooleanScalar>
  // Arrays/objects → show count or skip
  if (Array.isArray(value)) return <MutedScalar>{value.length} {t('common.items')}</MutedScalar>
  if (typeof value === 'object') return <MutedScalar>-</MutedScalar>
  const str = String(value)
  if (isBadScalar(str)) return <MutedScalar>-</MutedScalar>
  // Colour the cell only when it reads as a severity word.
  if (normalizeSeverity(str)) {
    const sevColor = severityColor(str)
    return <SeverityPill severitycolor={sevColor}>{str.toUpperCase()}</SeverityPill>
  }
  return <>{str}</>
}

/** Translate column header — try i18n key, fall back to title-case */
function formatHeader(key: string): string {
  const translated = t(`reports.col.${key}`)
  if (translated) return translated
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/** Shorten cell values that look like UUIDs/hashes (32+ hex chars) */
function shortenHash(value: any): any {
  if (typeof value !== 'string') return value
  // UUID pattern: 8-4-4-4-12 or 32+ hex chars
  if (/^[0-9a-f]{32,}$/i.test(value)) return value.slice(0, 8) + '...'
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value)) return value.slice(0, 8) + '...'
  return value
}

export default function DataTable({ rows, fields }: Props) {
  if (!rows.length) return <EmptyCaption variant="caption">{t('reports.noData')}</EmptyCaption>

  // Auto-detect columns; exclude internal fields and object/array columns
  const allCols = fields ?? Object.keys(rows[0]).filter(k => {
    if (k.startsWith('_') || k === 'id') return false
    // Exclude columns whose first non-null value is an object or array
    const sample = rows.find(r => r[k] != null)?.[k]
    if (sample != null && typeof sample === 'object') return false
    return true
  })

  // Filter out columns where ALL values are null/empty (no useful data)
  const cols = allCols.filter(col => rows.some(row => {
    const value = row[col]
    if (value == null) return false
    if (typeof value === 'string') return !isBadScalar(value)
    return true
  }))

  if (!cols.length) return <EmptyCaption variant="caption">{t('reports.noData')}</EmptyCaption>

  const display = rows.slice(0, 100)

  return (
    <TableScroller>
      <ReportTable>
        <thead>
          <HeaderRow>
            {cols.map(col => (
              <HeaderCell key={col}>
                {formatHeader(col)}
              </HeaderCell>
            ))}
          </HeaderRow>
        </thead>
        <tbody>
          {display.map((row, i) => (
            <BodyRow key={i}>
              {cols.map(col => (
                <DataCell key={col}>
                  <CellValue value={shortenHash(row[col])} />
                </DataCell>
              ))}
            </BodyRow>
          ))}
        </tbody>
      </ReportTable>
      {rows.length > 100 && (
        <RowLimitCaption variant="caption">
          {t('reports.showingRows', { n: rows.length })}
        </RowLimitCaption>
      )}
    </TableScroller>
  )
}
