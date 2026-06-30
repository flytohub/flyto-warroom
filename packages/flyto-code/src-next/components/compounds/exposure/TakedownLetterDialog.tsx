import { useEffect, useMemo, useState } from 'react'
import {
  Box, Typography, Dialog, IconButton, Button, MenuItem, TextField, CircularProgress,
} from '@mui/material'
import { FileText, X, Download, Copy, RotateCcw, Printer } from 'lucide-react'
import { t as i18nT, getLocale } from '@lib/i18n';
import {
  getTakedownLetter, parseProviderChain,
  type AttackSurfaceAsset, type TakedownCaseType, type TakedownTarget,
} from '@lib/engine'
import { InlineErrorNotice } from '@atoms/InlineErrorNotice'
import { Loading } from '../scanning/_shared'

// TakedownLetterDialog — extracted from BrandProtectionView 2026-05-19
// during the convergence sweep. The parent was 1152 LOC; this
// dialog is the biggest self-contained piece (~250 LOC) and the
// extraction is clean because the dialog only depends on the
// asset + onClose props.
//
// case_type + target dropdowns drive a server-rendered Markdown
// letter. The disclaimer above the editable preview is the legal
// posture the product surfaces consistently (see
// [[no-overclaim-impersonation]] and
// [[brand-protection-evidence-posture]] memories).

// PROVIDER_KIND_LABELS in this file uses long-form labels for the
// takedown letter form. BrandProtectionView keeps its own short-form
// map for chip rendering. They overlap by key but never need to
// stay in sync — the strings serve different surfaces.
const PROVIDER_KIND_LABELS: Record<string, string> = {
  registrar: 'Domain registrar',
  hosting:   'Hosting provider',
  cdn:       'CDN',
  dns:       'DNS provider',
  mail:      'Mail provider',
  cms:       'CMS / platform',
  platform:  'Platform',
}

export interface TakedownLetterDialogProps {
  open: boolean
  onClose: () => void
  orgId: string
  asset: AttackSurfaceAsset
}

