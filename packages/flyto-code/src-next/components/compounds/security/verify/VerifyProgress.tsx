/**
 * VerifyProgress — minimal running-state indicator for dynamic verify
 * flows that don't stream a browser live view. Just a spinner + status
 * line, sized to fill the space where BrowserLiveView would have sat,
 * so the modal doesn't collapse when it transitions between states.
 *
 * Auto-rotates through a small set of hint lines so the user gets
 * progressive feedback ("probing", "comparing responses", "asking AI")
 * instead of a fixed "connecting..." that looks frozen.
 */

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useLocale } from '@hooks/useLocale'
import { t } from '@lib/i18n';

export function VerifyProgress() {
  useLocale()
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => (n + 1) % 3), 2500)
    return () => clearInterval(t)
  }, [])
  const hints = [
    t('warroom.verifyProbe1'),
    t('warroom.verifyProbe2'),
    t('warroom.verifyProbe3'),
  ]
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 bg-neutral-900/30 rounded-md border border-neutral-800">
      <Loader2 size={28} className="animate-spin text-violet-400" />
      <div className="text-sm text-neutral-400">{hints[tick]}</div>
      <div className="text-xs text-neutral-600">
        {t('warroom.verifyProgressHint')}
      </div>
    </div>
  )
}
