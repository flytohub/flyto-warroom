#!/usr/bin/env node
/** Generate deterministic, source-backed Flyto2 Code reference documents. */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHECK = process.argv.includes('--check')
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx'])
const TEST_MARKERS = ['/__tests__/', '/test/', '/tests/', '.spec.', '.test.']

function trackedFiles() {
  const result = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: ROOT, encoding: 'utf8' },
  )
  if (result.status !== 0) throw new Error(result.stderr || 'git ls-files failed')
  return result.stdout.split(/\r?\n/).filter(Boolean).sort()
}

function isTest(relative) {
  const normalized = `/${relative.toLowerCase()}`
  return TEST_MARKERS.some((marker) => normalized.includes(marker))
}

function scriptKind(relative) {
  if (relative.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (relative.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (relative.endsWith('.ts')) return ts.ScriptKind.TS
  return ts.ScriptKind.JS
}

function parseSource(relative) {
  const absolute = path.join(ROOT, relative)
  return ts.createSourceFile(
    relative,
    fs.readFileSync(absolute, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKind(relative),
  )
}

function nodeName(node, source) {
  if (!node) return ''
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text
  return node.getText(source).replace(/\s+/g, ' ').slice(0, 80)
}

function callableInitializer(node) {
  if (!node) return false
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return true
  if (!ts.isCallExpression(node)) return false
  const wrapper = node.expression.getText().split('.').at(-1) || ''
  if (!/^(?:forwardRef|lazy|memo|observer|styled|with[A-Z])/.test(wrapper)) return false
  return node.arguments.some((argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument))
}

function declarationInfo(node, source, relative) {
  let name = ''
  let kind = ''
  let signatureNode = node

  if (ts.isFunctionDeclaration(node) && (node.name || node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword))) {
    name = node.name?.text || `default:${path.basename(relative, path.extname(relative))}`
    kind = 'function'
  } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && callableInitializer(node.initializer)) {
    name = node.name.text
    kind = 'function'
  } else if (ts.isClassDeclaration(node) && (node.name || node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword))) {
    name = node.name?.text || `default:${path.basename(relative, path.extname(relative))}`
    kind = 'class'
  } else if (ts.isInterfaceDeclaration(node)) {
    name = node.name.text
    kind = 'interface'
  } else if (ts.isTypeAliasDeclaration(node)) {
    name = node.name.text
    kind = 'type'
  } else if (ts.isEnumDeclaration(node)) {
    name = node.name.text
    kind = 'enum'
  } else if (ts.isConstructorDeclaration(node)) {
    name = 'constructor'
    kind = 'constructor'
  } else if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    name = nodeName(node.name, source)
    kind = ts.isMethodSignature(node) ? 'method contract' : 'method'
  } else if (ts.isPropertyDeclaration(node) && callableInitializer(node.initializer)) {
    name = nodeName(node.name, source)
    kind = 'method'
  } else if (ts.isPropertyAssignment(node) && callableInitializer(node.initializer)) {
    name = nodeName(node.name, source)
    kind = 'object callback'
  } else if (ts.isPropertySignature(node) && node.type && ts.isFunctionTypeNode(node.type)) {
    name = nodeName(node.name, source)
    kind = 'callback contract'
  } else {
    return null
  }

  let owner = ''
  for (let parent = node.parent; parent; parent = parent.parent) {
    if ((ts.isClassDeclaration(parent) || ts.isInterfaceDeclaration(parent)) && parent.name) {
      owner = parent.name.text
      break
    }
  }
  if (owner && !['class', 'interface'].includes(kind)) name = `${owner}.${name}`

  const bareName = name.split('.').at(-1) || name
  if ((kind === 'function' || kind === 'object callback') && relative.endsWith('.tsx') && /^[A-Z]/.test(bareName)) {
    kind = 'React component'
  } else if (kind === 'function' && /^use[A-Z0-9]/.test(bareName)) {
    kind = 'React hook'
  }

  if (ts.isVariableDeclaration(node) && node.initializer) signatureNode = node.initializer
  return { name, kind, signatureNode }
}

function jsDoc(node) {
  const comments = node.jsDoc ?? []
  const text = comments
    .map((doc) => (typeof doc.comment === 'string' ? doc.comment : ''))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text
}

function words(name) {
  return name
    .split('.').at(-1)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
}

