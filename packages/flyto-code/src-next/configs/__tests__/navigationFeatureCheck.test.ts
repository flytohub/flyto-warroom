import { describe, expect, it } from 'vitest';
import { getNavigationConfig } from '@/configs/navigationConfig';
import { navigationFeatureCheck } from '@/configs/navigationFeatureCheck';

function capabilityChildren(config = getNavigationConfig()) {
	const group = config.find((item) => item.id === 'capabilities');
	return group?.children?.map((child) => child.id) ?? [];
}

describe('navigationFeatureCheck', () => {
	it('keeps feature-gated top-level nav visible while capabilities are unresolved', () => {
		const check = navigationFeatureCheck({
			ready: false,
			hasFeature: () => false,
		});

		expect(check).toBeUndefined();
		expect(capabilityChildren(getNavigationConfig(check))).toEqual([
			'code-audit',
			'blackbox-pentest',
			'attack-surface',
		]);
	});

	it('applies feature filtering after capabilities resolve', () => {
		const check = navigationFeatureCheck({
			ready: true,
			hasFeature: (feature) => feature === 'code_audit',
		});

		expect(capabilityChildren(getNavigationConfig(check))).toEqual([
			'code-audit',
			'blackbox-pentest',
		]);
	});
});
