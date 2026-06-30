/**
 * NetworkTab — DNS Records + Ports + GeoIP + IP Intelligence.
 * 2-column grid with readable card sizes.
 */

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import { Globe, Radar, MapPin } from 'lucide-react'
import type { AttackSurfaceAsset } from '@lib/engine'
import type { DomainRow } from '../types'
import { t } from '@lib/i18n';
import { Section, pm } from './_shared'

export function NetworkTab({ row, ipAsset, portAsset }: {
  row: DomainRow
  dnsSecAsset?: AttackSurfaceAsset
  ipAsset?: AttackSurfaceAsset
  portAsset?: AttackSurfaceAsset
  projectId?: string
  orgId: string
  domain?: string
}) {
  const dnsRecords = row.assets.filter(a => a.asset_type === 'dns_record')
  const subdomains = row.assets.filter(a => {
    if (a.asset_type !== 'subdomain') return false
    try { return JSON.parse(a.metadata).resolves } catch { return false }
  })
  const port = pm(portAsset)
  const ports = (port.open_ports ?? []) as Array<{ port: number; service: string }>
  const geo = port.geo as { country?: string; city?: string; isp?: string; asn?: string; as_name?: string } | undefined
  const reverseDns = (port.reverse_dns ?? []) as string[]
  const ip = pm(ipAsset)
  const shodanVulns = (ip.vulns ?? []) as string[]
  const shodanTags = (ip.tags ?? []) as string[]

  const dangerPorts = [3306, 5432, 6379, 27017, 9200, 1433, 3389, 5900, 21, 23, 445]

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5, p: 2, alignContent: 'start' }}>
      {/* DNS Records — large section, spans 2 cols */}
      <Box sx={{ gridColumn: 'span 2', gridRow: 'span 2' }}>
      <Section icon={Globe} title={`${t('dast.section.dnsRecords')} (${dnsRecords.length})`} color="#38bdf8">
        {dnsRecords.length > 0 ? (
          <>
            <Table size="small" sx={{ '& td, & th': { py: 0.5, px: 1, fontSize: 13, border: 0 } }}>
              <TableBody>
                {dnsRecords.slice(0, 15).map(r => {
                  let meta: { record_type?: string } = {}
                  // r.metadata is best-effort DNS record JSON; on parse failure meta stays {} and we fall back to splitting r.value below
                  try { meta = JSON.parse(r.metadata) } catch (err) { if (import.meta.env?.DEV) console.warn('[NetworkTab] DNS record metadata not JSON, falling back to value split:', err) }
                  const parts = r.value.split(' ')
                  return (
                    <TableRow key={r.id}>
                      <TableCell sx={{ width: 60 }}>
                        <Chip label={meta.record_type ?? parts[0]} size="small" variant="outlined" sx={{ fontSize: 13, height: 24, fontWeight: 700 }} />
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontFamily: 'var(--flyto-font-mono)', fontSize: 13, wordBreak: 'break-all' }}>
                          {parts.slice(2).join(' ') || r.value}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            {subdomains.length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <Typography sx={{ fontWeight: 600, fontSize: 13, color: 'text.secondary' }}>
                  {t('dast.section.subdomains')} ({subdomains.length})
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.75 }}>
                  {subdomains.slice(0, 12).map(s => (
                    <Chip key={s.id} label={s.value} size="small" variant="outlined" sx={{ fontSize: 13, height: 24 }} />
                  ))}
                  {subdomains.length > 12 && <Chip label={`+${subdomains.length - 12}`} size="small" sx={{ fontSize: 13, height: 24 }} />}
                </Box>
              </Box>
            )}
          </>
        ) : (
          <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{t('dast.noDnsRecords')}</Typography>
        )}
      </Section>
      </Box>

      {/* Open Ports */}
      <Section icon={Radar} title={`${t('dast.section.openPorts')} (${ports.length})`} color="#f97316">
        {ports.length > 0 ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
            {ports.map(p => {
              const isDanger = dangerPorts.includes(p.port)
              return (
                <Box key={p.port} sx={{
                  p: 1.5, borderRadius: 2, textAlign: 'center',
                  border: '1px solid',
                  borderColor: isDanger ? 'rgba(239,68,68,0.4)' : 'divider',
                  bgcolor: isDanger ? 'rgba(239,68,68,0.08)' : 'transparent',
                  boxShadow: isDanger ? 'inset 0 0 8px rgba(239,68,68,0.08)' : 'none',
                }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 15, color: isDanger ? '#ef4444' : 'text.primary' }}>
                    {p.port}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{p.service}</Typography>
                </Box>
              )
            })}
          </Box>
        ) : (
          <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{t('dast.noPortsScanned')}</Typography>
        )}
      </Section>

      {/* IP Intelligence */}
      <Box sx={{ gridColumn: 'span 3' }}>
        <Section icon={MapPin} title={t('dast.section.ipIntel')} color="#a78bfa">
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {port.ip && (
                <Typography sx={{ fontFamily: 'var(--flyto-font-mono)', fontSize: 15, fontWeight: 600, mb: 0.5 }}>
                  {port.ip}
                </Typography>
              )}
              {geo && (
                <>
                  {geo.country && <Typography sx={{ fontSize: 14 }}>{geo.country}{geo.city ? `, ${geo.city}` : ''}</Typography>}
                  {geo.isp && <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>ISP: {geo.isp}</Typography>}
                  {geo.asn && <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>ASN: {geo.asn}{geo.as_name ? ` — ${geo.as_name}` : ''}</Typography>}
                </>
              )}
              {reverseDns.length > 0 && (
                <Box sx={{ mt: 0.5 }}>
                  <Typography sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 500 }}>{t('dast.reverseDns')}</Typography>
                  {reverseDns.slice(0, 3).map((d, i) => (
                    <Typography key={i} sx={{ fontSize: 13, fontFamily: 'var(--flyto-font-mono)' }}>{d}</Typography>
                  ))}
                </Box>
              )}
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {shodanTags.length > 0 && (
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  {shodanTags.map(tag => {
                    const isDanger = ['compromised', 'botnet', 'malware'].includes(tag)
                    return (
                      <Chip key={tag} label={tag} size="small" sx={{
                        height: 24, fontSize: 13, fontWeight: 600,
                        bgcolor: isDanger ? '#ef444418' : '#64748b18',
                        color: isDanger ? '#ef4444' : '#64748b',
                        boxShadow: isDanger ? '0 0 8px rgba(239,68,68,0.15)' : 'none',
                      }} />
                    )
                  })}
                </Box>
              )}
              {shodanVulns.length > 0 && (
                <Box>
                  <Typography sx={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>
                    CVEs ({shodanVulns.length}):
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
                    {shodanVulns.slice(0, 8).map(v => (
                      <Chip key={v} label={v} size="small" sx={{
                        height: 24, fontSize: 13, fontFamily: 'var(--flyto-font-mono)',
                        bgcolor: '#ef444418', color: '#ef4444',
                      }} />
                    ))}
                    {shodanVulns.length > 8 && <Chip label={`+${shodanVulns.length - 8}`} size="small" sx={{ height: 24, fontSize: 13 }} />}
                  </Box>
                </Box>
              )}
              {!port.ip && shodanTags.length === 0 && shodanVulns.length === 0 && (
                <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{t('dast.noIpIntel')}</Typography>
              )}
            </Box>
          </Box>
        </Section>
      </Box>
    </Box>
  )
}