function areaFor(relative) {
  if (relative.includes('/@fuse/')) return 'the Fuse application shell'
  if (relative.includes('/@auth/')) return 'authentication'
  if (relative.includes('/components/')) return 'the user interface'
  if (relative.includes('/hooks/')) return 'application state'
  if (relative.includes('/lib/engine/')) return 'the Flyto2 Engine client'
  if (relative.includes('/lib/cloud/')) return 'the Flyto2 Cloud client'
  if (relative.includes('/types/')) return 'shared product contracts'
  if (relative.startsWith('scripts/')) return 'repository automation'
  return 'the application'
}

function actionDescription(name) {
  const subject = words(name)
  const rules = [
    [/^(?:get|fetch|load|read|list)\s+(.+)/, 'Retrieves $1'],
    [/^(?:create|build|make|generate|compose)\s+(.+)/, 'Builds $1'],
    [/^(?:set|update|write|save|store|apply)\s+(.+)/, 'Updates $1'],
    [/^(?:delete|remove|clear|reset|revoke)\s+(.+)/, 'Removes or resets $1'],
    [/^(?:parse|decode|deserialize)\s+(.+)/, 'Parses $1'],
    [/^(?:encode|serialize|format|export)\s+(.+)/, 'Formats or exports $1'],
    [/^(?:normalize|map|transform|convert|adapt)\s+(.+)/, 'Transforms $1'],
    [/^(?:validate|check|audit|verify|assert)\s+(.+)/, 'Validates $1'],
    [/^(?:resolve|find|select|filter|match)\s+(.+)/, 'Resolves $1'],
    [/^(?:render|show|display)\s+(.+)/, 'Renders $1'],
    [/^(?:handle|on)\s+(.+)/, 'Handles $1'],
    [/^(?:is|has|can|should)\s+(.+)/, 'Determines whether $1'],
  ]
  for (const [pattern, replacement] of rules) {
    if (pattern.test(subject)) return subject.replace(pattern, replacement)
  }
  return `Implements ${subject}`
}

function fallbackDescription(info, relative) {
  const action = words(info.name)
  const area = areaFor(relative)
  if (info.kind === 'React component') return `Renders the ${action} interface for ${area}.`
  if (info.kind === 'React hook') return `Provides ${action} state and operations for ${area}.`
  if (['interface', 'type', 'enum', 'callback contract', 'method contract'].includes(info.kind)) {
    return `Defines the ${action} contract used by ${area}.`
  }
  if (info.kind === 'class') return `Defines the ${action} implementation for ${area}.`
  if (info.kind === 'constructor') return `Initializes ${info.name.split('.')[0]} for ${area}.`
  return `${actionDescription(info.name)} for ${area}.`
}