export function TakedownLetterDialog({
  open, onClose, orgId, asset,
}: TakedownLetterDialogProps) {
  const chain = useMemo(() => parseProviderChain(asset.metadata), [asset.metadata])

  // Default case type from metadata: typosquat/homograph/lookalike
  // map to "impersonation" by default; operator can switch to phishing
  // explicitly when they've confirmed credential harvesting.
  const [caseType, setCaseType] = useState<TakedownCaseType>('impersonation')

  // Targets available are the kinds present in the chain, plus
  // "generic" which always works.
  const availableTargets = useMemo<TakedownTarget[]>(() => {
    const kinds = new Set<string>(['generic'])
    chain?.providers?.forEach((p) => kinds.add(p.kind))
    const order: TakedownTarget[] = ['registrar', 'hosting', 'cdn', 'dns', 'mail', 'cms', 'generic']
    return order.filter((k) => kinds.has(k)) as TakedownTarget[]
  }, [chain])
  const [target, setTarget] = useState<TakedownTarget>('generic')
  useEffect(() => {
    if (open && availableTargets.length > 0 && !availableTargets.includes(target)) {
      setTarget(availableTargets[0])
    }
  }, [open, availableTargets, target])

  // letter is the editable body — the server-rendered template
  // loads into it on case_type / target / locale change; the
  // operator tweaks in-place before exporting. templateLetter
  // keeps the original so "Reset" restores it without a network
  // round-trip.
  const [letter, setLetter] = useState<string>('')
  const [templateLetter, setTemplateLetter] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setErr(null)
    getTakedownLetter(orgId, asset.id, caseType, target, getLocale())
      .then((text) => {
        if (cancelled) return
        setLetter(text)
        setTemplateLetter(text)
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, orgId, asset.id, caseType, target])

  const hasEdits = letter !== templateLetter && templateLetter !== ''
  const resetToTemplate = () => setLetter(templateLetter)

  // exportPDF — renders the letter into a styled HTML page and
  // uses the engine's renderHtmlToPdf to produce a downloadable
  // PDF. Keeps the operator in-app instead of bouncing to Word
  // for a basic format conversion.
  const exportPDF = async () => {
    setPdfBusy(true)
    try {
      const { renderHtmlToPdf } = await import('@lib/engine')
      const html = takedownLetterToHtml(letter, asset.value)
      const blob = await renderHtmlToPdf(orgId, html)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `takedown-${caseType}-${asset.value}.pdf`.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setPdfBusy(false)
    }
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(letter)
    } catch {
      // Older browsers / clipboard-permission denied — fall back
      // to an invisible textarea + execCommand.
      const ta = document.createElement('textarea')
      ta.value = letter
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* ignore */ }
      ta.remove()
    }
  }

  const downloadLetter = () => {
    const blob = new Blob([letter], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `takedown-${caseType}-${asset.value}.md`.replace(/[^a-zA-Z0-9.\-_]/g, '_')
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md"
      PaperProps={{ sx: { borderRadius: 2 } }}>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1.5,
        p: 2, borderBottom: '1px solid', borderColor: 'divider',
      }}>
        <FileText size={18} style={{ opacity: 0.7 }} />
        <Typography variant="body1" fontWeight={700} sx={{ flex: 1 }}>
          {i18nT('exposure.brand.letterTitle')}
        </Typography>
        <IconButton
          onClick={onClose}
          size="small"
          aria-label={i18nT('common.close')}
          title={i18nT('common.close')}
        >
          <X size={16} />
        </IconButton>
      </Box>

      {/* Disclaimer — fixed copy that mirrors the product posture. */}
      <Box sx={{
        m: 2, p: 1.5, borderRadius: 1.5,
        bgcolor: 'rgba(234,179,8,0.06)',
        border: '1px solid', borderColor: 'rgba(234,179,8,0.3)',
      }}>
        <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.55, fontSize: 13.5 }}>
          {i18nT('exposure.brand.letterDisclaimer')}
        </Typography>
      </Box>

      {/* Controls */}
      <Box sx={{ display: 'flex', gap: 1.5, px: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField select size="small" label={i18nT('exposure.brand.caseType')}
          value={caseType} onChange={(e) => setCaseType(e.target.value as TakedownCaseType)}
          sx={{ minWidth: 180 }}>
          <MenuItem value="impersonation">{i18nT('exposure.brand.caseImpersonation')}</MenuItem>
          <MenuItem value="phishing">{i18nT('exposure.brand.casePhishing')}</MenuItem>
          <MenuItem value="fake_social">{i18nT('exposure.brand.caseFakeSocial')}</MenuItem>
          <MenuItem value="brand_abuse">{i18nT('exposure.brand.caseBrandAbuse')}</MenuItem>
        </TextField>
        <TextField select size="small" label={i18nT('exposure.brand.targetProvider')}
          value={target} onChange={(e) => setTarget(e.target.value as TakedownTarget)}
          sx={{ minWidth: 180 }}>
          {availableTargets.map((t) => (
            <MenuItem key={t} value={t}>
              {PROVIDER_KIND_LABELS[t] ?? (t === 'generic' ? i18nT('exposure.brand.generic') : t)}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ flex: 1 }} />
        {hasEdits && (
          <Button size="small" variant="text" startIcon={<RotateCcw size={13} />} onClick={resetToTemplate}
            sx={{ textTransform: 'none', borderRadius: 1.5, color: '#94a3b8' }}>
            {i18nT('exposure.brand.resetLetter')}
          </Button>
        )}
        <Button size="small" variant="outlined" startIcon={<Copy size={13} />} onClick={copyToClipboard}
          disabled={!letter} sx={{ textTransform: 'none', borderRadius: 1.5 }}>
          {i18nT('exposure.brand.copy')}
        </Button>
        <Button size="small" variant="outlined" startIcon={<Download size={13} />} onClick={downloadLetter}
          disabled={!letter} sx={{ textTransform: 'none', borderRadius: 1.5 }}>
          {i18nT('exposure.brand.downloadLetter')}
        </Button>
        <Button size="small" variant="contained" startIcon={pdfBusy ? <CircularProgress size={13} /> : <Printer size={13} />}
          onClick={exportPDF} disabled={!letter || pdfBusy}
          sx={{ textTransform: 'none', borderRadius: 1.5, bgcolor: '#7c3aed', boxShadow: 'none', '&:hover': { bgcolor: '#6d28d9', boxShadow: 'none' } }}>
          {pdfBusy
            ? i18nT('exposure.brand.pdfWorking')
            : i18nT('exposure.brand.downloadPDF')}
        </Button>
      </Box>

      {/* Editable letter — operators routinely need to soften
          language, add a brand-specific contact, or strip a field
          the auto-collector got wrong. Editing here keeps the
          export-to-PDF / copy / download flow one step instead of
          forcing the operator to bounce to a text editor. */}
      <Box sx={{ m: 2 }}>
        {loading && <Loading />}
        {err && (
          <Box sx={{ mb: 1 }}>
            <InlineErrorNotice error={err} />
          </Box>
        )}
        {!loading && (
          <TextField value={letter} onChange={(e) => setLetter(e.target.value)}
            multiline minRows={12} maxRows={20} fullWidth variant="outlined"
            placeholder={loading ? '' : i18nT('exposure.brand.letterPlaceholder')}
            slotProps={{
              input: {
                sx: {
                  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                  fontSize: 12, lineHeight: 1.55, bgcolor: 'rgba(0,0,0,0.20)',
                },
              },
            }}
          />
        )}
      </Box>
    </Dialog>
  )
}

// takedownLetterToHtml wraps the operator-edited markdown letter
// in a printable HTML shell so the PDF export carries minimal
// chrome (margins, monospaced body, header strip). Keeps the PDF
// route purely client-side — no backend round-trip needed.
function takedownLetterToHtml(md: string, targetDomain: string): string {
  const safeBody = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const safeDomain = targetDomain
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Takedown letter — ${safeDomain}</title>
<style>
  body { font-family: ui-monospace, "SF Mono", Menlo, monospace;
         font-size: 11pt; line-height: 1.55; color: #0f172a;
         padding: 32px 40px; max-width: 720px; margin: 0 auto; }
  .head { border-bottom: 2px solid #7c3aed; padding-bottom: 8px;
          margin-bottom: 16px; font-weight: 700; font-size: 14pt;
          color: #1e1b4b; }
  pre   { white-space: pre-wrap; word-wrap: break-word; margin: 0; }
  .foot { margin-top: 24px; border-top: 1px solid #cbd5e1;
          padding-top: 8px; font-size: 9pt; color: #475569; }
</style></head>
<body>
  <div class="head">Takedown letter — ${safeDomain}</div>
  <pre>${safeBody}</pre>
  <div class="foot">Drafted from publicly-collected evidence. The submitting
    party is responsible for verifying every claim and attaching proof of
    brand / trademark rights before sending to the receiving provider.</div>
</body></html>`
}
