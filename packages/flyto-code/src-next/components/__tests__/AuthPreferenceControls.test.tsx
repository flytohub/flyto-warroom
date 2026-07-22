// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthPreferenceControls } from '@components/AuthPreferenceControls';

vi.mock('@atoms/LocalePicker', () => ({
	LocalePicker: ({ showLabel }: { showLabel?: boolean }) => (
		<button type="button">{showLabel ? 'Language label' : 'Language icon'}</button>
	)
}));

vi.mock('@components/LightDarkModeToggle', () => ({
	default: () => <button type="button">Theme</button>
}));

vi.mock('@lib/i18n', () => ({
	t: (key: string) => ({
		'settings.language': 'Language',
		'layout.themeSettings': 'Theme settings'
	})[key] ?? key
}));

vi.mock('@/configs/themeOptions', () => ({
	default: [
		{ id: 'Default', section: {} },
		{ id: 'Default Dark', section: {} }
	]
}));

describe('AuthPreferenceControls', () => {
	it('exposes visible language and theme controls before authentication', () => {
		render(<AuthPreferenceControls />);

		expect(screen.getByRole('complementary', { name: 'Language / Theme settings' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Language label' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Theme' })).toBeTruthy();
	});
});
