// useSessionStorage — sessionStorage variant of useLocalStorage.
// Auth tokens live here instead of localStorage to shrink the XSS
// exfiltration window: sessionStorage is scoped to the tab and cleared
// when the tab closes, so a stolen token can't be replayed across
// browser restarts.
function useSessionStorage<T>(key: string) {
	function getValue() {
		try {
			const item = window.sessionStorage.getItem(key);
			return item ? (JSON.parse(item) as T) : null;
		} catch (error) {
			console.error(error);
			return null;
		}
	}

	const setValue = (value: T) => {
		try {
			window.sessionStorage.setItem(key, JSON.stringify(value));
		} catch (error) {
			console.error(error);
		}
	};

	const removeValue = () => {
		window.sessionStorage.removeItem(key);
	};

	return { value: getValue(), setValue, getValue, removeValue };
}

export default useSessionStorage;
