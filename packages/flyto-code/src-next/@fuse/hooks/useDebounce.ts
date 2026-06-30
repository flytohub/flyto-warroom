import { useEffect, useMemo, useRef } from 'react';
import _ from 'lodash';

/**
 * Debounce hook.
 * @param {T} callback
 * @param {number} delay
 * @returns {T}
 */
function useDebounce<T extends (...args: never[]) => void>(callback: T, delay: number): T {
	const callbackRef = useRef<T>(callback);

	// Update the current callback each time it changes.
	useEffect(() => {
		callbackRef.current = callback;
	}, [callback]);

	// useMemo with an inline factory satisfies the react-compiler rule
	// that useCallback's first arg must be an inline function literal —
	// `_.debounce(...)` doesn't qualify, but `() => _.debounce(...)` does.
	const debouncedFn = useMemo(
		() => _.debounce((...args: never[]) => {
			callbackRef.current(...args);
		}, delay),
		[delay]
	);

	useEffect(() => {
		// Cleanup function to cancel any pending debounced calls
		return () => {
			debouncedFn.cancel();
		};
	}, [debouncedFn]);

	return debouncedFn as unknown as T;
}

export default useDebounce;
