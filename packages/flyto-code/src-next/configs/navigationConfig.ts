import { FuseNavItemType } from '@fuse/core/FuseNavigation/types/FuseNavItemType';
import { t } from '@lib/i18n';

/** Predicate used to filter top-level nav items by feature entitlement.
 *  Pass `() => true` (the default) to show everything — useful before
 *  the user has picked an org, or in tests / storybook. */
export type FeatureCheck = (feature: string) => boolean

// Map of nav-item id → the feature flag that gates it. Items missing
// from this map are always shown (Projects, Documentation, etc.).
// Keep this in lockstep with `capabilities.yaml.pages.*` on the backend.
const FEATURE_BY_ITEM: Record<string, string> = {
	'code-audit':       'code_audit',
	'blackbox-pentest': 'code_audit',   // pentest of code findings — same gate
	'attack-surface':   'ctem',
}

/** Returns navigation config with i18n-resolved titles, filtered by
 *  the caller's capability snapshot. The `has` predicate is typically
 *  `caps.hasFeature` from useCapabilities; pass `undefined` to skip
 *  feature filtering (shows everything).
 *
 *  Tied to the engine's `internal/permission/capabilities.yaml`:
 *  changing which feature gates which nav id should be a YAML edit
 *  there + a one-line update to FEATURE_BY_ITEM above. */
export function getNavigationConfig(has?: FeatureCheck): FuseNavItemType[] {
	const visible = (id: string): boolean => {
		const f = FEATURE_BY_ITEM[id]
		if (!f) return true
		if (!has) return true   // unknown caps → optimistic
		return has(f)
	}

	const filterGroup = (item: FuseNavItemType): FuseNavItemType | null => {
		if (item.type !== 'group' || !item.children) return visible(item.id) ? item : null
		const kept = item.children.filter(c => visible(c.id))
		if (kept.length === 0) return null   // collapse empty groups
		return { ...item, children: kept }
	}

	const raw: FuseNavItemType[] = [
		{
			id: 'projects',
			title: t('nav.projects'),
			type: 'item',
			icon: 'lucide:folder-code',
			url: '/projects',
			exact: true,
		},
		{
			id: 'capabilities',
			title: t('nav.capabilities'),
			type: 'group',
			children: [
				{
					id: 'code-audit',
					title: t('nav.codeAudit'),
					type: 'item',
					icon: 'lucide:scan-search',
					url: '/capability/code-audit',
					badge: { title: 'SAST' },
				},
				{
					id: 'blackbox-pentest',
					title: t('nav.pentestBlackbox'),
					type: 'item',
					icon: 'lucide:shield-alert',
					url: '/capability/pentest',
					badge: { title: 'DAST' },
				},
				{
					id: 'attack-surface',
					title: t('nav.attackSurface'),
					type: 'item',
					icon: 'lucide:globe',
					url: '/capability/attack-surface',
					badge: { title: 'ASM' },
				},
			],
		},
	]

	return raw.map(filterGroup).filter((x): x is FuseNavItemType => x !== null)
}

// Deprecated default export for backward compat. Runtime consumers should call
// getNavigationConfig(...) so titles resolve after i18n has initialized.
const navigationConfig: FuseNavItemType[] = [];
export default navigationConfig;
