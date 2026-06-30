import React, { useState, useEffect } from 'react';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import FuseSvgIcon from '@components/adapters/Icon';
import type { FuseThemeOption } from '@fuse/core/FuseThemeSelector/ThemePreview';
import { useMainTheme } from '@fuse/core/FuseSettings/hooks/fuseThemeHooks';
import useFuseSettings from '@components/adapters/useFuseSettings';
import type { FuseSettingsConfigType } from '@fuse/core/FuseSettings/FuseSettings';
import useUser from '@auth/useUser';
import { t } from '@lib/i18n';
import { useSnackbar } from 'notistack';
import { persistThemeMode } from '@fuse/default-settings/FuseDefaultSettings';

type LightDarkModeToggleProps = {
	className?: string;
	lightTheme: FuseThemeOption;
	darkTheme: FuseThemeOption;
};

function LightDarkModeToggle(props: LightDarkModeToggleProps) {
	const { className = '', lightTheme, darkTheme } = props;
	const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
	const { setSettings } = useFuseSettings();
	const { isGuest, updateUserSettings } = useUser();
	const { enqueueSnackbar } = useSnackbar();
	const mainTheme = useMainTheme();

	// Listen for system theme changes — auto-follow when user hasn't explicitly chosen
	useEffect(() => {
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		const handler = (e: MediaQueryListEvent) => {
			const stored = localStorage.getItem('flyto-theme-mode');
			if (stored) return; // User made explicit choice, don't override
			handleSelectionChange(e.matches ? 'dark' : 'light');
		};
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	}, []);

	const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
		setAnchorEl(event.currentTarget);
	};

	const handleClose = () => {
		setAnchorEl(null);
	};

	const handleSelectionChange = (selection: 'light' | 'dark') => {
		persistThemeMode(selection);
		if (selection === 'light') {
			handleThemeSelect(lightTheme);
		} else {
			handleThemeSelect(darkTheme);
		}

		handleClose();
	};

	async function handleThemeSelect(_theme: FuseThemeOption) {
		const _newSettings = setSettings({ theme: { ..._theme?.section } } as Partial<FuseSettingsConfigType>);

		if (!isGuest) {
			const updatedUserData = await updateUserSettings(_newSettings);

			if (updatedUserData) {
				enqueueSnackbar(t('hardcoded.user.settings.saved.602a3d2a'), {
					variant: 'success'
				});
			}
		}
	}

	return (
		<>
			<IconButton
				aria-label={t('theme.toggle')}
				aria-controls="light-dark-toggle-menu"
				aria-haspopup="true"
				onClick={handleClick}
				className={className}
			>
				{mainTheme.palette.mode === 'light' && <FuseSvgIcon>lucide:sun</FuseSvgIcon>}
				{mainTheme.palette.mode === 'dark' && <FuseSvgIcon>lucide:moon</FuseSvgIcon>}
			</IconButton>
			<Menu
				id="light-dark-toggle-menu"
				anchorEl={anchorEl}
				keepMounted
				open={Boolean(anchorEl)}
				onClose={handleClose}
			>
				<MenuItem
					selected={mainTheme.palette.mode === 'light'}
					onClick={() => handleSelectionChange('light')}
				>
					{t('theme.light')}
				</MenuItem>
				<MenuItem
					selected={mainTheme.palette.mode === 'dark'}
					onClick={() => handleSelectionChange('dark')}
				>
					{t('theme.dark')}
				</MenuItem>
			</Menu>
		</>
	);
}

export default LightDarkModeToggle;
