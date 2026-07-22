import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import * as tokens from '../src/index.js'

const requiredExports = [
  'purple', 'cyan', 'semantic', 'surface', 'text', 'border',
  'brandPrimary', 'brandAccent', 'glassCard',
  'shadowTokens', 'focusRing', 'glow',
  'durations', 'easings', 'keyframeNames', 'animationShorthands',
  'radiiTokens', 'nodeRadii', 'spacingTokens', 'layout', 'fonts', 'typeScale',
]

for (const name of requiredExports) {
  assert.ok(name in tokens, `missing JavaScript export: ${name}`)
}

const css = await readFile(new URL('../css/tokens.css', import.meta.url), 'utf8')
const animations = await readFile(new URL('../css/animations.css', import.meta.url), 'utf8')
const declarations = await readFile(new URL('../src/index.d.ts', import.meta.url), 'utf8')

const cssVariables = [
  '--flyto-purple-500', '--flyto-cyan-500', '--flyto-success',
  '--flyto-gradient-brand-primary', '--flyto-shadow-focus',
  '--flyto-radius-lg', '--flyto-font-sans', '--flyto-duration-normal',
]
for (const name of cssVariables) {
  assert.ok(css.includes(`${name}:`), `missing CSS variable: ${name}`)
}

for (const name of Object.values(tokens.keyframeNames)) {
  assert.ok(animations.includes(`@keyframes ${name}`), `missing keyframe: ${name}`)
}

for (const name of Object.keys(tokens)) {
  assert.match(declarations, new RegExp(`\\b${name}\\b`), `missing TypeScript declaration: ${name}`)
}

process.stdout.write(`design token contract passed: ${Object.keys(tokens).length} exports\n`)
