import themesConfig from 'src/configs/themesConfig';
import { FuseSettingsConfigType } from '@fuse/core/FuseSettings/FuseSettings';
import { readThemePreference, resolveThemeMode } from '@lib/themePreference';

/**
 * Pick theme based on stored preference or system setting.
 * Priority: localStorage > prefers-color-scheme > dark (default).
 */
function getPreferredTheme() {
	return resolveThemeMode(readThemePreference()) === 'light'
		? themesConfig.default
		: themesConfig.defaultDark;
}

const preferredTheme = getPreferredTheme();

const settingsConfig: FuseSettingsConfigType = {
	layout: {
		style: 'layout1',
		config: {
			navbar: {
				style: 'style-1'
			},
			footer: {
				display: false
			}
		}
	},

	customScrollbars: true,

	direction: 'ltr',

	theme: {
		main: preferredTheme,
		navbar: themesConfig.defaultNavbar,
		toolbar: preferredTheme,
		footer: preferredTheme
	},

	defaultAuth: ['admin'],

	loginRedirectUrl: '/'
};

export default settingsConfig;
