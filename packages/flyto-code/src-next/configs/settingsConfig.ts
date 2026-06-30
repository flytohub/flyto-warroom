import themesConfig from 'src/configs/themesConfig';
import { FuseSettingsConfigType } from '@fuse/core/FuseSettings/FuseSettings';

/**
 * Pick theme based on stored preference or system setting.
 * Priority: localStorage > prefers-color-scheme > dark (default).
 */
function getPreferredTheme() {
	if (typeof window === 'undefined') return themesConfig.defaultDark;
	const stored = localStorage.getItem('flyto-theme-mode');
	if (stored === 'light') return themesConfig.default;
	if (stored === 'dark') return themesConfig.defaultDark;
	if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return themesConfig.default;
	return themesConfig.defaultDark;
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
