'use client';
import { styled } from '@mui/material/styles';
import { Box, BoxProps } from '@mui/material';
import Icon from '@mui/material/Icon';
import clsx from 'clsx';
import { SVGProps } from 'react';
import { icons as lucideIcons } from 'lucide-react';

type FuseSvgIconProps = BoxProps &
	SVGProps<SVGSVGElement> & {
		fill?: string;
		xmlns?: string;
		viewBox?: string;
		size?: number | string;
		color?: 'inherit' | 'disabled' | 'primary' | 'secondary' | 'action' | 'error' | 'info' | 'success' | 'warning';
		ref?: React.RefObject<SVGSVGElement>;
	};

const Root = styled(Box)<FuseSvgIconProps>(({ theme, size = 16, color = 'inherit' }) => ({
	width: size,
	height: size,
	minWidth: size,
	minHeight: size,
	fontSize: size,
	lineHeight: size,
	color: {
		primary: theme.vars.palette.primary.main,
		secondary: theme.vars.palette.secondary.main,
		info: theme.vars.palette.info.main,
		success: theme.vars.palette.success.main,
		warning: theme.vars.palette.warning.main,
		action: theme.vars.palette.action.active,
		error: theme.vars.palette.error.main,
		disabled: theme.vars.palette.action.disabled,
		inherit: 'currentColor'
	}[color] as string
}));

/**
 * Convert a kebab-case lucide icon name to PascalCase for the lucide-react icons map.
 * e.g. "arrow-down" → "ArrowDown", "sun" → "Sun"
 */
function toPascalCase(str: string): string {
	return str
		.split('-')
		.map(s => s.charAt(0).toUpperCase() + s.slice(1))
		.join('');
}

/**
 * FuseSvgIcon — renders icons from lucide-react directly (no SVG sprite files).
 *
 * Usage: <FuseSvgIcon>lucide:sun</FuseSvgIcon>
 *        <FuseSvgIcon>lucide:arrow-down</FuseSvgIcon>
 *        <FuseSvgIcon>material-outlined-name</FuseSvgIcon> (MUI Icon font fallback)
 */
function FuseSvgIcon(props: FuseSvgIconProps) {
	const { children, className = '', color = 'inherit', size = 16, ref } = props;

	if (typeof children !== 'string') {
		return null;
	}

	// Plain MUI Icon font (no colon prefix)
	if (!children.includes(':')) {
		return (
			<Box
				component={Icon}
				ref={ref}
				{...props}
			/>
		);
	}

	const isLucideIcon = children.startsWith('lucide:');

	if (isLucideIcon) {
		const iconName = children.slice('lucide:'.length);
		const pascalName = toPascalCase(iconName);
		const LucideComponent = (lucideIcons as Record<string, any>)[pascalName];

		if (LucideComponent) {
			return (
				<Root
					{...props}
					as="span"
					className={clsx('shrink-0 inline-flex', className)}
					ref={ref}
					color={color}
				>
					<LucideComponent size={size} />
				</Root>
			);
		}
	}

	// Fallback: render as inline SVG with <use> (for non-lucide icon sets)
	const iconPath = children.replace(':', '.svg#');

	return (
		<Root
			{...props}
			as="svg"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			viewBox={isLucideIcon ? '0 0 24 24' : '0 0 100 100'}
			className={clsx('shrink-0', isLucideIcon ? 'stroke-current' : 'fill-current', className)}
			{...(isLucideIcon && {
				stroke: 'currentColor',
				strokeWidth: 2,
				strokeLinecap: 'round',
				strokeLinejoin: 'round'
			})}
			ref={ref}
			color={color}
		>
			<use xlinkHref={`/assets/icons/${iconPath}`} />
		</Root>
	);
}

export default FuseSvgIcon;
