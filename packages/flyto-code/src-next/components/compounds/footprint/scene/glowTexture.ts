/**
 * glowTexture — a soft radial-gradient sprite texture used as the additive
 * glow behind each node. Gives a bloom-like falloff (soft, round, fading to
 * nothing at the edge) WITHOUT a postprocessing pass — far prettier than a
 * hard low-opacity sphere, and effectively free (one 128px canvas, cached
 * for the lifetime of the tab, tinted per-node via the sprite material).
 */
import * as THREE from 'three'

let cached: THREE.Texture | null = null

export function glowTexture(): THREE.Texture {
  if (cached) return cached
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  // White core → tinted by spriteMaterial.color. Smooth multi-stop falloff
  // reads as a soft halo rather than a flat disc.
  g.addColorStop(0.0, 'rgba(255,255,255,1)')
  g.addColorStop(0.22, 'rgba(255,255,255,0.55)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.16)')
  g.addColorStop(1.0, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  cached = tex
  return tex
}
