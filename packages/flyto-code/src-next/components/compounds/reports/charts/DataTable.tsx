/**
 * DataTable — renders raw data rows as a full-width table.
 *
 * Screen: wide tables scroll inside the report panel and cells elide
 * pathological long values so the whole workspace never overflows.
 * PDF: ReportPreview's pdf-capture styles expand the table for export.
 */

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { t, tOr } from '@lib/i18n';
import { TABLE } from '../designTokens'
import { normalizeSeverity, severityColor } from '@atoms/SeverityChip'

interface Props { rows: any[]; fields?: string[] }

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
  if (value == null) return <span style={{ color: '#6b7280' }}>-</span>
  if (typeof value === 'boolean') return <span style={{ fontWeight: 600 }}>{value ? t('common.yes') : t('common.no')}</span>
  // Arrays/objects → show count or skip
  if (Array.isArray(value)) return <span style={{ color: '#6b7280' }}>{value.length} {t('common.items')}</span>
  if (typeof value === 'object') return <span style={{ color: '#6b7280' }}>-</span>
  const str = String(value)
  if (isBadScalar(str)) return <span style={{ color: '#6b7280' }}>-</span>
  // Colour the cell only when it reads as a severity word.
  if (normalizeSeverity(str)) {
    const sevColor = severityColor(str)
    // Use inline text with left border instead of Chip — survives PDF white bg
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 10,
        fontWeight: 700,
        fontSize: 12,
        color: sevColor,
        backgroundColor: `${sevColor}22`,
      }}>
        {str.toUpperCase()}
      </span>
    )
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
  if (!rows.length) return <Typography variant="caption" color="text.secondary">{t('reports.noData')}</Typography>

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

  if (!cols.length) return <Typography variant="caption" color="text.secondary">{t('reports.noData')}</Typography>

  const display = rows.slice(0, 100)

  return (
    <Box
      className="report-table-container"
      sx={{
        width: '100%',
        maxWidth: '100%',
        overflowX: 'auto',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <Box
        component="table"
        className="report-table"
        sx={{
          width: 'max-content',
          minWidth: '100%',
          maxWidth: 'none',
          borderCollapse: 'collapse',
          fontSize: TABLE.bodyFontSize,
          tableLayout: 'auto',      // let columns size naturally
          '& th, & td': { px: 1.5, py: 1.25 },
        }}
      >
        <Box component="thead">
          <Box component="tr" sx={{
            borderBottom: '2px solid', borderColor: 'divider',
            bgcolor: 'background.paper',
          }}>
            {cols.map(col => (
              <Box component="th" key={col} sx={{
                textAlign: 'left',
                color: 'text.secondary',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                fontSize: TABLE.headerFontSize,
                letterSpacing: '0.03em',
              }}>
                {formatHeader(col)}
              </Box>
            ))}
          </Box>
        </Box>
        <Box component="tbody">
          {display.map((row, i) => (
            <Box component="tr" key={i} sx={{
              borderBottom: '1px solid', borderColor: 'divider',
              transition: '0.1s',
              '&:hover': { bgcolor: 'action.hover' },
              '&:nth-of-type(even)': { bgcolor: `rgba(255,255,255,${TABLE.zebraOpacity})` },
            }}>
              {cols.map(col => (
                <Box component="td" key={col} sx={{
                  whiteSpace: 'nowrap',     // keep each cell on one line
                  fontSize: TABLE.bodyFontSize,
                  maxWidth: 320,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  <CellValue value={shortenHash(row[col])} />
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      </Box>
      {rows.length > 100 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', py: 1 }}>
          {tOr('reports.showingRows', `Showing 100 of ${rows.length} rows`)}
        </Typography>
      )}
    </Box>
  )
}
