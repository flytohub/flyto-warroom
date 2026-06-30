import clsx from 'clsx';
import { memo } from 'react';
import { FuseNavBadgeType } from './types/FuseNavBadgeType';
import Chip from '@mui/material/Chip';

type FuseNavBadgeProps = {
	className?: string;
	classes?: string;
	badge: FuseNavBadgeType;
};

/**
 * FuseNavBadge component.
 * This component will render a badge on a FuseNav element. It accepts a `FuseNavBadgeType` as a prop,
 * which is an object containing a title and background and foreground colour.
 */
function FuseNavBadge(props: FuseNavBadgeProps) {
	const { className = '', badge } = props;

	// Nav badges (SAST / DAST / ASM, etc.) used to render in MUI
	// "secondary" colour — vivid cyan in this theme — which competed
	// with the primary-violet brand for attention on every page that
	// had the sidebar. Re-style as a subtle slate-tinted tag: muted
	// background, neutral text, smaller letter-spacing-uppercase feel.
	// Callers can still override via badge.bg / badge.fg when a
	// specific finding needs a louder signal.
	return (
		<Chip
			className={clsx('item-badge truncate', className)}
			size="small"
			sx={{
				height: 18,
				fontSize: 12,
				fontWeight: 700,
				letterSpacing: '0.06em',
				backgroundColor: badge.bg ?? 'rgba(148, 163, 184, 0.16)',
				color: badge.fg ?? 'rgba(203, 213, 225, 0.95)',
				border: 'none',
				'& .MuiChip-label': { px: 0.75 },
			}}
			label={badge.title}
		/>
	);
}

export default memo(FuseNavBadge);
