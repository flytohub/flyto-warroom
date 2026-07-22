// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	persistThemePreference,
	readThemePreference,
	resolveThemeMode
} from '@lib/themePreference';

describe('theme preference', () => {
	const values = new Map<string, string>();
	const storage = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => { values.set(key, value); },
		removeItem: (key: string) => { values.delete(key); },
		clear: () => { values.clear(); },
		key: (index: number) => [...values.keys()][index] ?? null,
		get length() { return values.size; }
	};

	beforeEach(() => {
		values.clear();
		vi.stubGlobal('localStorage', storage);
	});

	it('uses system mode when no explicit preference exists', () => {
		expect(readThemePreference()).toBe('system');
		expect(resolveThemeMode('system', true)).toBe('dark');
		expect(resolveThemeMode('system', false)).toBe('light');
	});

	it('persists explicit light and dark choices', () => {
		persistThemePreference('light');
		expect(readThemePreference()).toBe('light');

		persistThemePreference('dark');
		expect(readThemePreference()).toBe('dark');
	});

	it('returns to system mode by removing the explicit override', () => {
		persistThemePreference('dark');
		persistThemePreference('system');

		expect(localStorage.getItem('flyto-theme-mode')).toBeNull();
		expect(readThemePreference()).toBe('system');
	});
});
