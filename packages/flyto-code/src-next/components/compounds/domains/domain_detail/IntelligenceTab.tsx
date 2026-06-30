/**
 * IntelligenceTab — Tech Stack + WHOIS + WAF + Web Files.
 * 2-column grid with readable card sizes.
 */

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { Cpu, FileText, Shield, Globe } from 'lucide-react'
import type { AttackSurfaceAsset } from '@lib/engine'
import type { DomainRow } from '../types'
import { t } from '@lib/i18n';
import { Section, InfoRow, pm } from './_shared'

const CATEGORY_COLORS: Record<string, string> = {
  web_server: '#f97316', framework: '#8b5cf6', language: '#3b82f6',
  cdn: '#06b6d4', cms: '#22c55e', hosting: '#38bdf8',
  analytics: '#eab308', library: '#a78bfa', css: '#f472b6',
  cache: '#94a3b8', proxy: '#64748b', infrastructure: '#475569',
  ecommerce: '#10b981',
}

export function IntelligenceTab({ row, techAsset, whoisAsset, wafAsset, sensitiveAsset }: {
  row: DomainRow
  techAsset?: AttackSurfaceAsset
  whoisAsset?: AttackSurfaceAsset
  wafAsset?: AttackSurfaceAsset
  sensitiveAsset?: AttackSurfaceAsset
  projectId?: string
  orgId: string
  domain?: string
}) {
  const tech = pm(techAsset)
  const techs = (tech.technologies ?? []) as Array<{ name: string; category: string; source?: string }>
  const whois = pm(whoisAsset)
  const waf = pm(wafAsset)
  const sensitive = pm(sensitiveAsset)
  const securityTxt = sensitive.security_txt as Record<string, string> | undefined

  // HTTP info for protocol/methods
  const httpsAsset = row.assets.find(a => {
    try { return JSON.parse(a.metadata).scheme === 'https' } catch { return false }
  })
  const httpMeta = pm(httpsAsset)
  const httpVersion = httpMeta.http_version as string | undefined
  const methods = (httpMeta.methods ?? []) as string[]

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5, p: 2, alignContent: 'start' }}>
      {/* Tech Stack — wide, many chips */}
      <Box sx={{ gridColumn: 'span 2' }}>
      <Section icon={Cpu} title={`${t('dast.section.techStack')} (${techs.length})`} color="#8b5cf6">
        {techs.length > 0 ? (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {techs.map((t, i) => (
              <Chip
                key={i}
                label={t.name}
                size="small"
                sx={{
                  height: 28, fontSize: 12, fontWeight: 600,
                  bgcolor: (CATEGORY_COLORS[t.category] ?? '#94a3b8') + '18',
                  color: CATEGORY_COLORS[t.category] ?? '#94a3b8',
                  border: '1px solid',
                  borderColor: (CATEGORY_COLORS[t.category] ?? '#94a3b8') + '30',
                }}
              />
            ))}
          </Box>
        ) : (
          <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{t('dast.noTech')}</Typography>
        )}
        {httpVersion && (
          <Box sx={{ mt: 1, display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{t('dast.protocol')}</Typography>
            <Chip label={httpVersion} size="small" sx={{ height: 24, fontSize: 12 }} />
          </Box>
        )}
        {methods.length > 0 && (
          <Box sx={{ mt: 0.5, display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{t('dast.methods')}</Typography>
            {methods.map(m => (
              <Chip key={m} label={m} size="small" variant="outlined" sx={{ height: 22, fontSize: 13 }} />
            ))}
          </Box>
        )}
      </Section>
      </Box>

      {/* WHOIS */}
      <Section icon={FileText} title={t('dast.section.whois')} color="#06b6d4">
        {whois.domain ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <InfoRow label={t('dast.whois.registrar')} value={whois.registrar} />
            <InfoRow label={t('dast.whois.created')} value={whois.created?.slice(0, 10)} />
            <InfoRow label={t('dast.whois.updated')} value={whois.updated?.slice(0, 10)} />
            <InfoRow label={t('dast.whois.expires')} value={whois.expires?.slice(0, 10)} />
            {(whois.nameservers ?? []).length > 0 && (
              <Box sx={{ mt: 0.5 }}>
                <Typography sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 500 }}>{t('dast.nameservers')}</Typography>
                {(whois.nameservers as string[]).slice(0, 3).map((ns, i) => (
                  <Typography key={i} sx={{ fontSize: 13, fontFamily: 'var(--flyto-font-mono)', pl: 2 }}>{ns}</Typography>
                ))}
              </Box>
            )}
          </Box>
        ) : (
          <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{t('dast.notScanned')}</Typography>
        )}
      </Section>

      {/* WAF */}
      <Section icon={Shield} title={t('dast.section.waf')} color="#22c55e">
        {waf.detected ? (
          <>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {(waf.detected as Array<{ name: string }>).map((w, i) => (
                <Chip key={i} label={w.name} size="small" sx={{ height: 28, fontSize: 12, fontWeight: 600, bgcolor: '#22c55e18', color: '#22c55e' }} />
              ))}
            </Box>
            {waf.behavior_detected && (
              <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }}>
                {t('dast.check.behavioralDetection')} status {waf.normal_status} → {waf.suspicious_status}
              </Typography>
            )}
          </>
        ) : (
          <Typography sx={{ fontSize: 14, color: waf.behavior_detected ? '#eab308' : '#ef4444', fontWeight: 500 }}>
            {waf.behavior_detected ? t('dast.check.behaviorWaf') : t('dast.check.noWaf')}
          </Typography>
        )}
      </Section>

      {/* security.txt + Web Files */}
      <Section icon={Globe} title={t('dast.section.webFiles')} color="#38bdf8">
        {securityTxt ? (
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#22c55e', mb: 0.5 }}>{t('dast.check.securityTxtFound')}</Typography>
            {Object.entries(securityTxt).slice(0, 4).map(([k, v]) => (
              <InfoRow key={k} label={k} value={v} />
            ))}
          </Box>
        ) : (
          <Typography sx={{ fontSize: 14, color: '#f97316', fontWeight: 500 }}>{t('dast.check.noSecurityTxt')}</Typography>
        )}
      </Section>
    </Box>
  )
}
