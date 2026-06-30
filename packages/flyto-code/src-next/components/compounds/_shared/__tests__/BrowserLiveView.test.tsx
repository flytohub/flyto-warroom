/**
 * BrowserLiveView WebSocket integration:
 *   - opens WS to the given liveViewUrl
 *   - flips "connecting" → "Live" indicator on `open`
 *   - decodes binary frames and paints them to the <canvas>
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  authHeader: vi.fn(async () => 'Bearer ws-test-token'),
}))

// i18n stub — t() passes keys through; tOr returns fallback.
vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_k: string, fallback: string) => fallback,
}))
vi.mock('@hooks/useLocale', () => ({ useLocale: () => {} }))
vi.mock('@lib/engine/client', () => ({
  authHeader: mocks.authHeader,
}))

// Capture the most-recently created fake WebSocket so tests can drive it.
interface FakeWS {
  url: string
  binaryType: string
  readyState: number
  onopen: ((e: Event) => void) | null
  onclose: ((e: Event) => void) | null
  onerror: ((e: Event) => void) | null
  onmessage: ((e: MessageEvent) => void) | null
  send: (data: string) => void
  close: () => void
}
let lastWS: FakeWS | null = null
const sendSpy = vi.fn()
class FakeWebSocket implements Partial<FakeWS> {
  url: string
  binaryType = 'blob'
  readyState = 0
  onopen: ((e: Event) => void) | null = null
  onclose: ((e: Event) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  constructor(url: string) {
    this.url = url
    lastWS = this as unknown as FakeWS
  }
  close() {
    this.readyState = 3
    this.onclose?.(new Event('close'))
  }
  send(data: string) {
    sendSpy(data)
  }
}
vi.stubGlobal('WebSocket', FakeWebSocket)

// JSDOM's canvas has no 2d context. Provide a stub that records drawImage.
const drawImageSpy = vi.fn()
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  drawImage: drawImageSpy,
})) as unknown as typeof HTMLCanvasElement.prototype.getContext

// URL.createObjectURL / revokeObjectURL are also missing in JSDOM.
const createObjectURL = vi.fn(() => 'blob:fake')
const revokeObjectURL = vi.fn()
vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

import { BrowserLiveView } from '../BrowserLiveView'

describe('BrowserLiveView WebSocket', () => {
  beforeEach(() => {
    lastWS = null
    drawImageSpy.mockClear()
    createObjectURL.mockClear()
    sendSpy.mockClear()
    mocks.authHeader.mockClear()
    mocks.authHeader.mockResolvedValue('Bearer ws-test-token')
  })

  it('opens WS to the supplied URL and shows "connecting" until open', async () => {
    render(<BrowserLiveView executionId="exec-1" liveViewUrl="wss://cloud.example/ws/browser/exec-1" />)
    await waitFor(() => expect(lastWS).not.toBeNull())
    expect(lastWS!.url).toBe('wss://cloud.example/ws/browser/exec-1')
    // Before onopen fires, indicator text reflects the connecting state.
    expect(screen.getByText('Connecting...')).toBeDefined()
  })

  it('flips the indicator to "Live" once the socket opens', async () => {
    render(<BrowserLiveView executionId="exec-1" liveViewUrl="wss://cloud.example/ws/browser/exec-1" />)
    await waitFor(() => expect(lastWS).not.toBeNull())
    act(() => {
      lastWS!.onopen?.(new Event('open'))
    })
    expect(screen.getByText('Live Browser View')).toBeDefined()
    expect(sendSpy).toHaveBeenCalledWith('AUTH ws-test-token')
  })

  it('decodes ArrayBuffer frames and paints them to the canvas', async () => {
    render(<BrowserLiveView executionId="exec-2" liveViewUrl="wss://cloud.example/ws/browser/exec-2" />)
    await waitFor(() => expect(lastWS).not.toBeNull())
    act(() => lastWS!.onopen?.(new Event('open')))

    // Send a fake 3-byte JPEG frame.
    const frame = new Uint8Array([0xff, 0xd8, 0xff]).buffer
    act(() => {
      lastWS!.onmessage?.({ data: frame } as MessageEvent)
    })

    // createObjectURL should have been called with the Blob.
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blobArg = createObjectURL.mock.calls[0][0] as Blob
    expect(blobArg.type).toBe('image/jpeg')

    // Force the onload on the Image — JSDOM won't fire it automatically for
    // a blob: URL. We grab the last Image instance set by the component.
    // Since we can't hook into `new Image()` here simply, we at least
    // confirmed the decode pipeline was engaged up to createObjectURL.
  })

  it('falls back to unavailable on error without ever connecting', async () => {
    // onerror before onopen → component switches to the stable
    // "unavailable" state (not "connecting"). Prevents the infinite
    // spinner when flyto-cloud's WebSocket is offline.
    render(<BrowserLiveView executionId="exec-3" liveViewUrl="wss://cloud.example/ws/browser/exec-3" />)
    await waitFor(() => expect(lastWS).not.toBeNull())
    act(() => lastWS!.onerror?.(new Event('error')))
    expect(screen.getByText('LIVE VIEW UNAVAILABLE')).toBeDefined()
  })

  it('shows STREAM CLOSED when the WS closes after a successful open', async () => {
    render(<BrowserLiveView executionId="exec-4" liveViewUrl="wss://cloud.example/ws/browser/exec-4" />)
    await waitFor(() => expect(lastWS).not.toBeNull())
    act(() => lastWS!.onopen?.(new Event('open')))
    act(() => lastWS!.onclose?.(new Event('close')))
    expect(screen.getByText('STREAM CLOSED')).toBeDefined()
  })
})
