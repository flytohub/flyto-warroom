import '@i18n/i18n';
import './styles/index.css';
import { initSentry, captureError } from '@lib/sentry';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import routes from 'src/configs/routesConfig';

// Initialise error monitoring as early as possible so errors during
// initial render are captured. No-op when VITE_SENTRY_DSN is unset.
initSentry();

// Auto-reload on stale chunk references. When a new deploy lands,
// the old index-next-*.js chunk in the user's browser cache still
// references the previous hashed sub-chunk filenames (e.g.
// WorkspaceLayout-BtPjYn9x.js). Those files no longer exist on the
// CDN, so the lazy import fails with "Failed to fetch dynamically
// imported module" and the route stays blank.
//
// Vite fires `vite:preloadError` on this exact case; reloading the
// page reads the new index-next bundle which knows the new hashes.
//
// Guard: tracks attempts + timestamp so a persistent CDN failure can't
// loop forever. Resets automatically after COOLDOWN_MS so future deploys
// can still trigger a reload. Never cleared on `load` — that was the
// original bug that caused infinite loops when chunks kept failing.
const CHUNK_RELOAD_KEY = 'flyto.chunk-reload';
const CHUNK_RELOAD_MAX = 2;
const CHUNK_RELOAD_COOLDOWN_MS = 60_000;

window.addEventListener('vite:preloadError', (event) => {
	const now = Date.now();
	try {
		const stored = JSON.parse(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 'null') as
			| { at: number; attempts: number } | null;
		const recentAttempts =
			stored?.at != null && now - stored.at < CHUNK_RELOAD_COOLDOWN_MS
				? (stored.attempts ?? 0)
				: 0;
		if (recentAttempts >= CHUNK_RELOAD_MAX) return;
		sessionStorage.setItem(CHUNK_RELOAD_KEY, JSON.stringify({ at: now, attempts: recentAttempts + 1 }));
	} catch {
		return;
	}
	event.preventDefault();
	window.location.reload();
});

const container = document.getElementById('app');

if (!container) {
	throw new Error('Failed to find the root element');
}

const root = createRoot(container, {
	onUncaughtError: (error, errorInfo) => {
		console.error('UncaughtError', error, errorInfo.componentStack);
		captureError(error, { componentStack: errorInfo.componentStack });
	},
	onCaughtError: (error, errorInfo) => {
		console.error('Caught error', error, errorInfo.componentStack);
		captureError(error, { componentStack: errorInfo.componentStack, caught: true });
	}
});

const router = createBrowserRouter(routes);

root.render(<RouterProvider router={router} />);
