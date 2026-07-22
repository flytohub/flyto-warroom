export type ThemePreference = 'light' | 'dark' | 'system';
export type EffectiveThemeMode = Exclude<ThemePreference, 'system'>;

const THEME_STORAGE_KEY = 'flyto-theme-mode';

export function readThemePreference(): ThemePreference {
	if (typeof window === 'undefined') return 'system';

	try {
		const stored = localStorage.getItem(THEME_STORAGE_KEY);
		if (stored === 'light' || stored === 'dark') return stored;
	} catch {
		// Storage can be unavailable in private browsing or locked-down browsers.
	}

	return 'system';
}

export function resolveThemeMode(
	preference: ThemePreference,
	systemPrefersDark?: boolean
): EffectiveThemeMode {
	if (preference !== 'system') return preference;

	const prefersDark = systemPrefersDark ?? (
		typeof window === 'undefined'
			? true
			: window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
	);

	return prefersDark ? 'dark' : 'light';
}

export function persistThemePreference(preference: ThemePreference): void {
	if (typeof window === 'undefined') return;

	try {
		if (preference === 'system') {
			localStorage.removeItem(THEME_STORAGE_KEY);
		} else {
			localStorage.setItem(THEME_STORAGE_KEY, preference);
		}
	} catch {
		// Theme changes still apply for the current session when storage is blocked.
	}
}
