export async function writeClipboardText(text: string, timeoutMs = 1200): Promise<boolean> {
  if (!text || typeof window === 'undefined' || typeof document === 'undefined') return false

  const clipboardWrite = navigator.clipboard?.writeText?.bind(navigator.clipboard)
  if (clipboardWrite) {
    let timer: ReturnType<typeof window.setTimeout> | null = null
    try {
      const ok = await Promise.race([
        clipboardWrite(text).then(() => true, () => false),
        new Promise<boolean>((resolve) => {
          timer = window.setTimeout(() => resolve(false), timeoutMs)
        }),
      ])
      if (timer) window.clearTimeout(timer)
      if (ok) return true
    } catch {
      if (timer) window.clearTimeout(timer)
    }
  }

  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
    active?.focus?.()
  }
}
