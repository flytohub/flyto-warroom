#!/usr/bin/env node
/**
 * Fails when runtime UI source adds user-facing English outside flyto-i18n.
 *
 * Scope is intentionally runtime-facing source under src-next. Tests, Fuse
 * template code, local i18n plumbing, mock utilities, and Tiptap vendor UI are
 * excluded because they are not flyto-code product UI copy.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src-next')

const SKIP_PARTS = new Set([
  '__tests__',
  '@fuse',
  '@i18n',
  '@mock-utils',
  'tiptap',
  'node_modules',
])

const UI_ATTRS = [
  'label',
  'title',
  'placeholder',
  'aria-label',
  'aria-description',
  'name',
  'description',
  'desc',
  'tooltip',
  'hint',
  'message',
  'summary',
  'subtitle',
  'heading',
  'helperText',
  'helpertext',
  'header',
  'primaryText',
]

const UI_PROPS = [
  'label',
  'title',
  'name',
  'description',
  'desc',
  'tooltip',
  'hint',
  'message',
  'summary',
  'subtitle',
  'heading',
  'text',
  'primary',
  'caption',
  'placeholder',
]

const TECHNICAL = new Set([
  'true',
  'false',
  'undefined',
  'null',
  'auto',
  'none',
  'inherit',
  'small',
  'medium',
  'large',
  'fullWidth',
  'standard',
  'outlined',
  'contained',
  'text',
  'default',
  'primary',
  'secondary',
  'success',
  'warning',
  'error',
  'info',
  'POST',
  'GET',
  'PUT',
  'PATCH',
  'DELETE',
  'JSON',
  'API',
  'URL',
  'HTTP',
  'HTTPS',
  'RBAC',
  'SSO',
  'MFA',
  'CI',
  'CD',
])

const URL_RX = /^(https?:\/\/|\/|\.\/|\.\.\/|file:|data:|mailto:|tel:)/
const IDENT_RX = /^([a-z_][a-z0-9_]*$|[a-z][a-zA-Z0-9]+$|\d|--|kebab|camelCase)$/
const ATTR_RX = new RegExp(`\\b(${UI_ATTRS.join('|')})\\s*=\\s*["']([A-Z][a-zA-Z][a-zA-Z0-9 ,'À-ÿ/().!?:&-]{3,140})["']`, 'g')
const PROP_RX = new RegExp(`\\b(${UI_PROPS.join('|')})\\s*:\\s*["']([A-Z][a-zA-Z][a-zA-Z0-9 ,'À-ÿ/().!?:&-]{3,140})["']`, 'g')
const JSX_TEXT_RX = />\s*([A-Z][a-zA-Z][a-zA-Z0-9 ,'À-ÿ/().!?:&-]{3,140})\s*</g
const TERNARY_RX = /\?\s*["']([A-Z][a-zA-Z][a-zA-Z0-9 ,'À-ÿ/().!?:&-]{3,140})["']/g
const RETURN_RX = /\breturn\s+["']([A-Z][a-zA-Z][a-zA-Z0-9 ,'À-ÿ/().!?:&-]{3,140})["']/g
const CALL_RX = /\b(enqueueSnackbar|setLiveMsg|alert|setError|setStatus|toast)\s*\(\s*["']([A-Z][a-zA-Z][a-zA-Z0-9 ,'À-ÿ/().!?:&-]{3,140})["']/g
const TOR_STATIC_RX = /\btOr\s*\(\s*[^,\n]+,\s*["']([A-Z][a-zA-Z][^"'\n]{2,180})["']/g
const ZOD_MESSAGE_RX = /\.(email|nonempty|min|max|length|url|regex|refine)\s*\([^)]*["']([A-Z][a-zA-Z][a-zA-Z0-9 ,'À-ÿ/().!?:&-]{3,180})["']/g

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_PARTS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.[tj]sx?$/.test(entry.name)) out.push(full)
  }
  return out
}

function isUiText(value) {
  const s = String(value ?? '').trim()
  if (s.length < 4) return false
  if (!/[A-Za-z]/.test(s)) return false
  if (TECHNICAL.has(s)) return false
  if (URL_RX.test(s)) return false
  if (IDENT_RX.test(s)) return false
  if (!s.includes(' ') && !/[.!?'/:&-]/.test(s)) return false
  return true
}

function isComment(line, offset) {
  const head = line.slice(0, offset)
  const slash = head.lastIndexOf('//')
  if (slash < 0) return false
  const quotes = (head.slice(0, slash).match(/['"]/g) ?? []).length
  return quotes % 2 === 0
}

const findings = []

for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file)
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\n/)
  const isTsx = file.endsWith('.tsx')

  lines.forEach((line, idx) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return

    const checks = [
      ['tOr_static_fallback', TOR_STATIC_RX, 1],
      ...(isTsx ? [
        ['jsx_attr', ATTR_RX, 2],
        ['object_prop', PROP_RX, 2],
        ['jsx_text', JSX_TEXT_RX, 1],
        ['ternary_string', TERNARY_RX, 1],
        ['return_string', RETURN_RX, 1],
        ['call_string', CALL_RX, 2],
        ['zod_message', ZOD_MESSAGE_RX, 2],
      ] : []),
    ]

    for (const [kind, rx, group] of checks) {
      rx.lastIndex = 0
      for (const match of line.matchAll(rx)) {
        const value = match[group]
        if (!value || !isUiText(value)) continue
        if (kind === 'object_prop' && /\b(labelKey|titleKey|nameKey|descKey|hintKey|valueKey|i18nKey)\s*:/.test(line)) continue
        if (isComment(line, match.index ?? 0)) continue
        findings.push({ file: rel, line: idx + 1, kind, value: value.trim() })
      }
    }
  })
}

if (findings.length > 0) {
  console.error(`runtime i18n hardcoded English audit failed: ${findings.length} finding(s)`)
  for (const f of findings.slice(0, 120)) {
    console.error(`${f.file}:${f.line} [${f.kind}] ${JSON.stringify(f.value)}`)
  }
  if (findings.length > 120) console.error(`... and ${findings.length - 120} more`)
  process.exit(1)
}

console.log('runtime i18n hardcoded English audit passed')
