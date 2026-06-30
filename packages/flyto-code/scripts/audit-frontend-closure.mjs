#!/usr/bin/env node
/**
 * Audit frontend data-closure risks:
 *   - page-like components that read engine data
 *   - inline React Query keys that bypass qk
 *   - mutations without an obvious direct/indirect cache closure
 *
 * Default mode is a report. CI may pass --fail-on-mutation-gaps to block new
 * mutations that do not either invalidate/refetch/set query data, route through
 * an invalidation callback, or carry an explicit @closure annotation
 * (local-result / download-only / redirect-only / callback). CI may also pass
 * --fail-on-inline-query-keys to require the qk registry instead of page-local
 * React Query cache keys.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const rootArg = process.argv.slice(2).find((arg) => !arg.startsWith('-'))
const root = path.resolve(rootArg ?? 'src-next')
const json = process.argv.includes('--json')
const failOnMutationGaps = process.argv.includes('--fail-on-mutation-gaps')
const failOnInlineQueryKeys = process.argv.includes('--fail-on-inline-query-keys')

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '__test__') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

function rel(file) {
  return path.relative(root, file)
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length
}

function extractCall(text, start) {
  const open = text.indexOf('(', start)
  if (open < 0) return text.slice(start, start + 2200)
  let depth = 0
  let quote = ''
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\') {
        i += 1
        continue
      }
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return text.slice(start, start + 2200)
}

const files = walk(root)
const pageFiles = files.filter((file) => /(View|Page|Tab|Panel)\.tsx$/.test(path.basename(file)))
const dataReadingPages = pageFiles.filter((file) => {
  const text = fs.readFileSync(file, 'utf8')
  return /useQuery\s*\(|request(?:Blob)?\s*(?:<[\s\S]*?>)?\(|fetch\s*\(/.test(text)
})

const inlineQueryKeys = []
const mutations = []

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  let m

  const keyRe = /queryKey\s*:\s*\[/g
  while ((m = keyRe.exec(text))) {
    inlineQueryKeys.push({ file: rel(file), line: lineOf(text, m.index) })
  }

  const mutRe = /useMutation\s*\(/g
  while ((m = mutRe.exec(text))) {
    const block = extractCall(text, m.index)
    const directClosure = /invalidateQueries|refetch\s*\(|setQueryData|invalidateFootprintClosure|invalidateFootprintProgress/.test(block)
    const indirectClosure = /\binvalidate\w*\s*(?:\(|[,}])|\b(?:onChange|onChanged|onRunComplete|onSaved|onDeleted)\s*\(/.test(block)
    const documentedClosure = /@closure\s+(?:local-result|download-only|redirect-only|callback)/.test(block)
    mutations.push({
      file: rel(file),
      line: lineOf(text, m.index),
      directClosure,
      indirectClosure,
      documentedClosure,
      hasClosure: directClosure || indirectClosure || documentedClosure,
    })
  }
}

const report = {
  root,
  files: files.length,
  page_like: pageFiles.length,
  data_reading_pages: dataReadingPages.length,
  inline_query_keys: inlineQueryKeys.length,
  inline_query_key_samples: inlineQueryKeys.slice(0, 40),
  mutations_total: mutations.length,
  mutations_without_obvious_closure: mutations.filter((m) => !m.hasClosure).length,
  mutation_gap_samples: mutations.filter((m) => !m.hasClosure).slice(0, 40),
}

if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} else {
  console.log(`files: ${report.files}`)
  console.log(`page-like components: ${report.page_like}`)
  console.log(`data-reading page-like components: ${report.data_reading_pages}`)
  console.log(`inline query keys: ${report.inline_query_keys}`)
  console.log(`mutations: ${report.mutations_total}`)
  console.log(`mutations without obvious closure: ${report.mutations_without_obvious_closure}`)
  if (report.mutation_gap_samples.length) {
    console.log('\nmutation gap samples:')
    for (const item of report.mutation_gap_samples) {
      console.log(`  ${item.file}:${item.line}`)
    }
  }
  if (report.inline_query_key_samples.length) {
    console.log('\ninline query key samples:')
    for (const item of report.inline_query_key_samples) {
      console.log(`  ${item.file}:${item.line}`)
    }
  }
}

if (failOnMutationGaps && report.mutations_without_obvious_closure > 0) {
  console.error(
    `frontend closure audit failed: ${report.mutations_without_obvious_closure} mutation(s) lack an obvious closure`,
  )
  process.exitCode = 1
}

if (failOnInlineQueryKeys && report.inline_query_keys > 0) {
  console.error(
    `frontend closure audit failed: ${report.inline_query_keys} inline query key(s) bypass qk`,
  )
  process.exitCode = 1
}
