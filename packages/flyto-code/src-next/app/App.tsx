import { t } from '@lib/i18n';
import { useEffect, useState } from 'react';
import FuseLayout from '@fuse/core/FuseLayout';
import { SnackbarProvider, useSnackbar } from 'notistack';
import themeLayouts from 'src/components/theme-layouts/themeLayouts';
import FuseSettingsProvider from '@fuse/core/FuseSettings/FuseSettingsProvider';
import { I18nProvider } from '@i18n/I18nProvider';
import ErrorBoundary from '@fuse/utils/ErrorBoundary';
import { AuthProvider, useAuth } from '@hooks/useAuth';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@lib/queryClient';
import MainThemeProvider from '../contexts/MainThemeProvider';
import routes from '@/configs/routesConfig';
import AppContext from '@/contexts/AppContext';
import { FuseDialogContextProvider } from '@fuse/core/FuseDialog/contexts/FuseDialogContext/FuseDialogContextProvider';
import { NavbarContextProvider } from '@/components/theme-layouts/components/navbar/contexts/NavbarContext/NavbarContextProvider';
import RootThemeProvider from '@/contexts/RootThemeProvider';
import { NavigationContextProvider } from '@/components/theme-layouts/components/navigation/contexts/NavigationContextProvider';
import { Navigate, useLocation } from 'react-router';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

/**
 * Global error listeners — mounted once inside SnackbarProvider so every
 * unhandled mutation failure and auth expiry surfaces a toast. Also
 * picks up `flyto:entitlement-denied` events emitted by the engine
 * client when the backend rejects a request with a capability error
 * (feature_required / action_required / *_cap_exceeded). Centralising
 * the routing here means no individual fetch call site has to know
 * about toast wiring.
 */
function GlobalErrorListeners() {
	const { enqueueSnackbar } = useSnackbar();
	useEffect(() => {
		const onMutErr = (e: Event) => {
			const msg = (e as CustomEvent).detail || 'Operation failed';
			enqueueSnackbar(msg, { variant: 'error', preventDuplicate: true });
		};
		const onAuthExpired = () => {
			enqueueSnackbar(t('hardcoded.session.expired.please.sign.in.again.5af0406a'), { variant: 'warning', preventDuplicate: true });
		};
		const onEntitlement = (e: Event) => {
			const d = (e as CustomEvent).detail as {
				kind: string; feature?: string; action?: string; cap?: number; current?: number; plan?: string;
			} | null;
			if (!d) return;
			let msg: string;
			switch (d.kind) {
				case 'feature_required':
					msg = `Upgrade required: ${d.feature ?? 'this feature'} is not in your current plan.`;
					break;
				case 'action_required':
					msg = `Your role can't ${d.action ?? 'do this'}. Ask an admin.`;
					break;
				case 'seat_cap_exceeded':
					msg = `Seat limit reached (${d.current}/${d.cap} on ${d.plan ?? 'this'} plan).`;
					break;
				case 'repo_cap_exceeded':
					msg = `Repository limit reached (${d.current}/${d.cap} on ${d.plan ?? 'this'} plan).`;
					break;
				case 'domain_cap_exceeded':
					msg = `Domain limit reached (${d.current}/${d.cap} on ${d.plan ?? 'this'} plan).`;
					break;
				default:
					return;
			}
			enqueueSnackbar(msg, { variant: 'warning', autoHideDuration: 6000, preventDuplicate: true });
		};
		window.addEventListener('flyto:mutation-error', onMutErr);
		window.addEventListener('flyto:auth-expired', onAuthExpired);
		window.addEventListener('flyto:entitlement-denied', onEntitlement);
		return () => {
			window.removeEventListener('flyto:mutation-error', onMutErr);
			window.removeEventListener('flyto:auth-expired', onAuthExpired);
			window.removeEventListener('flyto:entitlement-denied', onEntitlement);
		};
	}, [enqueueSnackbar]);
	return null;
}

/** Auth guard — redirect to /sign-in if not logged in */
function RequireAuth({ children }: { children: React.ReactNode }) {
	const { user, loading } = useAuth();
	const location = useLocation();
	const [timedOut, setTimedOut] = useState(false);

	// 10-second timeout — if Firebase auth hangs (SDK init failure,
	// network partition), show a recovery prompt instead of spinning forever.
	useEffect(() => {
		if (!loading) { setTimedOut(false); return; }
		const t = setTimeout(() => setTimedOut(true), 10_000);
		return () => clearTimeout(t);
	}, [loading]);

	// Public routes — no auth needed. NOTE: /explore was originally
	// part of this list as a public lead-gen surface, removed during
	// the 2026-05-18 lockdown. The portal is now sign-in-only pending
	// legal review of publishing third-party security ratings without
	// consent. RequireAuth will redirect anonymous /explore traffic
	// to /sign-in.
	const publicPaths = ['/sign-in', '/sign-up', '/sign-out', '/404', '/401', '/security', '/trust', '/privacy', '/terms', '/beta', '/community'];
	const isPublic = publicPaths.some(p => location.pathname.startsWith(p));

	// Already logged in on a login page → redirect to projects
	if (isPublic && user && !loading) {
		return <Navigate to="/projects" replace />;
	}

	if (isPublic) {
		return <>{children}</>;
	}

	if (loading) {
		return (
			<Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 2 }}>
				<CircularProgress />
				{timedOut && (
					<Box sx={{ textAlign: 'center' }}>
						<Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
							{t('app.loadingSlow')}
						</Typography>
						<Button size="small" variant="outlined" onClick={() => window.location.reload()} sx={{ textTransform: 'none' }}>
							Refresh
						</Button>
					</Box>
				)}
			</Box>
		);
	}

	if (!user) {
		return <Navigate to="/sign-in" replace />;
	}

	return <>{children}</>;
}

function App() {
	return (
		<ErrorBoundary>
			<AppContext value={{ routes }}>
				<QueryClientProvider client={queryClient}>
					<AuthProvider>
						<FuseSettingsProvider>
							<I18nProvider>
								<RootThemeProvider>
									<MainThemeProvider>
										<NavbarContextProvider>
											<NavigationContextProvider>
												<FuseDialogContextProvider>
													<SnackbarProvider
														maxSnack={5}
														anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
														classes={{ containerRoot: 'bottom-0 right-0 mb-13 md:mb-17 mr-2 lg:mr-20 z-99' }}
													>
														<GlobalErrorListeners />
														<RequireAuth>
															<FuseLayout layouts={themeLayouts} />
														</RequireAuth>
													</SnackbarProvider>
												</FuseDialogContextProvider>
											</NavigationContextProvider>
										</NavbarContextProvider>
									</MainThemeProvider>
								</RootThemeProvider>
							</I18nProvider>
						</FuseSettingsProvider>
					</AuthProvider>
				</QueryClientProvider>
			</AppContext>
		</ErrorBoundary>
	);
}

export default App;
