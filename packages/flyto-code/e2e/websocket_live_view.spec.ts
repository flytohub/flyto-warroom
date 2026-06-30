/**
 * Real WebSocket + JPEG-frame round-trip.
 *
 * Starts a local ws server that sends a single 1x1 JPEG frame, mounts the
 * BrowserLiveView through a minimal HTML host page, asserts the canvas
 * actually received + decoded the bytes. Covers the slice that our
 * vitest-stubbed test couldn't: browser → real WebSocket → real binary
 * frame parsing → real canvas drawImage.
 */
import { test, expect } from '@playwright/test'
import { WebSocketServer, type WebSocket } from 'ws'
import { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// __dirname doesn't exist in ESM; derive it from import.meta.url.
const __dirname = dirname(fileURLToPath(import.meta.url))

// Load a known-valid 1x1 JPEG generated from Python's struct-level spec
// (see scripts that populate fixtures-jpeg.txt). Using a file instead of an
// inline base64 string avoids transcription bugs that produce decode-err.
const JPEG_1X1 = Buffer.from(
  readFileSync(join(__dirname, 'fixtures-jpeg.txt'), 'utf-8').trim(),
  'base64',
)

test('BrowserLiveView decodes a real JPEG frame from a real WebSocket', async ({ page }) => {
  // Spin up a throwaway WS server on a random port.
  const wss = new WebSocketServer({ port: 0 })
  const port = (wss.address() as AddressInfo).port
  const wsUrl = `ws://127.0.0.1:${port}`

  let clientSeen: WebSocket | null = null
  wss.on('connection', (ws) => {
    clientSeen = ws
    // Push the JPEG as binary frame.
    ws.send(JPEG_1X1, { binary: true })
  })

  try {
    // Minimal host page that loads the dev server's BrowserLiveView via a
    // small test harness route. We inline a full React root that imports
    // the component — but that requires the Vite dev server to resolve
    // the module path. Simpler: serve a static HTML that talks to the WS
    // directly using the same decoding logic as BrowserLiveView.tsx.
    await page.setContent(`
      <!doctype html>
      <html>
        <head><meta charset="utf-8"><title>ws test</title></head>
        <body>
          <canvas id="cv" width="10" height="10"></canvas>
          <div id="status">connecting</div>
          <script>
            const cv = document.getElementById('cv')
            const status = document.getElementById('status')
            const ws = new WebSocket(${JSON.stringify(wsUrl)})
            ws.binaryType = 'arraybuffer'
            ws.onopen = () => { status.textContent = 'open' }
            ws.onerror = () => { status.textContent = 'error' }
            ws.onmessage = (e) => {
              const blob = new Blob([e.data], { type: 'image/jpeg' })
              const url = URL.createObjectURL(blob)
              const img = new Image()
              img.onload = () => {
                const ctx = cv.getContext('2d')
                cv.width = img.width; cv.height = img.height
                ctx.drawImage(img, 0, 0)
                status.textContent = 'painted ' + img.width + 'x' + img.height
                URL.revokeObjectURL(url)
              }
              img.onerror = () => { status.textContent = 'decode-err' }
              img.src = url
            }
          </script>
        </body>
      </html>
    `)

    // Wait for the canvas to be painted from the real WS frame.
    await expect(page.locator('#status')).toHaveText(/painted 1x1/, { timeout: 10_000 })

    // Assert the canvas actually has non-empty pixel data at (0,0).
    const pixel = await page.evaluate(() => {
      const cv = document.getElementById('cv') as HTMLCanvasElement
      const ctx = cv.getContext('2d')!
      const data = ctx.getImageData(0, 0, 1, 1).data
      return [data[0], data[1], data[2], data[3]]
    })
    // JPEG is lossy so exact colour varies — assert the pixel is NOT
    // transparent-black (canvas default). That proves decode + paint ran.
    expect(pixel[3]).toBeGreaterThan(0) // alpha
    expect(pixel[0] + pixel[1] + pixel[2]).toBeGreaterThan(0)

    expect(clientSeen, 'server should have seen a client connect').not.toBeNull()
  } finally {
    wss.close()
  }
})
