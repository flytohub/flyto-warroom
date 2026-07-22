import React, { useCallback, useEffect, useState } from 'react';
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
import {
	persistThemePreference,
	readThemePreference,
	resolveThemeMode,
	type EffectiveThemeMode,
	type ThemePreference
} from '@lib/themePreference';

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
	const [preference, setPreference] = useState<ThemePreference>(readThemePreference);

	const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
		setAnchorEl(event.currentTarget);
	};

	const handleClose = () => {
		setAnchorEl(null);
	};

	const handleThemeSelect = useCallback(async (mode: EffectiveThemeMode) => {
		const selectedTheme = mode === 'light' ? lightTheme : darkTheme;
		const _newSettings = setSettings({ theme: { ...selectedTheme?.section } } as Partial<FuseSettingsConfigType>);

		if (!isGuest) {
			const updatedUserData = await updateUserSettings(_newSettings);

			if (updatedUserData) {
				enqueueSnackbar(t('hardcoded.user.settings.saved.602a3d2a'), {
					variant: 'success'
				});
			}
		}
	}, [darkTheme, enqueueSnackbar, isGuest, lightTheme, setSettings, updateUserSettings]);

	const handleSelectionChange = useCallback((selection: ThemePreference) => {
		persistThemePreference(selection);
		setPreference(selection);
		void handleThemeSelect(resolveThemeMode(selection));
		setAnchorEl(null);
	}, [handleThemeSelect]);

	// Follow OS changes only while the explicit preference is "system".
	useEffect(() => {
		if (preference !== 'system') return undefined;

		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		const handler = (event: MediaQueryListEvent) => {
			void handleThemeSelect(event.matches ? 'dark' : 'light');
		};
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	}, [handleThemeSelect, preference]);

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
					selected={preference === 'light'}
					onClick={() => handleSelectionChange('light')}
				>
					{t('theme.light')}
				</MenuItem>
				<MenuItem
					selected={preference === 'dark'}
					onClick={() => handleSelectionChange('dark')}
				>
					{t('theme.dark')}
				</MenuItem>
				<MenuItem
					selected={preference === 'system'}
					onClick={() => handleSelectionChange('system')}
				>
					{t('theme.system')}
				</MenuItem>
			</Menu>
		</>
	);
}

export default LightDarkModeToggle;
