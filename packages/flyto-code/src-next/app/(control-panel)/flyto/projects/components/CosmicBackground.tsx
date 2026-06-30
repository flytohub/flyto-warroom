/**
 * CosmicBackground — a live particle / constellation field behind the
 * projects hero. Drifting nodes that link up when near, evoking both a
 * star-field and the kernel's living asset-correlation graph.
 *
 * Canvas + requestAnimationFrame (no deps). Bounded to a hero-height
 * band with a bottom fade so it never paints the whole scroll height.
 * Honours prefers-reduced-motion (renders one static frame, no loop) and
 * pauses when the tab is hidden. Behind content, pointer-events:none.
 */
import { useEffect, useRef } from 'react'
import Box from '@mui/material/Box'

interface P { x: number; y: number; vx: number; vy: number; r: number }

const HERO_BAND = 620 // px the field covers from the top

export function CosmicBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0, h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let particles: P[] = []
    let raf = 0
    let running = true

    const LINK = 132        // px distance to draw a link
    const VIOLET = '139,92,246'
    const BLUE = '59,130,246'

    function resize() {
      w = wrap!.clientWidth
      h = HERO_BAND
      canvas!.width = Math.floor(w * dpr)
      canvas!.height = Math.floor(h * dpr)
      canvas!.style.width = `${w}px`
      canvas!.style.height = `${h}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      const target = Math.min(90, Math.round((w * h) / 14000))
      particles = Array.from({ length: target }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r: Math.random() * 1.6 + 0.7,
      }))
    }

    function frame() {
      ctx!.clearRect(0, 0, w, h)
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy
        if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20
        if (p.y < -20) p.y = h + 20; else if (p.y > h + 20) p.y = -20
      }
      // links
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < LINK * LINK) {
            const o = (1 - Math.sqrt(d2) / LINK) * 0.5
            ctx!.strokeStyle = `rgba(${VIOLET},${o.toFixed(3)})`
            ctx!.lineWidth = 0.7
            ctx!.beginPath(); ctx!.moveTo(a.x, a.y); ctx!.lineTo(b.x, b.y); ctx!.stroke()
          }
        }
      }
      // nodes (soft glow)
      for (const p of particles) {
        const g = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4)
        g.addColorStop(0, `rgba(${p.r > 1.6 ? BLUE : VIOLET},0.9)`)
        g.addColorStop(1, `rgba(${VIOLET},0)`)
        ctx!.fillStyle = g
        ctx!.beginPath(); ctx!.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2); ctx!.fill()
        ctx!.fillStyle = `rgba(${VIOLET},0.9)`
        ctx!.beginPath(); ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx!.fill()
      }
      if (running && !reduced) raf = requestAnimationFrame(frame)
    }

    resize()
    frame() // one frame (static if reduced)

    const onResize = () => resize()
    window.addEventListener('resize', onResize)
    const onVis = () => {
      if (document.hidden) { running = false; cancelAnimationFrame(raf) }
      else if (!reduced) { running = true; raf = requestAnimationFrame(frame) }
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return (
    <Box
      ref={wrapRef}
      aria-hidden
      sx={{
        position: 'absolute',
        top: 0, left: 0, right: 0, height: HERO_BAND,
        zIndex: 0,
        pointerEvents: 'none',
        // fade the field out toward the bottom so it blends into content
        maskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)',
        opacity: 0.9,
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </Box>
  )
}