function signatureFor(node, info, source) {
  let text = ''
  if (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) {
    const type = node.type ? `: ${node.type.getText(source)}` : ''
    let initializer = node.initializer?.getText(source) ?? ''
    if (node.initializer && 'body' in node.initializer && node.initializer.body) {
      initializer = source.text.slice(node.initializer.getStart(source), node.initializer.body.getStart(source))
    }
    text = `${node.name.getText(source)}${type} = ${initializer}`
  } else if ('body' in node && node.body) {
    text = source.text.slice(node.getStart(source), node.body.getStart(source))
  } else {
    text = info.signatureNode.getText(source)
  }
  return text.replace(/\s+/g, ' ').replace(/\s*\{\s*$/, '').trim().slice(0, 260)
}

function collectDeclarations(relative, source) {
  const records = []
  function visit(node) {
    const info = declarationInfo(node, source, relative)
    if (info) {
      const position = source.getLineAndCharacterOfPosition(node.getStart(source))
      records.push({
        file: relative,
        line: position.line + 1,
        name: info.name,
        kind: info.kind,
        signature: signatureFor(node, info, source),
        description: jsDoc(node) || fallbackDescription(info, relative),
        fallback: !jsDoc(node),
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return records
}

function propertyName(property, source) {
  if (!property.name) return ''
  return nodeName(property.name, source)
}

function propertyInitializer(object, key, source) {
  const property = object.properties.find(
    (candidate) => ts.isPropertyAssignment(candidate) && propertyName(candidate, source) === key,
  )
  return property?.initializer ?? null
}

function staticValue(node) {
  if (!node) return ''
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (node.kind === ts.SyntaxKind.TrueKeyword) return 'true'
  if (node.kind === ts.SyntaxKind.FalseKeyword) return 'false'
  return ''
}

function nestedStaticValue(object, parentKey, childKey, source) {
  const parent = propertyInitializer(object, parentKey, source)
  if (!parent || !ts.isObjectLiteralExpression(parent)) return ''
  return staticValue(propertyInitializer(parent, childKey, source))
}

function collectRoutes(relative, source) {
  const records = []
  const routeSource =
    relative.endsWith('/route.tsx') ||
    relative.endsWith('routesConfig.tsx') ||
    relative.includes('/types/module-manifests/')
  if (!routeSource || isTest(relative)) return records

  function visit(node) {
    if (ts.isPropertyAssignment(node) && propertyName(node, source) === 'path') {
      const routePath = staticValue(node.initializer)
      const object = node.parent
      if (routePath && ts.isObjectLiteralExpression(object)) {
        const text = object.getText(source)
        const importTarget = text.match(/import\(\s*['"]([^'"]+)['"]\s*\)/)?.[1] ?? ''
        const position = source.getLineAndCharacterOfPosition(node.getStart(source))
        records.push({
          file: relative,
          line: position.line + 1,
          path: routePath,
          id: staticValue(propertyInitializer(object, 'id', source)),
          capability: staticValue(propertyInitializer(object, 'capability', source)),
          label: nestedStaticValue(object, 'sidebar', 'fallback', source),
          target: importTarget,
          kind: relative.includes('/types/module-manifests/') ? 'module' : 'route',
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return records
}

function collectEndpoints(relative, text) {
  if (isTest(relative) || !relative.startsWith('src-next/')) return []
  const records = []
  const pattern = /(["'`])((?:\/api\/|\/v\d\/|\/health(?:\/|\b)|\/oauth(?:\/|\b)|\/auth(?:\/|\b)|\/mcp(?:\/|\b)|\/runtime-events(?:\/|\b))[^"'`\s]*)\1/g
  for (const match of text.matchAll(pattern)) {
    const line = text.slice(0, match.index).split(/\r?\n/).length
    records.push({
      file: relative,
      line,
      path: match[2],
      scope: relative.includes('/@mock-utils/') ? 'template mock' : 'product client',
    })
  }
  return records
}

function collectEnvironment(relative, text) {
  const records = []
  const patterns = [
    /(?:import\.meta\.env\.|process\.env\.)([A-Z][A-Z0-9_]+)/g,
    /process\.env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g,
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const line = text.slice(0, match.index).split(/\r?\n/).length
      records.push({ file: relative, line, name: match[1] })
    }
  }
  return records
}

function escapeCell(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/`/g, "'").replace(/\r?\n/g, ' ')
}

function sourceLink(relative, line) {
  return `<../../${relative}#L${line}>`
}

function sourceReference(records) {
  const files = new Map()
  for (const record of records) {
    if (!files.has(record.file)) files.set(record.file, [])
    files.get(record.file).push(record)
  }
  const lines = [
    '# Source API Reference',
    '',
    '<!-- Generated by scripts/generate-documentation-reference.mjs. Do not edit manually. -->',
    '',
    `This inventory documents **${records.length.toLocaleString('en-US')}** named classes, components, hooks, functions, methods, and TypeScript contracts across **${files.size.toLocaleString('en-US')}** production source and automation files. Descriptions use source JSDoc when present and deterministic action descriptions otherwise.`,
    '',
    'Use the source links for implementation details; this file is a discoverability index, not a substitute for domain guides.',
    '',
  ]
  for (const [file, items] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## \`${file}\``, '', '| Symbol | Kind | Signature | Responsibility |', '|---|---|---|---|')
    for (const item of items.sort((a, b) => a.line - b.line || a.name.localeCompare(b.name))) {
      lines.push(
        `| [\`${escapeCell(item.name)}\`](${sourceLink(item.file, item.line)}) | ${escapeCell(item.kind)} | \`${escapeCell(item.signature)}\` | ${escapeCell(item.description)} |`,
      )
    }
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

function routesReference(routes) {
  const unique = [...new Map(routes.map((route) => [`${route.file}:${route.line}:${route.path}`, route])).values()]
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path) || a.file.localeCompare(b.file))
  const moduleCount = unique.filter((route) => route.kind === 'module').length
  const lines = [
    '# Routes And Module Surfaces',
    '',
    '<!-- Generated by scripts/generate-documentation-reference.mjs. Do not edit manually. -->',
    '',
    `The source declares **${unique.length}** static route paths, including **${moduleCount}** module-manifest surfaces. A route existing here means the frontend can resolve it; runtime availability is still controlled by engine capabilities and edition policy.`,
    '',
    '| Path | Kind | Module ID | Capability | Navigation label | Lazy target | Source |',
    '|---|---|---|---|---|---|---|',
  ]
  for (const route of unique) {
    lines.push(
      `| \`${escapeCell(route.path)}\` | ${route.kind} | ${escapeCell(route.id)} | ${escapeCell(route.capability)} | ${escapeCell(route.label)} | \`${escapeCell(route.target)}\` | [\`${route.file}:${route.line}\`](${sourceLink(route.file, route.line)}) |`,
    )
  }
  lines.push('')
  return `${lines.join('\n')}\n`
}

function httpEnvironmentReference(endpoints, environment) {
  const uniqueEndpoints = [...new Map(endpoints.map((item) => [`${item.file}:${item.line}:${item.path}`, item])).values()]
    .sort((a, b) => a.path.localeCompare(b.path) || a.file.localeCompare(b.file) || a.line - b.line)
  const envGroups = new Map()
  for (const item of environment) {
    if (!envGroups.has(item.name)) envGroups.set(item.name, [])
    envGroups.get(item.name).push(item)
  }
  const productEndpoints = uniqueEndpoints.filter((item) => item.scope === 'product client').length
  const mockEndpoints = uniqueEndpoints.length - productEndpoints
  const lines = [
    '# HTTP And Environment Reference',
    '',
    '<!-- Generated by scripts/generate-documentation-reference.mjs. Do not edit manually. -->',
    '',
    `This source scan found **${productEndpoints}** product-client endpoint literals, **${mockEndpoints}** Fuse template-mock endpoint literals, and **${envGroups.size}** environment-variable names. Dynamic path fragments remain in template-literal form. No environment values are recorded.`,
    '',
    '## Client Endpoints',
    '',
    '| Path template | Scope | Source |',
    '|---|---|---|',
  ]
  for (const endpoint of uniqueEndpoints) {
    lines.push(`| \`${escapeCell(endpoint.path)}\` | ${endpoint.scope} | [\`${endpoint.file}:${endpoint.line}\`](${sourceLink(endpoint.file, endpoint.line)}) |`)
  }
  lines.push('', '## Environment Variables', '', '| Variable | Referenced from |', '|---|---|')
  for (const [name, references] of [...envGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const links = references
      .slice(0, 12)
      .map((item) => `[\`${item.file}:${item.line}\`](${sourceLink(item.file, item.line)})`)
      .join('<br>')
    lines.push(`| \`${name}\` | ${links} |`)
  }
  lines.push('')
  return `${lines.join('\n')}\n`
}

function writeOrCheck(relative, content) {
  const absolute = path.join(ROOT, relative)
  if (CHECK) {
    if (!fs.existsSync(absolute) || fs.readFileSync(absolute, 'utf8') !== content) {
      throw new Error(`${relative} is stale; run npm run docs:generate`)
    }
    return
  }
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, content)
  console.log(`wrote ${relative}`)
}

const files = trackedFiles()
const sourceFiles = files.filter((relative) => {
  if (!SOURCE_EXTENSIONS.has(path.extname(relative)) || isTest(relative)) return false
  return relative.startsWith('src-next/') || relative.startsWith('scripts/') || relative.endsWith('.config.js') || relative.endsWith('.config.ts') || relative.endsWith('.config.mjs')
})
const sourceFileSet = new Set(sourceFiles)

const declarations = []
const routes = []
const endpoints = []
const environment = []
for (const relative of files) {
  const absolute = path.join(ROOT, relative)
  let text = ''
  try {
    text = fs.readFileSync(absolute, 'utf8')
  } catch {
    continue
  }
  if (sourceFileSet.has(relative) || relative.startsWith('.env')) {
    environment.push(...collectEnvironment(relative, text))
  }
  if (!sourceFileSet.has(relative)) continue
  const source = parseSource(relative)
  declarations.push(...collectDeclarations(relative, source))
  routes.push(...collectRoutes(relative, source))
  endpoints.push(...collectEndpoints(relative, text))
}

writeOrCheck('docs/reference/source-api.md', sourceReference(declarations))
writeOrCheck('docs/reference/routes-and-modules.md', routesReference(routes))
writeOrCheck('docs/reference/http-and-environment.md', httpEnvironmentReference(endpoints, environment))

console.log(
  `documentation inventory: files=${sourceFiles.length}, declarations=${declarations.length} ` +
  `(fallback=${declarations.filter((item) => item.fallback).length}), routes=${routes.length}, ` +
  `endpoints=${endpoints.length}, env=${new Set(environment.map((item) => item.name)).size}`,
)
