/**
 * BrowserLiveView — displays real-time Chrome screenshots streamed via WebSocket.
 * The flyto-cloud worker pushes JPEG frames to wss://cloud.flyto2.com/ws/browser/{execution_id}.
 *
 * Auth: the engine identity token is sent as the first text frame (`AUTH <token>`)
 * after `onopen` instead of being placed in the URL query string — this
 * prevents the token from leaking into server access logs, Referer headers,
 * and browser history.
 */

import { useEffect, useRef, useState } from 'react'
import { useLocale } from '@hooks/useLocale'
import { t } from '@lib/i18n';
import { authHeader } from '@lib/engine/client'

interface Props {
  executionId: string
  liveViewUrl: string
  /** Engine identity token to send after onopen. When provided, the component
   *  sends `AUTH <token>` as the first frame before the cloud worker starts
   *  streaming. Omit to resolve the active engine token automatically; pass
   *  null for unauthenticated connections. */
  authToken?: string | null
}

type ViewState = 'connecting' | 'connected' | 'unavailable' | 'closed'

// If the WebSocket hasn't opened within this many ms we assume the
// live-view backend (flyto-cloud ws/browser/{id}) is offline and
// switch to an "unavailable" display instead of spinning forever.
// Campaigns without live-view still run normally — this is UI only.
const LIVE_VIEW_CONNECT_TIMEOUT_MS = 5000

function normalizeAuthToken(raw: string | null | undefined) {
  return raw?.replace(/^Bearer\s+/i, '') || null
}

async function resolveAuthToken(authToken: string | null | undefined) {
  if (authToken !== undefined) return normalizeAuthToken(authToken)
  try {
    return normalizeAuthToken(await authHeader())
  } catch {
    return null
  }
}

export function BrowserLiveView({ executionId, liveViewUrl, authToken }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<ViewState>('connecting')
  useLocale()

  useEffect(() => {
    let cancelled = false
    let ws: WebSocket | null = null
    let openTimer: ReturnType<typeof setTimeout> | null = null

    const clearOpenTimer = () => {
      if (openTimer) {
        clearTimeout(openTimer)
        openTimer = null
      }
    }

    if (!liveViewUrl) {
      setState('unavailable')
      return () => { cancelled = true }
    }
    setState('connecting')

    async function connect() {
      const firstFrameToken = await resolveAuthToken(authToken)
      if (cancelled) return

      try {
        ws = new WebSocket(liveViewUrl)
        ws.binaryType = 'arraybuffer'
      } catch {
        // Invalid URL / mixed content → immediate unavailable.
        setState('unavailable')
        return
      }

      // Hard timeout — if we never reach onopen, flip to unavailable
      // so the operator isn't staring at an infinite spinner.
      openTimer = setTimeout(() => {
        if (ws && ws.readyState !== WebSocket.OPEN) {
          setState('unavailable')
          try { ws.close() } catch { /* noop */ }
        }
      }, LIVE_VIEW_CONNECT_TIMEOUT_MS)

      ws.onopen = () => {
        clearOpenTimer()
        if (firstFrameToken) ws?.send(`AUTH ${firstFrameToken}`)
        setState('connected')
      }
      ws.onclose = () => {
        clearOpenTimer()
        setState(prev => (prev === 'connected' ? 'closed' : 'unavailable'))
      }
      ws.onerror = () => {
        clearOpenTimer()
        setState('unavailable')
      }

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          const blob = new Blob([event.data], { type: 'image/jpeg' })
          const url = URL.createObjectURL(blob)
          const img = new Image()
          img.onload = () => {
            const ctx = canvasRef.current?.getContext('2d')
            if (ctx && canvasRef.current) {
              canvasRef.current.width = img.width
              canvasRef.current.height = img.height
              ctx.drawImage(img, 0, 0)
            }
            URL.revokeObjectURL(url)
          }
          img.src = url
        }
      }
    }
    void connect()

    return () => {
      cancelled = true
      clearOpenTimer()
      try { ws?.close() } catch { /* noop */ }
    }
  }, [liveViewUrl, authToken])

  // When the live view is unavailable we hide the canvas entirely and
  // replace the status chip with a clear explanation. That stops the
  // "connecting…" spinner from misleading the operator into thinking
  // the campaign itself is stalled.
  const dotColor =
    state === 'connected' ? 'bg-green-400 animate-pulse'
    : state === 'unavailable' ? 'bg-amber-400'
    : state === 'closed' ? 'bg-neutral-500'
    : 'bg-neutral-600 animate-pulse'

  const label =
    state === 'connected' ? t('warroom.liveView')
    : state === 'unavailable' ? t('warroom.liveViewUnavailable')
    : state === 'closed' ? t('warroom.liveViewClosed')
    : t('warroom.connecting')

  return (
    <div className="relative w-full bg-neutral-900 rounded overflow-hidden">
      <div className="absolute top-2 left-2 z-10 flex items-center gap-2 text-sm text-neutral-400">
        <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
        {label}
      </div>
      {state === 'unavailable' ? (
        <div className="min-h-[200px] flex items-center justify-center text-sm text-neutral-500 px-4 text-center">
          {t('warroom.liveViewUnavailableHint')}
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="w-full h-auto min-h-[200px]"
          data-execution-id={executionId}
        />
      )}
    </div>
  )
}
