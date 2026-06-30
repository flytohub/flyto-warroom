import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const pageDir = path.join(root, 'src-next/app/(control-panel)/flyto/workspace/components/pages')
const routeFile = path.join(root, 'src-next/app/(control-panel)/flyto/workspace/route.tsx')
const sidebarFile = path.join(root, 'src-next/app/(control-panel)/flyto/workspace/components/WorkspaceSidebar.tsx')
const failures = []

const routeSource = fs.readFileSync(routeFile, 'utf8')
const routeRel = path.relative(root, routeFile).replaceAll(path.sep, '/')
check(
  !/\blazy\s*\(\s*mod\.lazyImport\s*\)/.test(routeSource),
  routeRel,
  'workspace generated routes must use WorkspacePageLoader instead of React.lazy(mod.lazyImport)',
)
check(
  !/\bconst\s+PageComponent\s*=\s*lazy\s*\(\s*mod\.lazyImport\s*\)/.test(routeSource),
  routeRel,
  'workspace generated routes must not cache module imports through React.lazy',
)
check(
  /\bWorkspacePageLoader\b/.test(routeSource),
  routeRel,
  'workspace generated routes must render WorkspacePageLoader so module-load errors stay inside the workspace',
)

const sidebarSource = fs.readFileSync(sidebarFile, 'utf8')
const sidebarRel = path.relative(root, sidebarFile).replaceAll(path.sep, '/')
check(
  !/mod\.lazyImport\s*\(\s*\)\s*\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(sidebarSource),
  sidebarRel,
  'sidebar must not swallow rejected dynamic imports from hover prefetch',
)
check(
  !/mod\.lazyImport\s*\(\s*\)/.test(sidebarSource),
  sidebarRel,
  'sidebar must not directly call module lazyImport; route loader owns retries and fallback UI',
)

for (const fileName of fs.readdirSync(pageDir).filter((name) => name.endsWith('.tsx'))) {
  const filePath = path.join(pageDir, fileName)
  const source = fs.readFileSync(filePath, 'utf8')
  const rel = path.relative(root, filePath).replaceAll(path.sep, '/')

  check(!/\blazy\s*\(/.test(source), rel, 'page wrappers must not add a second lazy() import boundary')
  check(!/<\s*Suspense\b/.test(source), rel, 'page wrappers must not add nested Suspense; PageShell/route owns fallback UI')
  check(!/\breturn\s+null\s*;?/.test(source), rel, 'page wrappers must render an explicit fallback instead of return null')
  check(!/\b(?:orgId|repoId|sectionId)!\b/.test(source), rel, 'route params must be guarded before use, not non-null asserted')
}

if (failures.length > 0) {
  console.error('Page guard audit failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Page guard audit passed')

function check(condition, rel, message) {
  if (!condition) failures.push(`${rel}: ${message}`)
}
