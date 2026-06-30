import type { CapabilityHelpers } from '@hooks/useCapabilities';
import type { FeatureCheck } from './navigationConfig';

type NavigationCapabilityState = Pick<CapabilityHelpers, 'ready' | 'hasFeature'>;

export function navigationFeatureCheck(caps: NavigationCapabilityState): FeatureCheck | undefined {
	return caps.ready ? caps.hasFeature : undefined;
}
