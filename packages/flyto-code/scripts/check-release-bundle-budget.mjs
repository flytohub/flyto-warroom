import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const root = process.cwd()
const assetsDir = path.join(root, 'dist-next', 'assets')
const outDir = path.join(root, 'out', 'release')
const reportPath = path.join(outDir, 'bundle-budget.json')

const budget = {
  totalGzipBytes: 2_560_000,
  maxEntrypointGzipBytes: 460_000,
  maxNonAllowlistedGzipBytes: 614_400,
  allowlistedChunkPatterns: [
    /^three-vendor-/,
    /^charts-vendor-/,
    /^editor-vendor-/,
    /^firebase-vendor-/,
    /^mui-vendor-/,
    /^react-vendor-/,
  ],
}

function fail(message) {
  throw new Error(message)
}

if (!fs.existsSync(assetsDir)) {
  fail('dist-next/assets is missing. Run npm run build before release:bundle-budget.')
}

const chunks = fs.readdirSync(assetsDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => {
    const filePath = path.join(assetsDir, name)
    const bytes = fs.readFileSync(filePath)
    const gzipBytes = zlib.gzipSync(bytes).byteLength
    const allowlisted = budget.allowlistedChunkPatterns.some((pattern) => pattern.test(name))
    return {
      name,
      rawBytes: bytes.byteLength,
      gzipBytes,
      allowlisted,
    }
  })
  .sort((a, b) => b.gzipBytes - a.gzipBytes)

if (chunks.length === 0) {
  fail('No JavaScript chunks found in dist-next/assets.')
}

const totalGzipBytes = chunks.reduce((total, chunk) => total + chunk.gzipBytes, 0)
const entrypoint = chunks.find((chunk) => /^index-next-.*\.js$/.test(chunk.name))
const violations = []

if (totalGzipBytes > budget.totalGzipBytes) {
  violations.push(`total gzip ${totalGzipBytes} exceeds budget ${budget.totalGzipBytes}`)
}

if (!entrypoint) {
  violations.push('entrypoint chunk index-next-*.js was not found')
} else if (entrypoint.gzipBytes > budget.maxEntrypointGzipBytes) {
  violations.push(`entrypoint gzip ${entrypoint.gzipBytes} exceeds budget ${budget.maxEntrypointGzipBytes}`)
}

for (const chunk of chunks) {
  if (!chunk.allowlisted && chunk.gzipBytes > budget.maxNonAllowlistedGzipBytes) {
    violations.push(`${chunk.name} gzip ${chunk.gzipBytes} exceeds non-allowlisted budget ${budget.maxNonAllowlistedGzipBytes}`)
  }
}

const report = {
  project: 'flyto-code',
  generatedAt: new Date().toISOString(),
  budget,
  totalGzipBytes,
  chunkCount: chunks.length,
  topChunks: chunks.slice(0, 20),
  violations,
}

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

if (violations.length > 0) {
  console.error(`Release bundle budget failed. Report: ${reportPath}`)
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log(`Release bundle budget passed: ${chunks.length} chunks, ${Math.round(totalGzipBytes / 1024)} KiB gzip`)
