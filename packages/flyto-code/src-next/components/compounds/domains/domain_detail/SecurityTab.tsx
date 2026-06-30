/**
 * SecurityTab — 2-column grid, readable cards with accent bars.
 * Sections: SSL | Headers | Email (SPF/DMARC/DKIM) | Cookie | CORS | Files | Takeover
 */

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { Lock, Shield, Mail, Cookie, Globe, FolderOpen, AlertTriangle, Plug } from 'lucide-react'
import { alpha } from '@mui/material/styles'
import type { AttackSurfaceAsset } from '@lib/engine'
import type { DomainRow } from '../types'
import { t } from '@lib/i18n';
import { SEVERITY_TONE, GRADE_TONE, type Severity } from '@lib/tokens/severity'
import { Section, PassFail, NotScanned, pm } from './_shared'

// Theme-adaptive chip tint: same-hue ~14% bg + saturated text. Reads in
// both light and dark mode (replaces hardcoded opaque/low-alpha hex).
function chipSx(t: { tone: string }) {
  return { bgcolor: alpha(t.tone, 0.14), color: t.tone }
}

export function SecurityTab({ sslAsset, dnsSecAsset, emailAsset, httpAssets, sensitiveAsset, takeoverAsset }: {
  row: DomainRow
  sslAsset?: AttackSurfaceAsset
  dnsSecAsset?: AttackSurfaceAsset
  emailAsset?: AttackSurfaceAsset
  httpAssets: AttackSurfaceAsset[]
  wafAsset?: AttackSurfaceAsset
  sensitiveAsset?: AttackSurfaceAsset
  takeoverAsset?: AttackSurfaceAsset
  projectId?: string
  orgId: string
  domain?: string
}) {
  const ssl = pm(sslAsset)
  const dnsSec = pm(dnsSecAsset)
  // Noise reduction: SPF/DMARC/DKIM only matter for a domain that
  // actually sends/receives mail. A web subdomain with no MX (e.g.
  // cloud.flyto2.com) genuinely has no email auth and shouldn't be
  // shown as a red "No SPF/DMARC/DKIM" failure — mirror the backend
  // scoring, which already gates these penalties on mx_count > 0.
  const email = pm(emailAsset)
  const noMail = typeof email.mx_count === 'number' && email.mx_count === 0
  const httpsAsset = httpAssets.find(a => { try { return JSON.parse(a.metadata).scheme === 'https' } catch { return false } })
  const httpAsset = httpAssets.find(a => { try { return JSON.parse(a.metadata).scheme === 'http' } catch { return false } })
  const http = pm(httpsAsset)
  // Three-state honesty: the Security Headers checks read off the HTTPS
  // endpoint. If no HTTPS endpoint was scanned, a missing header means
  // "not scanned" (unknown), not "confirmed absent" (a real finding).
  // 沒掃到 vs 確定沒有 差很多. Only render ✗ findings when we actually
  // have an HTTPS endpoint to read headers from.
  const httpsScanned = !!httpsAsset
  const headers = (http.headers ?? {}) as Record<string, string>
  const httpMeta = pm(httpAsset)
  const cookies = (http.cookies ?? []) as Array<{ name: string; http_only: boolean; secure: boolean; same_site: string }>
  const cors = http.cors as { allow_origin?: string; wildcard?: boolean; reflects_origin?: boolean } | undefined
  const sensitive = pm(sensitiveAsset)
  const files = (sensitive.files ?? []) as Array<{ path: string; risk: string; size?: number }>
  const robotsDisallow = (sensitive.robots_disallow ?? []) as string[]
  const takeover = pm(takeoverAsset)
  const takeoverRisks = (takeover.risks ?? []) as Array<{ subdomain: string; cname_target: string; service: string }>

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5, p: 2, alignContent: 'start' }}>
      {/* SSL/TLS */}
      <Section icon={Lock} title={t('dast.section.tls')} color="#22c55e">
        {sslAsset ? (
          <>
            <PassFail ok={!ssl.is_expired} label={ssl.is_expired ? t('dast.check.expired') : `${ssl.days_left ?? '?'} ${t('dast.daysLeft')}`} />
            <PassFail ok={['TLS 1.2', 'TLS 1.3'].includes(ssl.tls_version)} label={ssl.tls_version ?? t('dast.check.unknownTls')} />
            <PassFail ok={!ssl.is_self_signed} label={ssl.is_self_signed ? t('dast.check.selfSigned') : ssl.issuer ?? t('dast.check.trustedIssuer')} />
            <PassFail ok={ssl.hsts_preload === true} label={ssl.hsts_preload ? t('dast.check.hstsPreloadEnabled') : t('dast.check.noHstsPreload')} />
            {ssl.cipher_suite && (
              <Typography sx={{ fontSize: 12, fontFamily: 'var(--flyto-font-mono)', color: 'text.secondary', mt: 0.5 }} noWrap>
                {ssl.cipher_suite}
              </Typography>
            )}
          </>
        ) : (
          <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{t('dast.notScanned')}</Typography>
        )}
      </Section>

      {/* Security Headers — only assertable against a scanned HTTPS endpoint */}
      <Section icon={Shield} title={t('dast.section.secHeaders')} color="#38bdf8">
        {httpsScanned ? (
          <>
            <PassFail ok={!!headers['Strict-Transport-Security']} label="HSTS" />
            <PassFail ok={!!headers['Content-Security-Policy']} label={t('dast.check.csp')} />
            <PassFail ok={!!headers['X-Content-Type-Options']} label="X-Content-Type-Options" />
            <PassFail ok={!!headers['X-Frame-Options']} label="X-Frame-Options" />
            <PassFail ok={!headers['Server']} label={headers['Server'] ? `${t('dast.check.serverLeak')} ${headers['Server']}` : t('dast.check.noServerLeak')} />
            <PassFail ok={!headers['X-Powered-By']} label={headers['X-Powered-By'] ? `X-Powered-By: ${headers['X-Powered-By']}` : t('dast.check.noPoweredByLeak')} />
          </>
        ) : (
          <NotScanned label={t('dast.notScannedHttps')} />
        )}
      </Section>

      {/* Endpoints — surface BOTH schemes the scanner observed. The HTTP
          endpoint is usually a 301 → HTTPS redirect (no HSTS, correct);
          the HTTPS endpoint is where the real security headers live. Showing
          both makes the redirect-vs-headers split explicit instead of hiding
          one scheme behind the other. */}
      {(httpsAsset || httpAsset) && (
        <Section icon={Plug} title={t('dast.section.endpoints')} color="#14b8a6">
          {httpsAsset && (
            <EndpointRow
              label={t('dast.endpoint.https')}
              status={http.status as number | undefined}
              redirect={http.redirect_to as string | undefined ?? (http.headers as Record<string, string> | undefined)?.['Location']}
            />
          )}
          {httpAsset && (
            <EndpointRow
              label={t('dast.endpoint.http')}
              status={httpMeta.status as number | undefined}
              redirect={httpMeta.redirect_to as string | undefined ?? (httpMeta.headers as Record<string, string> | undefined)?.['Location']}
            />
          )}
        </Section>
      )}

      {/* Email Security — spans 2 rows because it has many checks */}
      <Box sx={{ gridRow: 'span 2' }}>
      <Section icon={Mail} title={t('dast.section.emailSec')} color="#a78bfa">
        {dnsSecAsset ? (
          <>
            {noMail ? (
              // No MX → not a mail domain. Show a neutral note instead of
              // red SPF/DMARC/DKIM failures (those don't apply here).
              <Typography sx={{ fontSize: 13, color: 'text.secondary', pl: 0.5, pb: 0.5 }}>
                {t('dast.check.notMailDomain')}
              </Typography>
            ) : (
              <>
                <PassFail ok={dnsSec.spf === true} label={dnsSec.spf ? t('dast.check.spfConfigured') : t('dast.check.noSpf')} />
                {dnsSec.spf_record && (
                  <Typography sx={{ fontSize: 12, fontFamily: 'var(--flyto-font-mono)', color: 'text.secondary', pl: 4 }} noWrap>
                    {dnsSec.spf_record}
                  </Typography>
                )}
                {dnsSec.spf_quality && dnsSec.spf_quality !== 'pass' && (
                  <Typography sx={{ fontSize: 13, color: '#f97316', pl: 4, fontWeight: 500 }}>
                    {dnsSec.spf_quality === 'fail' ? '⚠ +all — no protection' : dnsSec.spf_quality === 'warn' ? '⚠ ~all — softfail only' : ''}
                  </Typography>
                )}
                <PassFail ok={dnsSec.dmarc === true} label={dnsSec.dmarc ? `DMARC p=${dnsSec.dmarc_policy || '?'}` : t('dast.check.noDmarc')} />
                {dnsSec.dmarc_policy === 'none' && (
                  <Typography sx={{ fontSize: 13, color: '#f97316', pl: 4, fontWeight: 500 }}>
                    p=none — not enforced
                  </Typography>
                )}
                <PassFail ok={dnsSec.dkim === true} label={dnsSec.dkim ? t('dast.check.dkimConfigured') : t('dast.check.noDkim')} />
              </>
            )}
            <PassFail ok={dnsSec.dnssec === true} label={dnsSec.dnssec ? t('dast.check.dnssecEnabled') : t('dast.check.noDnssec')} />
            <PassFail ok={dnsSec.caa === true} label={dnsSec.caa ? t('dast.check.caaSet') : t('dast.check.noCaa')} />
            <PassFail ok={!dnsSec.axfr_vulnerable} label={dnsSec.axfr_vulnerable ? t('dast.check.axfrVulnerable') : t('dast.check.axfrSafe')} />
          </>
        ) : (
          <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{t('dast.notScanned')}</Typography>
        )}
      </Section>
      </Box>

      {/* Cookie Security */}
      <Section icon={Cookie} title={t('dast.section.cookies')} color="#f97316">
        {cookies.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {cookies.slice(0, 6).map((c, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: 13, fontFamily: 'var(--flyto-font-mono)', minWidth: 100, flexShrink: 0 }} noWrap>{c.name}</Typography>
	                <Chip label={c.http_only ? t('hardcoded.httponly.40fecc2f') : '—'} size="small" sx={{ height: 24, fontSize: 13, ...chipSx(c.http_only ? GRADE_TONE.good : SEVERITY_TONE.critical) }} />
	                <Chip label={c.secure ? t('dashboard.secure') : '—'} size="small" sx={{ height: 24, fontSize: 13, ...chipSx(c.secure ? GRADE_TONE.good : SEVERITY_TONE.critical) }} />
                <Chip label={c.same_site || '—'} size="small" sx={{ height: 24, fontSize: 13, ...chipSx(c.same_site ? GRADE_TONE.good : SEVERITY_TONE.medium) }} />
              </Box>
            ))}
            {cookies.length > 6 && <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>+{cookies.length - 6} {t('dast.more')}</Typography>}
          </Box>
        ) : (
          <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{t('dast.noCookies')}</Typography>
        )}
      </Section>

      {/* CORS */}
      <Section icon={Globe} title={t('dast.section.cors')} color="#06b6d4">
        {cors ? (
          <>
            <PassFail ok={!cors.wildcard} label={cors.wildcard ? t('dast.check.wildcardOrigin') : `Origin: ${cors.allow_origin}`} />
            <PassFail ok={!cors.reflects_origin} label={cors.reflects_origin ? t('dast.check.reflectsOrigin') : t('dast.check.fixedOrigin')} />
          </>
        ) : (
          <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{t('dast.noCors')}</Typography>
        )}
      </Section>

      {/* Sensitive Files */}
      <Section icon={FolderOpen} title={t('dast.section.sensitiveFiles')} color="#ef4444">
        {files.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {files.slice(0, 5).map((f, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontFamily: 'var(--flyto-font-mono)', fontSize: 13, flex: 1 }} noWrap>{f.path}</Typography>
                <Chip label={f.risk} size="small" sx={{
                  height: 24, fontSize: 13, fontWeight: 600,
                  ...chipSx(SEVERITY_TONE[(f.risk === 'critical' ? 'critical' : f.risk === 'high' ? 'high' : 'medium') as Severity]),
                }} />
              </Box>
            ))}
            {files.length > 5 && <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>+{files.length - 5} {t('dast.more')}</Typography>}
            {robotsDisallow.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography sx={{ color: 'text.secondary', fontSize: 13, fontWeight: 500 }}>{t('dast.check.robotsHiddenPaths')}</Typography>
                {robotsDisallow.slice(0, 3).map((p, i) => (
                  <Typography key={i} sx={{ fontFamily: 'var(--flyto-font-mono)', fontSize: 12, color: 'text.secondary', pl: 2 }}>{p}</Typography>
                ))}
              </Box>
            )}
          </Box>
        ) : (
          <Typography sx={{ fontSize: 14, color: '#22c55e' }}>{t('dast.check.noSensitiveFiles')}</Typography>
        )}
      </Section>

      {/* Subdomain Takeover */}
      {takeoverRisks.length > 0 && (
        <Section icon={AlertTriangle} title={t('dast.section.subdomainTakeover')} color="#ef4444">
          {takeoverRisks.map((r, i) => (
            <Box key={i} sx={{
              py: 0.5,
            }}>
              <Typography sx={{ fontFamily: 'var(--flyto-font-mono)', fontSize: 14, fontWeight: 600, color: '#ef4444' }}>{r.subdomain}</Typography>
              <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.25 }}>
                CNAME → {r.cname_target} ({r.service})
              </Typography>
            </Box>
          ))}
        </Section>
      )}
    </Box>
  )
}

/** One observed endpoint: scheme label + HTTP status chip + optional
 *  redirect target. A 3xx is shown neutral (a redirect is normal, often
 *  the HTTP→HTTPS hop), 2xx green, everything else amber. */
function EndpointRow({ label, status, redirect }: { label: string; status?: number; redirect?: string }) {
  const tone = status == null
    ? '#64748b'
    : status >= 200 && status < 300
      ? '#22c55e'
      : status >= 300 && status < 400
        ? '#64748b'
        : '#eab308'
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, flexWrap: 'wrap' }}>
      <Typography sx={{ fontSize: 13, fontWeight: 600, minWidth: 150, flexShrink: 0 }}>{label}</Typography>
      <Chip
        label={status != null ? String(status) : t('dast.endpoint.noStatus')}
        size="small"
        sx={{ height: 22, fontSize: 12, fontWeight: 700, bgcolor: tone + '18', color: tone }}
      />
      {redirect && (
        <Typography sx={{ fontSize: 12, fontFamily: 'var(--flyto-font-mono)', color: 'text.secondary' }} noWrap>
          → {redirect}
        </Typography>
      )}
    </Box>
  )
}
