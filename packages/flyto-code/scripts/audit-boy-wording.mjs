#!/usr/bin/env node
/**
 * Guard BOY / Research Footprint wording from over-claiming.
 *
 * BOY is a validation copilot. Product wording may prioritize, explain,
 * queue, and record validation, but it must not present unvalidated
 * multi-source evidence as confirmed compromise or proven exploitability.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const RUNTIME_FILES = [
  'src-next/components/compounds/footprint/BreakthroughCandidatesPanel.tsx',
  'src-next/components/compounds/footprint/ResearchFootprintDrawer.tsx',
  'src-next/components/compounds/footprint/FootprintGraphView.tsx',
  'src-next/components/compounds/footprint/FootprintManagerView.tsx',
]

const I18N_FILES = [
  '../flyto-i18n/locales/code/en/code.json',
  '../flyto-i18n/locales/code/zh-TW/code.json',
  '../flyto-i18n/locales/code/zh-CN/code.json',
]

const BANNED = [
  { pattern: /\bconfirmed compromise\b/i, reason: 'Use contested/needs validation language until empirical validation completes.' },
  { pattern: /\bconfirmed breach\b/i, reason: 'BOY evidence candidates must not be labeled as confirmed breach.' },
  { pattern: /\bproven exploitable\b/i, reason: 'Use recorded validation result, not proven exploitable.' },
  { pattern: /\bcomplete as exploitable\b/i, reason: 'Use "Record result: exploitable" so this is clearly analyst-entered validation.' },
  { pattern: /\bthis is exploitable\b/i, reason: 'BOY should queue validation instead of declaring exploitability.' },
  { pattern: /\bguaranteed\b/i, reason: 'Avoid certainty language in evidence/reliability UI.' },
  { pattern: /\b100%\s*(confidence|validated|confirmed|true)\b/i, reason: 'Avoid false precision/certainty in evidence UI.' },
]

const REQUIRED = [
  'Record result: exploitable',
  'Record result: not exploitable',
  'Evidence-derived attack-path hypotheses with validation status',
  'Validation queue',
  'Source Ledger',
  'Weighted Confidence',
  'Reliability',
  'Corroboration',
  'Conflicts',
  'Active verifier',
  'needs validation',
]

function readExisting(relPath) {
  const full = path.resolve(ROOT, relPath)
  if (!fs.existsSync(full)) return ''
  return fs.readFileSync(full, 'utf8')
}

function lineFor(text, index) {
  return text.slice(0, index).split(/\r?\n/).length
}

const files = [...RUNTIME_FILES, ...I18N_FILES]
const findings = []
const combined = []

for (const rel of files) {
  const text = readExisting(rel)
  if (!text) continue
  combined.push(text)
  for (const rule of BANNED) {
    const match = rule.pattern.exec(text)
    if (!match) continue
    findings.push({ file: rel, line: lineFor(text, match.index), match: match[0], reason: rule.reason })
  }
}

const allText = combined.join('\n')
const missing = REQUIRED.filter((phrase) => !allText.includes(phrase))

if (findings.length || missing.length) {
  if (findings.length) {
    console.error('BOY wording over-claim findings:')
    for (const f of findings) console.error(`- ${f.file}:${f.line}: "${f.match}" — ${f.reason}`)
  }
  if (missing.length) {
    console.error('BOY wording required phrases missing:')
    for (const phrase of missing) console.error(`- ${phrase}`)
  }
  process.exit(1)
}

console.log(`BOY wording audit: PASS (${files.length} files checked)`)
