import { PageShell } from '@atoms/PageShell'
import { t } from '@lib/i18n';
import { IoCLookupView } from '@compounds/threat-intel/IoCLookupView';

/**
 * BotShield — botnet / C2 indicators. Real data: the IoC view pinned to
 * kind='c2' (Feodo Tracker / ThreatFox C2 feeds), so it's a focused page,
 * not a fake one. Reuses IoCLookupView via its presetKind prop.
 */
export default function BotShieldPage() {
  return (
    <PageShell padded={false} scroll="host">
      <IoCLookupView
        presetKind="c2"
        title={t('botshield.title')}
        lede={t('botshield.lede')}
      />
    </PageShell>
  )
}
