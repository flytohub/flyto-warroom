'use client';

import Breadcrumbs, { type BreadcrumbsProps } from '@mui/material/Breadcrumbs';
import type { FuseNavItemType } from '@fuse/core/FuseNavigation/types/FuseNavItemType';
import usePathname from '@components/adapters/usePathname';

import Typography from '@mui/material/Typography';
import clsx from 'clsx';
import Link from '@components/adapters/Link';
import { t } from '@lib/i18n';
import useNavigationItems from './theme-layouts/components/navigation/hooks/useNavigationItems';

type PageBreadcrumbProps = BreadcrumbsProps & {
	className?: string;
	skipHome?: boolean;
	borderColor?: string;
};

// Function to get the navigation item based on URL
function getNavigationItem(url: string, navigationItems: FuseNavItemType[]): FuseNavItemType {
	for (const item of navigationItems) {
		if (item.url === url) {
			return item;
		}

		if (item.children) {
			const childItem = getNavigationItem(url, item.children);

			if (childItem) {
				return childItem;
			}
		}
	}
	// @ts-expect-error — framework code, strict null check
	return null;
}

function PageBreadcrumb(props: PageBreadcrumbProps) {
	const {
		className,
		skipHome = false,
		color = 'action.active',
		borderColor = 'divider',
		maxItems = 4,
		...rest
	} = props;
	const pathname = usePathname();
	const { data: navigation } = useNavigationItems();

	const crumbs = pathname
		.split('/')
		.filter(Boolean)
		.reduce(
			(acc: { title: string; url: string }[], part, index, array) => {
				const url = `/${array.slice(0, index + 1).join('/')}`;
				const navItem = getNavigationItem(url, navigation);
				const title = navItem?.title || part;

				acc.push({ title, url });
				return acc;
			},
			skipHome ? [] : [{ title: t('nav.home'), url: '/' }]
		);

	return (
		<Breadcrumbs
			classes={{ ol: 'list-none m-0 p-0' }}
			className={clsx('flex w-fit rounded-sm border-1 px-2', className)}
			sx={{ borderColor: borderColor + '!important' }}
			aria-label="breadcrumb"
			color={color}
			maxItems={maxItems}
			{...rest}
		>
			{crumbs.map((item, index) => (
				<Typography
					component={item.url ? Link : 'span'}
					to={item.url}
					key={index}
					className="text-md block max-w-32 truncate font-medium tracking-tight capitalize"
					color="inherit"
				>
					{item.title}
				</Typography>
			))}
		</Breadcrumbs>
	);
}

export default PageBreadcrumb;
