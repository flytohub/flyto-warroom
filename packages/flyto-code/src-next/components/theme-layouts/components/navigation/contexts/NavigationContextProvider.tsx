// Create the provider component
import { ReactNode, useCallback, useState, useMemo, useEffect } from 'react';
import { FuseFlatNavItemType, FuseNavItemType } from '@fuse/core/FuseNavigation/types/FuseNavItemType';
import FuseNavigationHelper from '@fuse/utils/FuseNavigationHelper';
import { getNavigationConfig } from '@/configs/navigationConfig';
import { navigationFeatureCheck } from '@/configs/navigationFeatureCheck';
import FuseNavItemModel from '@fuse/core/FuseNavigation/models/FuseNavItemModel';
import { PartialDeep } from 'type-fest';
import { NavigationContext } from '@/components/theme-layouts/components/navigation/contexts/NavigationContext';
import { useLocale } from '@hooks/useLocale';
import { useOrg } from '@hooks/useOrg';
import { useCapabilities } from '@hooks/useCapabilities';

export function NavigationContextProvider({ children }: { children: ReactNode }) {
	const locale = useLocale();
	// Caps are scoped to an org. Before the user picks one (eg on the
	// Projects landing page), or while the capability snapshot is still
	// resolving, top-level Fuse nav uses the config's optimistic
	// no-predicate path. Route and action gates still fail closed via
	// FeatureGate/useCapabilities.
	const { org } = useOrg();
	const caps = useCapabilities(org?.id);
	const featureCheck = navigationFeatureCheck(caps);

	// Re-compute navigation config when locale OR the entitlement
	// snapshot changes. Switching tiers mid-session (admin upgrades
	// the org from Code-only to Code+CTEM) flips the top-level
	// "Capabilities" group's Attack Surface item on without a refresh.
	const freshConfig = useMemo(
		() => getNavigationConfig(featureCheck),
		[locale, featureCheck],
	);

	const [navigationItems, setNavigationItems] = useState<FuseFlatNavItemType[]>(
		FuseNavigationHelper.flattenNavigation(freshConfig)
	);

	// Refresh navigation items when locale changes
	useEffect(() => {
		setNavigationItems(FuseNavigationHelper.flattenNavigation(freshConfig));
	}, [freshConfig]);

	const setNavigation = useCallback((items: FuseNavItemType[]) => {
		setNavigationItems(FuseNavigationHelper.flattenNavigation(items));
	}, []);

	const appendNavigationItem = useCallback(
		(item: FuseNavItemType, parentId?: string | null) => {
			const navigation = FuseNavigationHelper.unflattenNavigation(navigationItems);
			setNavigation(FuseNavigationHelper.appendNavItem(navigation, FuseNavItemModel(item), parentId));
		},
		[navigationItems, setNavigation]
	);

	const prependNavigationItem = useCallback(
		(item: FuseNavItemType, parentId?: string | null) => {
			const navigation = FuseNavigationHelper.unflattenNavigation(navigationItems);
			setNavigation(FuseNavigationHelper.prependNavItem(navigation, FuseNavItemModel(item), parentId));
		},
		[navigationItems, setNavigation]
	);

	const updateNavigationItem = useCallback(
		(id: string, item: PartialDeep<FuseNavItemType>) => {
			const navigation = FuseNavigationHelper.unflattenNavigation(navigationItems);
			setNavigation(FuseNavigationHelper.updateNavItem(navigation, id, item));
		},
		[navigationItems, setNavigation]
	);

	const removeNavigationItem = useCallback(
		(id: string) => {
			const navigation = FuseNavigationHelper.unflattenNavigation(navigationItems);
			setNavigation(FuseNavigationHelper.removeNavItem(navigation, id));
		},
		[navigationItems, setNavigation]
	);

	const resetNavigation = useCallback(() => {
		setNavigationItems(FuseNavigationHelper.flattenNavigation(getNavigationConfig()));
	}, []);

	const getNavigationItemById = useCallback(
		(id: string) => navigationItems.find((item) => item.id === id),
		[navigationItems]
	);

	const value = {
		setNavigation,
		navigationItems,
		appendNavigationItem,
		prependNavigationItem,
		updateNavigationItem,
		removeNavigationItem,
		resetNavigation,
		getNavigationItemById
	};

	return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}
