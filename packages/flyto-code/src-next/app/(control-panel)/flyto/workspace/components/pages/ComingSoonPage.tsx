import { useLocation } from 'react-router'
import { Sparkles } from 'lucide-react'
import { PageShell } from '@atoms/PageShell'
import { SurfacePlaceholder } from '@compounds/surface/SurfacePlaceholder'
import { comingSoonByPath } from '@lib/comingSoonSurfaces'
import { t, tOr } from '@lib/i18n';

/**
 * One page for every "coming soon" surface — resolves which one from the
 * URL's last segment against the comingSoonSurfaces registry. Adding a
 * placeholder surface needs no new component, just a registry + MODULES
 * entry pointing here.
 */
export default function ComingSoonPage() {
  const { pathname } = useLocation()
  const seg = pathname.replace(/\/+$/, '').split('/').pop() ?? ''
  const s = comingSoonByPath(seg)
  if (!s) {
    return (
      <PageShell padded={false} scroll="host">
        <SurfacePlaceholder Icon={Sparkles} title={t('soon.generic.title')}
          description={t('soon.generic.desc')} />
      </PageShell>
    )
  }
  return (
    <PageShell padded={false} scroll="host">
      <SurfacePlaceholder
        Icon={s.Icon}
        title={tOr(s.titleKey, s.titleFallback)}
        description={tOr(s.descKey, s.descFallback)}
        note={tOr(s.noteKey, s.noteFallback)}
      />
    </PageShell>
  )
}
