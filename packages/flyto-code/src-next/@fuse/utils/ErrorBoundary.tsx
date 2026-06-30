import { Component, ErrorInfo, ReactNode } from 'react';

const DYNAMIC_IMPORT_ERROR =
	/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk \d+ failed/i;
const DYNAMIC_IMPORT_RELOAD_KEY = 'flyto:dynamic-import-reload';
const RELOAD_COOLDOWN_MS = 60_000;
const RELOAD_DELAY_MS = 750;
const MAX_AUTO_RELOADS = 2;

interface DynamicImportReloadMarker {
	marker?: string;
	at?: number;
	attempts?: number;
}

interface ErrorBoundaryProps {
	children?: ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
	errorInfo: ErrorInfo | null;
	recoveringDynamicImport: boolean;
}

function isDynamicImportError(error: Error | null): boolean {
	if (!error) {
		return false;
	}

	return DYNAMIC_IMPORT_ERROR.test(`${error.name} ${error.message} ${error.stack ?? ''}`);
}

function shouldReloadForDynamicImport(error: Error): boolean {
	if (typeof window === 'undefined') {
		return false;
	}

	const marker = `${window.location.pathname}:${error.message}`;
	const now = Date.now();

	try {
		const previous = JSON.parse(window.sessionStorage.getItem(DYNAMIC_IMPORT_RELOAD_KEY) ?? 'null') as
			| DynamicImportReloadMarker
			| null;
		const sameRecentModule =
			previous?.marker === marker &&
			previous?.at != null &&
			now - previous.at < RELOAD_COOLDOWN_MS;
		const attempts = sameRecentModule ? (previous?.attempts ?? 1) : 0;

		if (attempts >= MAX_AUTO_RELOADS) {
			return false;
		}

		window.sessionStorage.setItem(DYNAMIC_IMPORT_RELOAD_KEY, JSON.stringify({
			marker,
			at: now,
			attempts: attempts + 1,
		}));
	} catch {
		return false;
	}

	return true;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null, errorInfo: null, recoveringDynamicImport: false };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		// Update state so the next render will show the fallback UI.
		return { hasError: true, error, errorInfo: null, recoveringDynamicImport: false };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		// You can also log the error to an error reporting service
		console.error('Uncaught error:', error, errorInfo);

		const recoveringDynamicImport = isDynamicImportError(error) && shouldReloadForDynamicImport(error);
		this.setState({ error, errorInfo, recoveringDynamicImport });

		if (recoveringDynamicImport) {
			window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
		}
	}

	handleReload = () => {
		if (typeof window !== 'undefined') {
			window.location.reload();
		}
	};

	handleGoToProjects = () => {
		if (typeof window !== 'undefined') {
			window.location.assign('/projects');
		}
	};

	render() {
		const { children = null } = this.props;
		const { error, errorInfo, hasError, recoveringDynamicImport } = this.state;
		const dynamicImportError = isDynamicImportError(error);

		if (hasError) {
			if (dynamicImportError) {
				return (
					<div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900">
						<div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
							<h1 className="text-xl font-semibold">
								{recoveringDynamicImport ? 'Refreshing app modules' : 'Page module could not be loaded'}
							</h1>
							<p className="mt-2 text-sm leading-6 text-slate-600">
								{recoveringDynamicImport
									? 'The app is fetching the latest module bundle and will refresh automatically.'
									: 'The latest page bundle was not available. Try again, or return to Projects and reopen the workspace.'}
							</p>
							{!recoveringDynamicImport && (
								<div className="mt-4 flex flex-wrap gap-2">
									<button
										type="button"
										className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
										onClick={this.handleReload}
									>
										Refresh page
									</button>
									<button
										type="button"
										className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
										onClick={this.handleGoToProjects}
									>
										Open projects
									</button>
								</div>
							)}
						</div>
					</div>
				);
			}

			return (
				<div className="bg-white p-6 text-slate-900">
					<h1 className="text-2xl font-semibold">Something went wrong.</h1>
					<p className="text-base whitespace-pre-wrap">
						{error && error.toString()}
						<br />
						{errorInfo && errorInfo.componentStack}
					</p>
				</div>
			);
		}

		return children;
	}
}

export default ErrorBoundary;
